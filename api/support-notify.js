// Vercel serverless function.
// Receives a submission from the customer support form on support.html and
// forwards it to the same Make (Integromat) webhook already used for order
// notifications (see api/order-notify.js / SHIPPING-SETUP.md), tagged with
// type: "support_request" so Hayden's Make scenario can route it separately
// from order alerts (e.g. a Router module keyed on `body.type`).
//
// Reuses the MAKE_WEBHOOK_URL environment variable that's already set in
// the Vercel dashboard for order notifications — no new credentials needed.
// If MAKE_WEBHOOK_URL isn't set, or the forward fails, the request still
// succeeds from the shopper's point of view: script.js also logs every
// support request to Firestore via HAYCHIC_logActivity, so it always shows
// up in the admin panel's Activity tab even if Make never sees it.

const SITE_URL = process.env.SITE_URL || 'https://haychicboutique.com';
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

  try {
    const { name, email, topic, orderNumber, message } = req.body || {};

    if (!String(name || '').trim() || !String(email || '').trim() || !String(message || '').trim()) {
      res.status(400).json({ error: 'Name, email, and a message are required.' });
      return;
    }

    const payload = {
      type: 'support_request',
      name: String(name).slice(0, 200),
      email: String(email).slice(0, 200),
      topic: String(topic || 'Something else').slice(0, 200),
      orderNumber: String(orderNumber || '').slice(0, 200),
      message: String(message).slice(0, 4000),
      submittedAt: new Date().toISOString(),
    };

    if (process.env.MAKE_WEBHOOK_URL) {
      try {
        await fetch(process.env.MAKE_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (forwardErr) {
        // Don't fail the customer's submission just because the Make
        // webhook hiccuped — the activity log in Firestore is the backstop.
        console.error('support-notify: Make webhook forward failed', forwardErr);
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not send your message.' });
  }
};
