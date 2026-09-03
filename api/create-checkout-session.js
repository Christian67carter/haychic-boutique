// Vercel serverless function.
// Receives the shopping bag from haychicboutique.com and creates a Stripe
// Checkout Session with the items as dynamic line items, then returns the
// hosted checkout URL for the browser to redirect to.
//
// Required environment variable (set in the Vercel dashboard, never in code):
//   STRIPE_SECRET_KEY   — starts with sk_live_... or sk_test_...
//
// Optional environment variables:
//   SITE_URL         — defaults to https://haychicboutique.com. Used to
//                       build the success/cancel redirect URLs.
//   SHIPPO_API_KEY    — starts with shippo_live_... or shippo_test_...
//                       When set, shipping cost at checkout is a live rate
//                       quote from Shippo (same carrier account Hayden
//                       approves real labels from in Make), so what the
//                       customer pays matches what the label actually
//                       costs. If unset, or if the live lookup fails for
//                       any reason, checkout falls back to flat estimated
//                       rates so a shipper hiccup never blocks a sale.
//
// The Stripe Checkout page's colors/logo are themed via the Stripe
// Dashboard (Settings > Branding) to match HAYCHIC's pink/gold palette —
// see CHECKOUT-SETUP.md.

const Stripe = require('stripe');

const SITE_URL = process.env.SITE_URL || 'https://haychicboutique.com';
// Only allow requests from the actual storefront.
const ALLOWED_ORIGIN = SITE_URL;

// HAYCHIC's real ship-from address — same info configured in the Make.com
// Shippo "Create a Shipment" module, kept in sync manually.
const ADDRESS_FROM = {
  name: 'HAYCHIC Boutique',
  street1: '3158 Beacon Hill Road',
  city: 'Abilene',
  state: 'TX',
  zip: '79601',
  country: 'US',
  phone: '325-513-9203',
  email: 'hayden@haychicboutique.com',
};

// Same standard box Make's Shippo module quotes/labels with, so the price
// shown at checkout matches the label Hayden actually buys.
const PARCEL = {
  length: '10',
  width: '8',
  height: '4',
  distance_unit: 'in',
  weight: '1',
  mass_unit: 'lb',
};

// Fetch with a hard timeout so a slow/hung third-party API never stalls
// checkout — callers should catch and fall back on any rejection.
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const PRODUCTS_URL = 'https://raw.githubusercontent.com/Christian67carter/haychic-boutique/main/products.json';

// Turns a display price like "$70.00" into integer cents. Same parsing
// approach as parsePriceToCents() in script.js, kept in sync manually.
function parsePriceToCents(priceStr) {
  const n = parseFloat(String(priceStr || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

// Fetches the live product catalog so prices and availability are always
// verified against the source of truth — never trusted from the client.
async function fetchProducts() {
  const res = await fetchWithTimeout(PRODUCTS_URL, { cache: 'no-store' }, 5000);
  if (!res.ok) throw new Error(`products.json fetch failed (${res.status})`);
  return res.json();
}

// Resolves a US ZIP to city/state via a free public lookup (zippopotam.us)
// so the checkout form only ever has to ask for a ZIP code, same as today.
async function resolveCityState(zip) {
  const res = await fetchWithTimeout(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`, {}, 4000);
  if (!res.ok) throw new Error(`ZIP lookup failed (${res.status})`);
  const data = await res.json();
  const place = data.places && data.places[0];
  if (!place) throw new Error('ZIP lookup returned no place');
  return {
    city: place['place name'],
    state: place['state abbreviation'],
  };
}

// Gets a live shipping quote from Shippo for the given destination ZIP.
// Returns { regular, express } (express may be null if only one useful
// rate came back), or null if a live quote couldn't be obtained for any
// reason — callers should fall back to flat rates in that case.
async function getLiveShippingOptions(zip) {
  if (!process.env.SHIPPO_API_KEY) return null;

  const { city, state } = await resolveCityState(zip);

  const res = await fetchWithTimeout('https://api.goshippo.com/shipments/', {
    method: 'POST',
    headers: {
      Authorization: `ShippoToken ${process.env.SHIPPO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      address_from: ADDRESS_FROM,
      // Street isn't needed for domestic rate-shopping (carriers rate by
      // ZIP/zone) — the customer's real street address is collected by
      // Stripe Checkout itself right after this, for the actual label.
      address_to: { name: 'Customer', street1: 'N/A', city, state, zip, country: 'US' },
      parcels: [PARCEL],
      async: false,
    }),
  }, 6000);

  if (!res.ok) throw new Error(`Shippo rate request failed (${res.status})`);
  const shipment = await res.json();

  const rates = (shipment.rates || [])
    .filter((r) => r.amount && Number.isFinite(parseFloat(r.amount)))
    .map((r) => ({
      cents: Math.round(parseFloat(r.amount) * 100),
      label: `${r.provider} ${r.servicelevel && r.servicelevel.name ? r.servicelevel.name : ''}`.trim(),
      minDays: r.estimated_days || 3,
    }))
    // Sanity guard: ignore anything free or implausibly expensive rather
    // than charging a broken quote.
    .filter((r) => r.cents > 0 && r.cents < 5000);

  if (rates.length === 0) return null;

  rates.sort((a, b) => a.cents - b.cents);
  const cheapest = rates[0];
  const fastest = rates.reduce((best, r) => (r.minDays < best.minDays ? r : best), rates[0]);

  return {
    regular: {
      amount: cheapest.cents,
      display_name: cheapest.label || 'Standard Shipping',
      minDays: cheapest.minDays,
      maxDays: cheapest.minDays + 2,
    },
    express: fastest.cents !== cheapest.cents ? {
      amount: fastest.cents,
      display_name: fastest.label || 'Express Shipping',
      minDays: fastest.minDays,
      maxDays: fastest.minDays,
    } : null,
  };
}

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

    // Rebuild line items server-side from the live product catalog so
    // nothing from the client — including price — is ever trusted
    // directly. A tampered request can send any unitAmount it wants; it's
    // ignored, and the real price is looked up by productId instead.
    let products;
    try {
      products = await fetchProducts();
    } catch (err) {
      console.error('Could not load products.json for price verification:', err.message);
      res.status(502).json({ error: 'Could not verify item prices right now. Please try again in a moment.' });
      return;
    }
    const productsById = new Map(products.map((p) => [p.id, p]));

    const line_items = items.map((item) => {
      const productId = String(item.productId || '').slice(0, 200);
      const colorName = String(item.colorName || '').slice(0, 200);
      const sizeName = String(item.sizeName || '').slice(0, 200);
      const quantity = Math.max(1, Math.min(20, Math.round(Number(item.quantity)) || 1));

      const product = productsById.get(productId);
      if (!product) {
        throw new Error('One of the items in your bag is no longer available. Please refresh the page and try again.');
      }

      const name = String(product.name || 'HAYCHIC item').slice(0, 200);
      const unitAmount = parsePriceToCents(product.price);

      if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
        throw new Error(`"${name}" doesn't have a valid price yet. Ask Hayden to update it in the admin panel before this item can be sold online.`);
      }

      // Re-check availability server-side too. The product grid and
      // product page already hide sold-out variants from Add to Bag, but
      // that's a UI convenience, not enforcement — a tampered request
      // could otherwise still buy something that's actually sold out.
      const colorEntry = colorName ? (product.colors || []).find((c) => c.name === colorName) : null;
      const sizeEntry = sizeName ? (product.sizes || []).find((s) => s.name === sizeName) : null;
      const activeStatus = (sizeEntry && sizeEntry.status) || (colorEntry && colorEntry.status) || product.status;
      if (activeStatus === 'sold-out') {
        throw new Error(`"${name}"${colorName ? ` in ${colorName}` : ''} just sold out. Please remove it from your bag and try again.`);
      }

      // Carry the product/variant identity through Stripe so the order
      // webhook can match purchased line items back to products.json and
      // decrement inventory automatically. Stripe metadata values must be
      // strings and are capped at 500 chars, so these are trimmed/short.
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
    const cleanZip = String(zip || '').trim();

    // Try a live Shippo quote first so the customer is charged what the
    // label actually costs; fall back to flat estimates on any failure
    // (missing key, bad ZIP, Shippo/network hiccup, timeout) so checkout
    // never breaks over a shipping-quote problem.
    let liveRates = null;
    if (cleanZip && !isAbileneZip) {
      try {
        liveRates = await getLiveShippingOptions(cleanZip);
      } catch (err) {
        console.error('Live Shippo rate lookup failed, using flat rates:', err.message);
        liveRates = null;
      }
    }

    const shipping_options = liveRates ? [
      {
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: liveRates.regular.amount, currency: 'usd' },
          display_name: liveRates.regular.display_name,
          delivery_estimate: {
            minimum: { unit: 'business_day', value: liveRates.regular.minDays },
            maximum: { unit: 'business_day', value: liveRates.regular.maxDays },
          },
        },
      },
    ] : [
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

    if (liveRates && liveRates.express) {
      shipping_options.push({
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: liveRates.express.amount, currency: 'usd' },
          display_name: liveRates.express.display_name,
          delivery_estimate: {
            minimum: { unit: 'business_day', value: liveRates.express.minDays },
            maximum: { unit: 'business_day', value: liveRates.express.maxDays },
          },
        },
      });
    }

    if (isAbileneZip) {
      shipping_options.splice(1, 0, {
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: 550, currency: 'usd' },
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
