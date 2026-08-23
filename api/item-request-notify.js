// Vercel serverless function.
// Receives a submission from the "Request an Item" form on request.html and
// forwards it to the same Make (Integromat) webhook already used for order
// and support notifications (see api/order-notify.js / api/support-notify.js),
// tagged with type: "item_request" so Hayden's Make scenario can route it
// separately (e.g. a Router module keyed on `body.type`).
//
// Reuses the MAKE_WEBHOOK_URL environment variable that's already set in
// the Vercel dashboard for order/support notifications — no new credentials
// needed. If MAKE_WEBHOOK_URL isn't set, or the forward fails, the request
// still succeeds from the shopper's point of view: script.js also logs every
// item request to Firestore via HAYCHIC_logActivity, so it always shows up
// in the admin panel's Item Requests tab even if Make never sees it.

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
    const { name, social, type, details, request } = req.body || {};

    if (!String(name || '').trim() || !String(request || '').trim()) {
      res.status(400).json({ error: 'Name and a description of the item are required.' });
      return;
    }

    const payload = {
      type: 'item_request',
      name: String(name).slice(0, 200),
      social: String(social || '').slice(0, 200),
      itemType: String(type || 'Other').slice(0, 200),
      details: String(details || '').slice(0, 200),
      request: String(request).slice(0, 4000),
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
        // Don't fail the shopper's submission just because the Make
        // webhook hiccuped — the activity log in Firestore is the backstop.
        console.error('item-request-notify: Make webhook forward failed', forwardErr);
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Something went wrong.' });
  }
};
