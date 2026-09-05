// Vercel serverless function.
// Powers track-order.html: a customer types their order number (the Stripe
// Checkout session ID, shown on the success page and in their confirmation
// email) plus the email they checked out with, and this looks the order up
// in Firestore and returns just enough to show status/tracking — never the
// full shipping address or any other customer's data.
//
// No new environment variables needed — reuses the same public Firebase Web
// API key already embedded in assets/js/firebase-config.js (Firestore
// access is governed by security rules, not this key). See
// ORDER-TRACKING-SETUP.md for the Firestore rule this endpoint needs.

const { rateLimit } = require('./_rateLimit');

const FIREBASE_PROJECT_ID = 'haychic-boutique';
const FIREBASE_API_KEY = 'AIzaSyAoHJvYgKl0Z6Gok71OCmyoFPmFLHTXOJw';
const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID + '/databases/(default)/documents';

const SITE_URL = process.env.SITE_URL || 'https://haychicboutique.com';

// Converts Firestore's typed REST JSON (fields: {name: {stringValue: ...}})
// back into a plain JS object.
function fromFirestoreValue(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('doubleValue' in v) return v.doubleValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue' in v) return fromFirestoreFields(v.mapValue.fields || {});
  return null;
}
function fromFirestoreFields(fields) {
  const obj = {};
  for (const key of Object.keys(fields || {})) obj[key] = fromFirestoreValue(fields[key]);
  return obj;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', SITE_URL);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // Rate-limit: 10 requests per minute per IP.
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || 'unknown';
  const rl = rateLimit(ip, 10, 60000);
  if (rl.limited) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
  }

  const orderId = String((req.method === 'GET' ? req.query.orderId : req.body && req.body.orderId) || '').trim();
  const email = String((req.method === 'GET' ? req.query.email : req.body && req.body.email) || '').trim().toLowerCase();

  if (!orderId || !email) {
    res.status(400).json({ error: 'Enter both your order number and the email you checked out with.' });
    return;
  }

  try {
    const url = FIRESTORE_BASE + '/orders/' + encodeURIComponent(orderId) + '?key=' + FIREBASE_API_KEY;
    const ghRes = await fetch(url);

    if (ghRes.status === 404) {
      res.status(404).json({ error: "We couldn't find an order with that number. Double-check it and try again, or reach out on the Support page." });
      return;
    }
    if (!ghRes.ok) {
      throw new Error('Firestore lookup failed: ' + ghRes.status);
    }

    const doc = await ghRes.json();
    const order = fromFirestoreFields(doc.fields || {});

    if (!order.email || String(order.email).trim().toLowerCase() !== email) {
      // Same message as 'not found' on purpose — don't confirm an order
      // number is real to someone who doesn't also know the email on it.
      res.status(404).json({ error: "We couldn't find an order with that number and email combination. Double-check both and try again." });
      return;
    }

    res.status(200).json({
      orderId,
      status: order.status || 'processing',
      trackingNumber: order.trackingNumber || '',
      trackingCarrier: order.trackingCarrier || '',
      customerName: order.customerName || '',
      shippingMethod: order.shippingMethod || '',
      amountTotal: order.amountTotal || '',
      items: Array.isArray(order.items) ? order.items : [],
      createdAt: order.createdAt || '',
      updatedAt: order.updatedAt || '',
    });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong looking up your order. Please try again in a moment.' });
  }
};
