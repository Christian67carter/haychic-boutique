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
    const { items, zip, instagram } = req.body || {};

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

      // Carry the product/variant identity through Stripe so the order
      // webhook can match purchased line items back to products.json and
      // decrement inventory automatically. Stripe metadata values must be
      // strings and are capped at 500 chars, so these are trimmed/short.
      const productId = String(item.productId || '').slice(0, 200);
      const colorName = String(item.colorName || '').slice(0, 200);
      const sizeName = String(item.sizeName || '').slice(0, 200);

      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name,
            metadata: { productId, colorName, sizeName },
          },
          unit_amount: unitAmount,
        },
        quantity,
      };
    });

    // "Local Delivery" is only offered when the shopper's ZIP is inside
    // Abilene, TX. This is self-reported at checkout (not verified against
    // the address they type later in Stripe Checkout), so it's a soft gate,
    // not a hard guarantee — but it's more accurate than guessing from IP.
    const ABILENE_TX_ZIPS = new Set([
      '79601', '79602', '79603', '79604', '79605',
      '79606', '79607', '79608', '79697', '79698', '79699',
    ]);
    const isAbileneZip = ABILENE_TX_ZIPS.has(String(zip || '').trim());

    const shipping_options = [
      {
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: 899, currency: 'usd' },
          display_name: 'Regular Shipping',
          delivery_estimate: {
            minimum: { unit: 'business_day', value: 5 },
            maximum: { unit: 'business_day', value: 7 },
          },
        },
      },
      {
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: 1399, currency: 'usd' },
          display_name: 'Express Shipping',
          delivery_estimate: {
            minimum: { unit: 'business_day', value: 2 },
            maximum: { unit: 'business_day', value: 3 },
          },
        },
      },
    ];

    if (isAbileneZip) {
      shipping_options.splice(1, 0, {
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: 699, currency: 'usd' },
          display_name: 'Local Delivery (Abilene, TX)',
          delivery_estimate: {
            minimum: { unit: 'business_day', value: 1 },
            maximum: { unit: 'business_day', value: 2 },
          },
        },
      });
    }

    // Optional — shown as "Instagram / TikTok" in the bag before checkout,
    // captured so Hayden has one place to look up a customer's handle
    // alongside their order, same as the access-request and support forms.
    const instagramHandle = String(instagram || '').trim().slice(0, 100);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      metadata: instagramHandle ? { instagram: instagramHandle } : undefined,
      shipping_address_collection: { allowed_countries: ['US'] },
      shipping_options,
      // Lets shoppers enter a discount code Hayden creates in the Stripe
      // Dashboard (Product catalog > Coupons / Promotion codes) — no extra
      // backend code needed to validate or apply them.
      allow_promotion_codes: true,
      success_url: `${SITE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/shop.html`,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not start checkout.' });
  }
};
