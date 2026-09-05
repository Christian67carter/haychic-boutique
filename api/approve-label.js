// Vercel serverless function.
// Lets the admin panel's Orders tab buy a Shippo shipping label directly —
// an in-site alternative to the email Approve link. Purely additive: it
// doesn't touch the existing Make scenarios, so the email flow (once
// reactivated) still works too; whichever path runs first for a given
// order 'wins', since both end by writing tracking info to the same
// Firestore order doc.
//
// Required environment variables (set in the Vercel dashboard):
//   MAKE_API_TOKEN       — same token as api/pending-shipments.js
//   SHIPPO_API_KEY        — same live Shippo key already used by the Make
//                            Shippo connection (Profile > API in Shippo)
//   ADMIN_SECRET           — same signing secret as api/admin.js
// Optional (falls back to the values already stored in the Firestore
// settings/emailjs doc, which the admin panel's Email Settings tab writes):
//   EMAILJS_PUBLIC_KEY, EMAILJS_SERVICE_ID, EMAILJS_TRACKING_TEMPLATE_ID

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

function toFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  return { stringValue: String(v) };
}

async function patchOrderFields(orderId, fields) {
  const maskParams = Object.keys(fields)
    .map((k) => 'updateMask.fieldPaths=' + encodeURIComponent(k))
    .join('&');
  const url = FIRESTORE_BASE + '/orders/' + encodeURIComponent(orderId) + '?key=' + FIREBASE_API_KEY + '&' + maskParams;
  const body = {
    fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toFirestoreValue(v)])),
  };
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(('Could not save tracking info: ' + res.status + ' ' + text).slice(0, 300));
  }
}

async function sendTrackingEmail(email, name, orderId, trackingNumber, trackingCarrier) {
  let publicKey = process.env.EMAILJS_PUBLIC_KEY;
  let serviceId = process.env.EMAILJS_SERVICE_ID;
  let templateId = process.env.EMAILJS_TRACKING_TEMPLATE_ID;

  if (!publicKey || !serviceId || !templateId) {
    const settingsRes = await fetch(
      FIRESTORE_BASE + '/settings/emailjs?key=' + FIREBASE_API_KEY
    );
    if (settingsRes.ok) {
      const doc = await settingsRes.json();
      const f = doc.fields || {};
      publicKey = publicKey || (f.publicKey && f.publicKey.stringValue);
      serviceId = serviceId || (f.serviceId && f.serviceId.stringValue);
      templateId = templateId || (f.trackingTemplateId && f.trackingTemplateId.stringValue);
    }
  }

  if (!publicKey || !serviceId || !templateId) {
    return { sent: false, reason: 'Email Settings (tracking template) not configured yet.' };
  }

  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      template_params: {
        to_email: email,
        to_name: name || 'there',
        order_id: orderId,
        tracking_number: trackingNumber,
        tracking_carrier: trackingCarrier || '',
        site_url: 'https://haychicboutique.com',
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { sent: false, reason: text.slice(0, 200) };
  }
  return { sent: true };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.SITE_URL || 'https://haychicboutique.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Rate-limit: 5 requests per minute per IP (admin endpoint).
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || 'unknown';
  const rl = rateLimit(ip, 5, 60000);
  if (rl.limited) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
  }

  if (!process.env.MAKE_API_TOKEN || !process.env.SHIPPO_API_KEY || !process.env.ADMIN_SECRET) {
    res.status(500).json({ error: 'Label approval is not configured on the server yet.' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!verify(token)) {
    res.status(401).json({ error: 'Your session expired. Please log in again.' });
    return;
  }

  const { orderId, rateId } = req.body || {};
  if (!orderId || !rateId) {
    res.status(400).json({ error: 'Missing orderId or rateId.' });
    return;
  }

  try {
    const dsRes = await fetch(MAKE_API_BASE + '/data-stores/' + MAKE_DATA_STORE_ID + '/data?pg[limit]=100', {
      headers: { Authorization: 'Token ' + process.env.MAKE_API_TOKEN },
    });
    if (!dsRes.ok) throw new Error('Could not read the pending shipment from Make.');
    const dsData = await dsRes.json();
    const records = Array.isArray(dsData.records) ? dsData.records : [];
    const record = records.map((r) => r.data || r).find((d) => d.orderId === orderId);
    if (!record) throw new Error('No pending shipment found for this order.');

    const rates = parseRates(record.shippoRateId);
    const chosenRate = rates.find((r) => r.object_id === rateId);
    if (!chosenRate) throw new Error('That shipping rate is no longer available — refresh and try again.');

    const txRes = await fetch('https://api.goshippo.com/transactions', {
      method: 'POST',
      headers: {
        Authorization: 'ShippoToken ' + process.env.SHIPPO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ rate: rateId, label_file_type: 'PDF', async: false }),
    });
    const tx = await txRes.json().catch(() => ({}));
    if (!txRes.ok || tx.status !== 'SUCCESS') {
      const msg = (tx.messages || []).map((m) => m.text).join(' ') || ('Shippo error (' + txRes.status + ').');
      throw new Error(msg);
    }

    const trackingNumber = tx.tracking_number || '';
    const trackingCarrier = chosenRate.provider || '';
    const trackingUrl = tx.tracking_url_provider || '';
    const labelUrl = tx.label_url || '';

    await patchOrderFields(orderId, {
      trackingNumber,
      trackingCarrier,
      status: 'shipped',
      trackingUrl,
      labelUrl,
      updatedAt: new Date().toISOString(),
    });

    let emailResult = { sent: false };
    try {
      emailResult = await sendTrackingEmail(
        record.customerEmail,
        record.customerName,
        orderId,
        trackingNumber,
        trackingCarrier
      );
    } catch (err) {
      emailResult = { sent: false, reason: err.message };
    }

    res.status(200).json({
      trackingNumber,
      trackingCarrier,
      trackingUrl,
      labelUrl,
      emailSent: emailResult.sent,
      emailReason: emailResult.reason || null,
    });
  } catch (err) {
    Sentry.captureException(err);
  res.status(500).json({ error: err.message || 'Something went wrong buying the label.' });
  }
};
