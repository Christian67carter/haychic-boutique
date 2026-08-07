// Vercel serverless function.
// Receives the shopping bag from haychicboutique.com and creates a Stripe
// Checkout Session with the items as dynamic line items, then returns the
// hosted checkout URL for the browser to redirect to.
//
// Required environment variable (set in the Vercel dashboard, never in code):
//   STRIPE_SECRET_KEY   — starts with sk_live_... or sk_test_...
//
// Optional environment variable:
//   SITE_URL — defaults to https://haychicboutique.com. Used to build the
//              success/cancel redirect URLs.
//
// The Stripe Checkout page's colors/logo are themed via the Stripe
// Dashboard (Settings > Branding) to match HAYCHIC's pink/gold palette —
// see CHECKOUT-SETUP.md.

const Stripe = require('stripe');

const SITE_URL = process.env.SITE_URL || 'https://haychicboutique.com';
// Only allow requests from the actual storefront.
const ALLOWED_ORIGIN = SITE_URL;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    res.status(500).json({ error: 'Stripe is not configured on the server yet.' });
    return;
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const { items } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Your bag is empty.' });
      return;
    }

    // Rebuild line items server-side so nothing from the client is trusted
    // directly as a price. unitAmount must be a positive integer (cents).
    const line_items = items.map((item) => {
      const name = String(item.name || 'HAYCHIC item').slice(0, 200);
      const unitAmount = Math.round(Number(item.unitAmount));
      const quantity = Math.max(1, Math.min(20, Math.round(Number(item.quantity)) || 1));

      if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
        throw new Error(`"${name}" doesn't have a valid price yet. Ask Hayden to update it in the admin panel before this item can be sold online.`);
      }

      return {
        price_data: {
          currency: 'usd',
          product_data: { name },
          unit_amount: unitAmount,
        },
        quantity,
      };
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      shipping_address_collection: { allowed_countries: ['US'] },
      success_url: `${SITE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/index.html#shop`,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not start checkout.' });
  }
};
