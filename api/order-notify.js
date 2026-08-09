// Vercel serverless function.
// Stripe webhook receiver: fires automatically whenever a checkout session
// completes (a customer finishes paying). It pulls the order together —
// customer name, shipping address, shipping method, and the items bought —
// and forwards it as JSON to a Make (Integromat) webhook. From there, Make
// can email/text Hayden and/or drop a row into a Google Sheet formatted for
// Pirate Ship's "Import Orders" CSV, so buying a label is close to a single
// click. See SHIPPING-SETUP.md for the full walkthrough.
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
        orderId: session.id,
        orderUrl: `https://dashboard.stripe.com/payments/${session.payment_intent}`,
        customerName: shipping.name || session.customer_details?.name || '',
        email: session.customer_details?.email || '',
        addressLine1: address.line1 || '',
        addressLine2: address.line2 || '',
        city: address.city || '',
        state: address.state || '',
        zip: address.postal_code || '',
        country: address.country || 'US',
        shippingMethod: session.shipping_cost?.shipping_rate?.display_name || '',
        shippingPaid: session.shipping_cost ? (session.shipping_cost.amount_total / 100).toFixed(2) : '0.00',
        amountTotal: (session.amount_total / 100).toFixed(2),
        items: (session.line_items?.data || []).map((li) => ({
          name: li.description,
          quantity: li.quantity,
          amount: (li.amount_total / 100).toFixed(2),
        })),
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

  res.status(200).json({ received: true });
};
