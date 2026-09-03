// Vercel serverless function.
// Reads pending Shippo shipments straight from the Make.com "HAYCHIC Pending
// Shipments" Data Store, so the admin Orders tab can show shipping-label
// options (and let Hayden approve one) without needing the email
// Approve/Reject links. This is purely additive — it doesn't touch the
// existing Make scenarios or the email-based approval flow at all, so both
// paths keep working; whichever one is used first "wins" for a given order.
//
// Required environment variables (set in the Vercel dashboard):
//   MAKE_API_TOKEN  — Make.com API token, scope: datastores:read only
//                      (Profile > API access in Make, org 2667538)
//   ADMIN_SECRET    — same signing secret already used by api/admin.js, so
//                      this reuses the admin panel's existing login session
//
// The Make Data Store record shape (see the "Order placed" scenario's
// "Data store: Add/replace a record" module) is:
//   orderId, customerEmail, customerName, shippingPaid,
//   shippoRateId       — NOT one id despite the name: it's up to 3 Shippo
//                         rate objects, comma-separated with no wrapping
//                         brackets (Make's JSON-parse step downstream
//                         wraps it in "[" + value + "]" itself)
//   shippoRateAmount   — left blank in the existing scenario, unused here
//   shippoShipmentId, status
//
// A record here does NOT mean the label hasn't been bought yet — the
// existing email-flow scenario currently never deletes processed records
// (it's been inactive), so we cross-check against Firestore: any order
// that already has a trackingNumber, or that's been flagged for manual
// shipping via the Reject button, is left out of the response.

const crypto = require('crypto');

const FIREBASE_PROJECT_ID = 'haychic-boutique';
const FIREBASE_API_KEY = 'AIzaSyAoHJvYgKl0Z6Gok71OCmyoFPmFLHTXOJw';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

const MAKE_DATA_STORE_ID = '128938';
const MAKE_API_BASE = 'https://us2.make.com/api/v2';

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function verify(token) {
  if (!token) return null;
  const parts = String(token).split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = base64url(crypto.createHmac('sha256', process.env.ADMIN_SECRET).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// The Data Store's shippoRateId field holds 2-3 raw JSON objects joined by
// ", " with no enclosing brackets (see comment above) — so wrapping it in
// literal [ ] brackets and parsing gives back the array of rate objects.
function parseRates(raw) {
  if (!raw) return [];
  try {
    const arr = JSON.parse(`[${raw}]`);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.SITE_URL || 'https://haychicboutique.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!process.env.MAKE_API_TOKEN || !process.env.ADMIN_SECRET) {
    res.status(500).json({ error: 'Pending shipments are not configured on the server yet.' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!verify(token)) {
    res.status(401).json({ error: 'Your session expired. Please log in again.' });
    return;
  }

  try {
    const dsRes = await fetch(`${MAKE_API_BASE}/data-stores/${MAKE_DATA_STORE_ID}/data?pg[limit]=100`, {
      headers: { Authorization: `Token ${process.env.MAKE_API_TOKEN}` },
    });
    if (!dsRes.ok) {
      const text = await dsRes.text().catch(() => '');
      throw new Error(`Could not read pending shipments from Make: ${dsRes.status} ${text}`.slice(0, 300));
    }
    const dsData = await dsRes.json();
    const records = Array.isArray(dsData.records) ? dsData.records : [];

    // Cross-check against Firestore so already-approved or rejected orders
    // drop off the list, even though the Make record is still sitting
    // there (the old email-flow scenario never cleans these up).
    const results = [];
    for (const rec of records) {
      const d = rec.data || rec;
      const orderId = d.orderId;
      if (!orderId) continue;

      let orderFields = {};
      try {
        const orderRes = await fetch(
          `${FIRESTORE_BASE}/orders/${encodeURIComponent(orderId)}?key=${FIREBASE_API_KEY}`
        );
        if (orderRes.ok) {
          const orderDoc = await orderRes.json();
          orderFields = orderDoc.fields || {};
        }
      } catch (e) {
        // If the order doc can't be read, fall through and still show the
        // pending shipment rather than silently dropping it.
      }

      const trackingNumber = orderFields.trackingNumber?.stringValue || '';
      const shippingLabelStatus = orderFields.shippingLabelStatus?.stringValue || '';
      // Hayden can also mark an order Shipped/Delivered by hand from the
      // Orders tab status dropdown (no tracking number required — e.g. a
      // hand-delivered or already-shipped-elsewhere order). Trust that
      // too, so it drops off the pending-approval list instead of nagging
      // for a label that was never going to be bought here.
      const orderStatus = orderFields.status?.stringValue || '';
      if (trackingNumber || shippingLabelStatus === 'manual' || orderStatus === 'shipped' || orderStatus === 'delivered') continue;

      const rates = parseRates(d.shippoRateId).map((r) => ({
        id: r.object_id,
        provider: r.provider,
        serviceName: r.servicelevel && r.servicelevel.name,
        amount: r.amount,
        currency: r.currency,
        estimatedDays: r.estimated_days,
        attributes: r.attributes || [],
      })).filter((r) => r.id);

      if (!rates.length) continue;

      results.push({
        orderId,
        customerName: d.customerName || '',
        customerEmail: d.customerEmail || '',
        shippingPaid: d.shippingPaid || '',
        shipmentId: d.shippoShipmentId || '',
        rates,
      });
    }

    res.status(200).json({ pending: results });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Something went wrong reading pending shipments.' });
  }
};
