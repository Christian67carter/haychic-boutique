// HAYCHIC Boutique — site password gate + visitor tracking.
// Requires firebase-config.js (db, auth) to already be loaded.
(function () {
  const UNLOCK_KEY = 'haychic_unlocked';
  const LEAD_KEY = 'haychic_lead_email';
  const SESSION_KEY = 'haychic_session_id';

  function getSessionId() {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  }

  function logActivity(type, extra) {
    try {
      db.collection('activity').add(Object.assign({
        type: type,
        sessionId: getSessionId(),
        leadEmail: localStorage.getItem(LEAD_KEY) || null,
        page: location.pathname.split('/').pop() || 'index.html',
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      }, extra || {}));
    } catch (e) { /* fail silently — never block the visitor */ }
  }
  window.HAYCHIC_logActivity = logActivity;

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #haychic-gate{position:fixed;inset:0;z-index:9999;background:var(--cream,#F2E9DA);display:flex;align-items:center;justify-content:center;padding:24px;}
      #haychic-gate .gate-box{max-width:420px;width:100%;background:#fff;border:1px solid var(--line,#E3D9C3);border-radius:28px;padding:38px 32px;box-shadow:var(--shadow,0 18px 50px rgba(74,63,46,.12));text-align:center;}
      #haychic-gate .gate-logo{font-family:"Playfair Display",serif;font-size:1.6rem;font-weight:600;}
      #haychic-gate .gate-logo span{display:block;font-family:"DM Sans",sans-serif;font-size:.6rem;letter-spacing:.24em;text-transform:uppercase;color:var(--muted,#7A6F5C);}
      #haychic-gate .gate-tag{color:var(--muted,#7A6F5C);font-size:.92rem;margin:14px 0 22px;}
      #haychic-gate form{display:flex;flex-direction:column;gap:10px;}
      #haychic-gate input,#haychic-gate textarea{border:1px solid var(--line,#E3D9C3);background:var(--cream,#F2E9DA);border-radius:12px;padding:12px 14px;font:inherit;color:var(--brown,#4A3F2E);width:100%;}
      #haychic-gate .btn{border:1px solid var(--brown,#4A3F2E);border-radius:999px;padding:12px 18px;font-weight:700;cursor:pointer;}
      #haychic-gate .btn.primary{background:var(--brown,#4A3F2E);color:#fff;}
      #haychic-gate .btn.secondary{background:transparent;color:var(--brown,#4A3F2E);}
      #haychic-gate .gate-divider{margin:20px 0 10px;font-size:.75rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted,#7A6F5C);}
      #haychic-gate .gate-request-toggle{background:none;border:0;color:var(--pink-dark,#B99B6B);font-weight:700;cursor:pointer;text-decoration:underline;}
      #haychic-gate .gate-request-form{margin-top:16px;}
      #haychic-gate .gate-hidden{display:none !important;}
      #haychic-gate .gate-error{font-size:.82rem;color:#a05f70;min-height:1.1em;margin:2px 0 0;}
      #haychic-gate .gate-success{color:#4d7a4d;}
    `;
    document.head.appendChild(style);
  }

  function showGate() {
    injectStyles();
    const overlay = document.createElement('div');
    overlay.id = 'haychic-gate';
    overlay.innerHTML = `
      <div class="gate-box">
        <div class="gate-logo">Welcome to HAYCHIC <span>Boutique</span></div>
        <p class="gate-tag">Our boutique is currently available by approved access <img src="/assets/flower-icon.png" class="flower-emoji" alt="">. Don't have a password yet? Request one below.</p>
        <button type="button" id="gate-request-toggle" class="btn primary gate-request-toggle-btn">Request Access</button>
        <form id="gate-request-form" class="gate-request-form gate-hidden">
          <input type="text" id="gate-name" placeholder="Your name" required>
          <input type="email" id="gate-email" placeholder="Your email" required>
          <input type="text" id="gate-social" placeholder="Instagram handle (optional)">
          <textarea id="gate-message" placeholder="Anything you'd like Hayden to know? (optional)" rows="3"></textarea>
          <button type="submit" class="btn secondary">Send Request <img src="/assets/flower-icon.png" class="flower-emoji" alt=""></button>
          <p id="gate-request-status" class="gate-error"></p>
        </form>
        <div class="gate-divider">already approved?</div>
        <form id="gate-unlock-form">
          <input type="password" id="gate-password" placeholder="Enter your personal password" required autocomplete="off">
          <button type="submit" class="btn secondary">Enter Site</button>
          <p id="gate-error" class="gate-error"></p>
        </form>
      </div>`;
    document.documentElement.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    document.getElementById('gate-unlock-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      const pw = document.getElementById('gate-password').value.trim();
      const errEl = document.getElementById('gate-error');
      if (!pw) return;
      errEl.textContent = 'Checking…';
      errEl.classList.remove('gate-success');
      try {
        const doc = await db.collection('access_codes').doc(pw).get();
        if (doc.exists && doc.data().active !== false) {
          localStorage.setItem(UNLOCK_KEY, '1');
          if (doc.data().email) localStorage.setItem(LEAD_KEY, doc.data().email);
          unlockSite();
        } else {
          errEl.textContent = "That password isn't valid — try again or request access below.";
        }
      } catch (err) {
        errEl.textContent = 'Something went wrong — please try again.';
      }
    });

    document.getElementById('gate-request-toggle').addEventListener('click', function () {
      document.getElementById('gate-request-form').classList.toggle('gate-hidden');
    });

    document.getElementById('gate-request-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      const name = document.getElementById('gate-name').value.trim();
      const email = document.getElementById('gate-email').value.trim();
      const social = document.getElementById('gate-social').value.trim();
      const message = document.getElementById('gate-message').value.trim();
      const statusEl = document.getElementById('gate-request-status');
      if (!name || !email) return;
      statusEl.textContent = 'Sending…';
      statusEl.classList.remove('gate-success');
      try {
        await db.collection('leads').add({
          name: name,
          email: email,
          phone: '',
          social: social,
          message: message,
          status: 'requested',
          notes: '',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        statusEl.innerHTML = 'Request sent! Hayden will email you a password soon <img src="/assets/flower-icon.png" class="flower-emoji" alt="">';
        statusEl.classList.add('gate-success');
        e.target.reset();
      } catch (err) {
        statusEl.textContent = 'Could not send your request — please try again.';
      }
    });
  }

  function unlockSite() {
    const overlay = document.getElementById('haychic-gate');
    if (overlay) overlay.remove();
    document.body.style.overflow = '';
    logActivity('pageview');
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (localStorage.getItem(UNLOCK_KEY) === '1') {
      logActivity('pageview');
    } else {
      showGate();
    }
  });
})();
