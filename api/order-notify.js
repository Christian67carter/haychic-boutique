// Vercel serverless function.
// Stripe webhook receiver: fires automatically whenever a checkout session
// completes (a customer finishes paying). It pulls the order together —
// customer name, shipping address, shipping method, and the items bought —
// and forwards it as JSON to a Make (Integromat) webhook. From there, Make
// can email/text Hayden and/or drop a row into a Google Sheet formatted for
// Pirate Ship's "Import Orders" CSV, so buying a label is close to a single
// click. See SHIPPING-SETUP.md for the full walkthrough.
//
// Also handles checkout.session.expired (fires automatically ~24h after a
// shopper starts checkout without paying) to forward an "abandoned cart"
// alert to the same Make webhook, tagged type: "cart_abandoned", so a
// recovery email can go out. Reuses MAKE_WEBHOOK_URL — no new credentials.
//
// ONE MANUAL STEP still needed for abandoned-cart alerts to actually fire:
// in the Stripe Dashboard under Developers > Webhooks, open this endpoint
// and add the "checkout.session.expired" event (it's probably only sending
// checkout.session.completed right now). Everything else — the code here,
// and reusing the existing Make webhook — is already wired up.
//
// Required environment variables (set in the Vercel dashboard):
//   STRIPE_SECRET_KEY      — same key already used for checkout
//   STRIPE_WEBHOOK_SECRET  — from Stripe Dashboard > Developers > Webhooks
//                             (created when you add this endpoint there)
//   MAKE_WEBHOOK_URL       — the "Custom Webhook" trigger URL from your
//                             Make scenario (see SHIPPING-SETUP.md)
//   GITHUB_TOKEN           — same fine-grained token used by api/admin.js
//                             (Contents: Read and write on this repo) — used
//                             here to auto-decrement inventory on purchase

const Stripe = require('stripe');

// Same public Firebase Web API key already embedded client-side in
// assets/js/firebase-config.js — Firestore access is governed by security
// rules, not this key, so reusing it here needs no new secret. Used to save
// a copy of each order so the admin panel can attach a tracking number and
// customers can look up their order status (see api/track-order.js).
const FIREBASE_PROJECT_ID = 'haychic-boutique';
const FIREBASE_API_KEY = 'AIzaSyAoHJvYgKl0Z6Gok71OCmyoFPmFLHTXOJw';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

// Converts a plain JS value into Firestore's typed REST JSON format.
function toFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFirestoreValue) } };
  if (typeof v === 'object') return { mapValue: { fields: toFirestoreFields(v) } };
  return { stringValue: String(v) };
}
function toFirestoreFields(obj) {
  const fields = {};
  for (const key of Object.keys(obj)) fields[key] = toFirestoreValue(obj[key]);
  return fields;
}

// Creates (or overwrites) the orders/{orderId} doc. Runs in its own
// try/catch wherever it's called so a Firestore hiccup can never take down
// the order notification itself — the payment already succeeded either way.
async function saveOrderToFirestore(orderId, data) {
  const url = `${FIRESTORE_BASE}/orders/${encodeURIComponent(orderId)}?key=${FIREBASE_API_KEY}`;
  const body = JSON.stringify({
    fields: toFirestoreFields({
      ...data,
      status: 'processing',
      trackingNumber: '',
      trackingCarrier: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  });
  const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Firestore order save failed: ${res.status} ${text}`.slice(0, 300));
  }
}

// Stripe needs the raw, unparsed request body to verify the webhook
// signature, so we turn off Vercel's automatic JSON body parsing for this
// function only.
module.exports.config = { api: { bodyParser: false } };

const OWNER = 'Christian67carter';
const REPO = 'haychic-boutique';
const BRANCH = 'main';
const GITHUB_API = `https://api.github.com/repos/${OWNER}/${REPO}`;

function buffer(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on('data', (chunk) => chunks.push(chunk));
    readable.on('end', () => resolve(Buffer.concat(chunks)));
    readable.on('error', reject);
  });
}

function ghHeaders() {
  return {
    Authorization: `token ${process.env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'haychic-order-notify',
  };
}

// Subtracts `qtyPurchased` from a product/color/size entry's `qty`, floored
// at 0, and flips it from "in-stock" to "preorder" the same way the admin
// panel does when qty hits 0. Returns true if it actually changed anything
// (entries without a tracked qty are left alone).
function decrementEntryQty(entry, qtyPurchased) {
  if (!entry || typeof entry.qty !== 'number') return false;
  const next = Math.max(0, entry.qty - qtyPurchased);
  if (next === entry.qty) return false;
  entry.qty = next;
  if (next === 0 && entry.status === 'in-stock') entry.status = 'preorder';
  return true;
}

// Reads products.json, decrements qty for each purchased product/variant,
// and writes it back via the GitHub Contents API — same read-sha-write
// pattern used by api/admin.js. Throws on failure; callers should catch so
// a GitHub hiccup never breaks the Stripe webhook response.
async function decrementInventory(purchasedItems, orderId) {
  if (!process.env.GITHUB_TOKEN || purchasedItems.length === 0) return;

  const r = await fetch(`${GITHUB_API}/contents/products.json?ref=${BRANCH}`, { headers: ghHeaders() });
  if (!r.ok) throw new Error('Could not load products.json for inventory update.');
  const data = await r.json();
  const products = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));

  let changed = false;
  for (const item of purchasedItems) {
    const product = products.find((p) => p.id === item.productId);
    if (!product) continue;

    let touched = false;
    if (item.colorName && Array.isArray(product.colors)) {
      const color = product.colors.find((c) => c.name === item.colorName);
      if (color) touched = decrementEntryQty(color, item.quantity) || touched;
    }
    if (item.sizeName && Array.isArray(product.sizes)) {
      const size = product.sizes.find((s) => s.name === item.sizeName);
      if (size) touched = decrementEntryQty(size, item.quantity) || touched;
    }
    // Only fall back to the top-level product qty when no variant-level qty
    // was tracked, so buying one colorway doesn't also decrement the base
    // product count when they're meant to be tracked separately.
    if (!touched) touched = decrementEntryQty(product, item.quantity) || touched;
    if (touched) changed = true;
  }

  if (!changed) return;

  const putRes = await fetch(`${GITHUB_API}/contents/products.json`, {
    method: 'PUT',
    headers: ghHeaders(),
    body: JSON.stringify({
      message: `Auto-update inventory from order ${orderId}`,
      content: Buffer.from(JSON.stringify(products, null, 2)).toString('base64'),
      sha: data.sha,
      branch: BRANCH,
    }),
  });
  if (!putRes.ok) {
    const errData = await putRes.json().catch(() => ({}));
    throw new Error(errData.message || 'Could not save inventory update.');
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    // Stripe still needs a 200-ish response or it'll keep retrying, but log
    // clearly so this is easy to spot in Vercel's function logs.
    console.error('order-notify: STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET missing.');
    res.status(200).json({ received: true, warning: 'Webhook not fully configured yet.' });
    return;
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];
  const rawBody = await buffer(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    res.status(400).send(`Webhook signature verification failed: ${err.message}`);
    return;
  }

  if (event.type === 'checkout.session.completed') {
    try {
      // Re-fetch with line items + shipping rate expanded — the webhook
      // event payload alone doesn't include these. Also expand each line
      // item's underlying product so we can read back the productId/
      // colorName/sizeName metadata attached at checkout time (see
      // create-checkout-session.js) for the inventory auto-decrement below.
      const session = await stripe.checkout.sessions.retrieve(event.data.object.id, {
        expand: ['line_items.data.price.product', 'shipping_cost.shipping_rate'],
      });

      const shipping = session.shipping_details || session.customer_details || {};
      const address = shipping.address || {};

      const payload = {
        type: 'order',
        orderId: session.id,
        orderUrl: `https://dashboard.stripe.com/payments/${session.payment_intent}`,
        customerName: shipping.name || session.customer_details?.name || '',
        email: session.customer_details?.email || '',
        instagram: session.metadata?.instagram || '',
        addressLine1: address.line1 || '',
        addressLine2: address.line2 || '',
        city: address.city || '',
        state: address.state || '',
        zip: address.postal_code || '',
        country: address.country || 'US',
        shippingMethod: session.shipping_cost?.shipping_rate?.display_name || '',
        shippingPaid: session.shipping_cost ? (session.shipping_cost.amount_total / 100).toFixed(2) : '0.00',
        amountTotal: (session.amount_total / 100).toFixed(2),
        items: (session.line_items?.data || []).map((li) => {
          const meta = (li.price && li.price.product && li.price.product.metadata) || {};
          return {
            name: li.description,
            quantity: li.quantity,
            amount: (li.amount_total / 100).toFixed(2),
            colorName: meta.colorName || '',
            sizeName: meta.sizeName || '',
          };
        }),
      };

      if (process.env.MAKE_WEBHOOK_URL) {
        await fetch(process.env.MAKE_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        console.error('order-notify: MAKE_WEBHOOK_URL not set, order not forwarded.', payload);
      }

      // Save a copy of the order to Firestore so the admin panel can attach
      // a tracking number once a label's bought, and so customers can look
      // up their own order status/tracking on track-order.html. Own
      // try/catch so a Firestore hiccup never blocks the notification above.
      try {
        await saveOrderToFirestore(session.id, {
          customerName: payload.customerName,
          email: payload.email,
          instagram: payload.instagram,
          addressLine1: payload.addressLine1,
          addressLine2: payload.addressLine2,
          city: payload.city,
          state: payload.state,
          zip: payload.zip,
          country: payload.country,
          shippingMethod: payload.shippingMethod,
          amountTotal: payload.amountTotal,
          items: payload.items,
        });
      } catch (err) {
        console.error('order-notify: failed to save order to Firestore:', err.message);
      }

      // Auto-decrement inventory for whatever was actually purchased. This
      // runs in its own try/catch below (not this one) so a GitHub hiccup
      // here can never take down the order notification above, or vice
      // versa — the payment already succeeded either way.
      const purchasedItems = (session.line_items?.data || [])
        .map((li) => {
          const meta = (li.price && li.price.product && li.price.product.metadata) || {};
          return {
            productId: meta.productId || '',
            colorName: meta.colorName || '',
            sizeName: meta.sizeName || '',
            quantity: li.quantity || 0,
          };
        })
        .filter((i) => i.productId);

      try {
        await decrementInventory(purchasedItems, session.id);
      } catch (err) {
        console.error('order-notify: failed to auto-decrement inventory:', err.message);
      }
    } catch (err) {
      // Don't fail the Stripe webhook response over a notification hiccup —
      // Stripe will keep retrying this webhook if we return an error, and
      // the payment itself already succeeded either way. Just log it.
      console.error('order-notify: failed to build/send notification:', err.message);
    }
  }

  if (event.type === 'checkout.session.expired') {
    try {
      const session = event.data.object;

      // Only worth a recovery email if we actually have a way to reach them.
      const email = session.customer_details?.email || session.customer_email || '';
      if (!email) {
        res.status(200).json({ received: true });
        return;
      }

      // Line items aren't included on the expired-session payload itself,
      // so fetch them separately — this works even though the session was
      // never completed, since items are attached at creation time.
      let items = [];
      try {
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 50 });
        items = (lineItems.data || []).map((li) => ({
          name: li.description,
          quantity: li.quantity,
          amount: (li.amount_total / 100).toFixed(2),
        }));
      } catch (err) {
        console.error('order-notify: could not list line items for abandoned cart:', err.message);
      }

      const payload = {
        type: 'cart_abandoned',
        sessionId: session.id,
        email,
        customerName: session.customer_details?.name || '',
        amountTotal: session.amount_total != null ? (session.amount_total / 100).toFixed(2) : '',
        items,
        checkoutUrl: session.url || '',
        expiredAt: new Date().toISOString(),
      };

      if (process.env.MAKE_WEBHOOK_URL) {
        await fetch(process.env.MAKE_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        console.error('order-notify: MAKE_WEBHOOK_URL not set, abandoned cart not forwarded.', payload);
      }
    } catch (err) {
      console.error('order-notify: failed to build/send abandoned-cart notification:', err.message);
    }
  }

  res.status(200).json({ received: true });
};
