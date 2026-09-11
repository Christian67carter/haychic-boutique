// Vercel serverless function.
// Powers a simple username/password login for the HAYCHIC product admin
// panel (admin/index.html) instead of requiring a raw GitHub token to be
// pasted into the browser. The real GitHub token lives only here, on the
// server, and is never sent to the client.
//
// Required environment variables (set in the Vercel dashboard):
//   ADMIN_USERNAME  â the login username for the admin panel
//   ADMIN_PASSWORD  â the login password for the admin panel
//   ADMIN_SECRET    â any long random string, used to sign session tokens
//   GITHUB_TOKEN    â a fine-grained GitHub token scoped to just this repo,
//                     with Contents: Read and write permission
//
// See ADMIN-SETUP.md for how to generate/choose each of these.

const crypto = require('crypto');
const Sentry = require('./_sentry');

const OWNER = 'Christian67carter';
const REPO = 'haychic-boutique';
const BRANCH = 'main';
const GITHUB_API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const SITE_URL = process.env.SITE_URL || 'https://haychicboutique.com';
const SESSION_MS = 1000 * 60 * 60 * 24; // 24 hours

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(payload) {
  const body = base64url(Buffer.from(JSON.stringify(payload)));
  const sig = base64url(crypto.createHmac('sha256', process.env.ADMIN_SECRET).update(body).digest());
  return `${body}.${sig}`;
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

function ghHeaders() {
  return {
    Authorization: `token ${process.env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'haychic-admin',
  };
}

// Product/page IDs are interpolated straight into repo file paths below
// (assets/products/${id}.jpg, ${id}.html). This only runs with a valid
// admin session already, but there's no reason to let an id contain "/"
// or ".." â strip it down to the same slug shape every real product id
// already has, so a path can never escape its intended folder.
function sanitizeId(id) {
  return String(id || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 200);
}


function base32Decode(base32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0;
  const output = [];
  for (const char of base32.replace(/=+$/,'').toUpperCase()) {
    const idx = chars.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { output.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(output);
}

function hotp(secret, counter) {
  const key = base32Decode(secret);
  const msg = Buffer.alloc(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) { msg[i] = c & 0xff; c = Math.floor(c / 256); }
  const hmac = crypto.createHmac('sha1', key).update(msg).digest();
  const off = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[off] & 0x7f) << 24) | ((hmac[off+1] & 0xff) << 16) | ((hmac[off+2] & 0xff) << 8) | (hmac[off+3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}

function verifyTOTP(secret, token) {
  if (!secret) return true; // TOTP not configured, skip check
  if (!token) return false;
  const step = Math.floor(Date.now() / 1000 / 30);
  for (let d = -1; d <= 1; d++) { if (hotp(secret, step + d) === String(token).trim()) return true; }
  return false;
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || '';
  const allowed = [SITE_URL, SITE_URL.replace('https://', 'https://www.'), SITE_URL.replace('https://www.', 'https://')];
  if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  else res.setHeader('Access-Control-Allow-Origin', SITE_URL);
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
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD || !process.env.ADMIN_SECRET || !process.env.GITHUB_TOKEN) {
    Sentry.captureException(e);
  res.status(500).json({ error: 'The admin panel is not configured on the server yet.' });
    return;
  }

  const body = req.body || {};
  const action = body.action;

  try {
    if (action === 'login') {
      const { username, password } = body;
      // Email addresses are case-insensitive (Firebase treats them that way
      // too), so compare usernames case-insensitively. Passwords stay
      // case-sensitive.
      const usernameMatches = String(username || '').trim().toLowerCase() ===
        String(process.env.ADMIN_USERNAME || '').trim().toLowerCase();
      const totpOk = verifyTOTP(process.env.ADMIN_TOTP_SECRET, body.totp);
      if (usernameMatches && password === process.env.ADMIN_PASSWORD && totpOk) {
        const token = sign({ u: username, exp: Date.now() + SESSION_MS });
        res.status(200).json({ token });
      } else if (usernameMatches && password === process.env.ADMIN_PASSWORD && !totpOk) {
        res.status(401).json({ error: 'Invalid authenticator code.', needsTotp: true });
      } else {
        res.status(401).json({ error: 'Incorrect username or password.' });
      }
      return;
    }

    if (action === 'google-login') {
      const { idToken } = body;
      if (!idToken) { res.status(400).json({ error: 'Missing ID token.' }); return; }
      // Verify the Firebase ID token using the REST accounts:lookup endpoint.
      // The Web API key is already public (in firebase-config.js).
      const FIREBASE_API_KEY = 'AIzaSyAoHJvYgKl0Z6Gok71OCmyoFPmFLHTXOJw';
      const fbRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) }
      );
      if (!fbRes.ok) { res.status(401).json({ error: 'Could not verify Google token.' }); return; }
      const fbData = await fbRes.json();
      const userEmail = ((fbData.users || [])[0] || {}).email || '';
      const adminEmail = String(process.env.ADMIN_USERNAME || '').trim().toLowerCase();
      if (!userEmail || userEmail.toLowerCase() !== adminEmail) {
        res.status(403).json({ error: 'This Google account is not authorized.' });
        return;
      }
      const token = sign({ u: userEmail, exp: Date.now() + SESSION_MS });
      res.status(200).json({ token });
      return;
    }

    // Every other action requires a valid session token.
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!verify(token)) {
      res.status(401).json({ error: 'Your session expired. Please log in again.' });
      return;
    }

    if (action === 'list') {
      const r = await fetch(`${GITHUB_API}/contents/products.json?ref=${BRANCH}`, { headers: ghHeaders() });
      if (!r.ok) throw new Error('Could not load products.json.');
      const data = await r.json();
      const products = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));
      res.status(200).json({ products, sha: data.sha });
      return;
    }

    if (action === 'save') {
      // `image` (single) is kept for backwards compatibility. `images` is a
      // list of { id, base64 } â used for color-variant photos, where a
      // single listing can have several photos to upload in one save.
      // `pages` is a list of { id, content } â plain-text HTML for a
      // brand-new product's clean-URL page (e.g. "the-tiffany.html"). We
      // only create these, never overwrite an existing page, so re-saving
      // an existing product doesn't produce a pointless commit.
      const { products, sha, image, images, pages, message } = body;
      if (!Array.isArray(products)) throw new Error('Missing product list.');

      const uploads = [];
      if (image && image.id && image.base64) uploads.push(image);
      if (Array.isArray(images)) {
        for (const img of images) {
          if (img && img.id && img.base64) uploads.push(img);
        }
      }

      for (const img of uploads) {
        const safeImgId = sanitizeId(img.id);
        if (!safeImgId) continue;
        const imagePath = `assets/products/${safeImgId}.jpg`;
        let existingSha;
        const existRes = await fetch(`${GITHUB_API}/contents/${imagePath}?ref=${BRANCH}`, { headers: ghHeaders() });
        if (existRes.status === 200) {
          const existData = await existRes.json();
          existingSha = existData.sha;
        }
        const imgRes = await fetch(`${GITHUB_API}/contents/${imagePath}`, {
          method: 'PUT',
          headers: ghHeaders(),
          body: JSON.stringify({
            message: `Add photo for ${img.id}`,
            content: img.base64,
            branch: BRANCH,
            ...(existingSha ? { sha: existingSha } : {}),
          }),
        });
        if (!imgRes.ok) throw new Error(`Could not upload the photo for ${img.id}.`);
      }

      const pageWrites = [];
      if (Array.isArray(pages)) {
        for (const pg of pages) {
          if (!pg || !pg.id || !pg.content) continue;
          const safePgId = sanitizeId(pg.id);
          if (!safePgId) continue;
          const pagePath = `${safePgId}.html`;
          const existsRes = await fetch(`${GITHUB_API}/contents/${pagePath}?ref=${BRANCH}`, { headers: ghHeaders() });
          if (existsRes.status === 200) continue; // already there, don't overwrite
          const pageRes = await fetch(`${GITHUB_API}/contents/${pagePath}`, {
            method: 'PUT',
            headers: ghHeaders(),
            body: JSON.stringify({
              message: `Create page for ${pg.id}`,
              content: Buffer.from(pg.content, 'utf-8').toString('base64'),
              branch: BRANCH,
            }),
          });
          if (!pageRes.ok) throw new Error(`Could not create the page for ${pg.id}.`);
          pageWrites.push(pagePath);
        }
      }

      const putRes = await fetch(`${GITHUB_API}/contents/products.json`, {
        method: 'PUT',
        headers: ghHeaders(),
        body: JSON.stringify({
          message: message || 'Update listings',
          content: Buffer.from(JSON.stringify(products, null, 2)).toString('base64'),
          sha,
          branch: BRANCH,
        }),
      });
      if (!putRes.ok) {
        // A sale (auto inventory decrement) or another admin save landed on
        // products.json after this page loaded its copy â refuse to blindly
        // overwrite it, since this save's product list doesn't include
        // whatever just changed. Surface a clear, actionable message
        // instead of a generic failure.
        if (putRes.status === 409 || putRes.status === 422) {
          throw new Error('Someone else updated inventory while you were editing (likely a sale just came in). Refresh the page and make your change again.');
        }
        const errData = await putRes.json().catch(() => ({}));
        throw new Error(errData.message || 'Could not save the listing.');
      }
      const putData = await putRes.json();
      res.status(200).json({
        sha: putData.content.sha,
        imagePaths: uploads.map((u) => `assets/products/${u.id}.jpg`),
        pagePaths: pageWrites,
      });
      return;
    }

    res.status(400).json({ error: 'Unknown action.' });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Something went wrong.' });
  }
};
