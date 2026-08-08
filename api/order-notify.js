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

const Stripe = require('stripe');

// Stripe needs the raw, unparsed request body to verify the webhook
// signature, so we turn off Vercel's automatic JSON body parsing for this
// function only.
module.exports.config = { api: { bodyParser: false } };

function buffer(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on('data', (chunk) => chunks.push(chunk));
    readable.on('end', () => resolve(Buffer.concat(chunks)));
    readable.on('error', reject);
  });
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
      // event payload alone doesn't include these.
      const session = await stripe.checkout.sessions.retrieve(event.data.object.id, {
        expand: ['line_items', 'shipping_cost.shipping_rate'],
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
    } catch (err) {
      // Don't fail the Stripe webhook response over a notification hiccup —
      // Stripe will keep retrying this webhook if we return an error, and
      // the payment itself already succeeded either way. Just log it.
      console.error('order-notify: failed to build/send notification:', err.message);
    }
  }

  res.status(200).json({ received: true });
};
