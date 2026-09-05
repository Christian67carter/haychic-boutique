// Vercel serverless function.
// Reads pending Shippo shipments straight from the Make.com 'HAYCHIC Pending
// Shipments' Data Store, so the admin Orders tab can show shipping-label
// options (and let Hayden approve one) without needing the email
// Approve/Reject links. This is purely additive — it doesn't touch the
// existing Make scenarios or the email-based approval flow at all, so both
// paths keep working; whichever one is used first 'wins' for a given order.
//
// Required environment variables (set in the Vercel dashboard):
//   MAKE_API_TOKEN  — Make.com API token, scope: datastores:read only
//                      (Profile > API access in Make, org 2667538)
//   ADMIN_SECRET    — same signing secret already used by api/admin.js, so
//                      this reuses the admin panel's existing login session

const crypto = require('crypto');
const Sentry = require('./_sentry');
const { rateLimit } = require('./_rateLimit');

const FIREBASE_PROJECT_ID = 'haychic-boutique';
const FIREBASE_API_KEY = 'AIzaSyAoHJvYgKl0Z6Gok71OCmyoFPmFLHTXOJw';
const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID + '/databases/(default)/documents';

const MAKE_DATA_STORE_ID = '128938';
const MAKE_API_BASE = 'https://us2.make.com/api/v2';

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
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

function parseRates(raw) {
  if (!raw) return [];
  try {
    const arr = JSON.parse('[' + raw + ']');
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

  // Rate-limit: 20 requests per minute per IP (admin polling endpoint).
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || 'unknown';
  const rl = rateLimit(ip, 20, 60000);
  if (rl.limited) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
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
    const dsRes = await fetch(MAKE_API_BASE + '/data-stores/' + MAKE_DATA_STORE_ID + '/data?pg[limit]=100', {
      headers: { Authorization: 'Token ' + process.env.MAKE_API_TOKEN },
    });
    if (!dsRes.ok) {
      const text = await dsRes.text().catch(() => '');
      throw new Error(('Could not read pending shipments from Make: ' + dsRes.status + ' ' + text).slice(0, 300));
    }
    const dsData = await dsRes.json();
    const records = Array.isArray(dsData.records) ? dsData.records : [];

    const results = [];
    for (const rec of records) {
      const d = rec.data || rec;
      const orderId = d.orderId;
      if (!orderId) continue;

      let orderFields = {};
      try {
        const orderRes = await fetch(
          FIRESTORE_BASE + '/orders/' + encodeURIComponent(orderId) + '?key=' + FIREBASE_API_KEY
        );
        if (orderRes.ok) {
          const orderDoc = await orderRes.json();
          orderFields = orderDoc.fields || {};
        }
      } catch (e) {
        // If the order doc can't be read, fall through and still show the
        // pending shipment rather than silently dropping it.
      }

      const trackingNumber = (orderFields.trackingNumber && orderFields.trackingNumber.stringValue) || '';
      const shippingLabelStatus = (orderFields.shippingLabelStatus && orderFields.shippingLabelStatus.stringValue) || '';
      const orderStatus = (orderFields.status && orderFields.status.stringValue) || '';
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
    Sentry.captureException(err);
  res.status(500).json({ error: err.message || 'Something went wrong reading pending shipments.' });
  }
};
