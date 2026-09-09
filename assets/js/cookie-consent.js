/**
 * HAYCHIC Boutique — Cookie Consent Banner
 * Shows on first visit; remembers acceptance in localStorage.
 */
(function () {
  var STORAGE_KEY = 'haychic_cookie_consent';
  var BANNER_ID = 'cookie-consent-banner';

  function createBanner() {
    var banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie consent');
    banner.innerHTML =
      '<div class="cc-content">' +
        '<p>We use cookies to improve your experience. By continuing to browse, you accept our ' +
        '<a href="/cookies.html">Cookie Policy</a>.</p>' +
        '<div class="cc-actions">' +
          '<button id="cc-accept" aria-label="Accept cookies">Accept</button>' +
          '<a href="/cookies.html" class="cc-learn">Learn more</a>' +
        '</div>' +
      '</div>';
    banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#1a1a1a;color:#f5f0ea;padding:16px 24px;display:flex;align-items:center;justify-content:center;box-shadow:0 -2px 12px rgba(0,0,0,0.25);font-family:inherit;font-size:14px;';
    var content = banner.querySelector('.cc-content');
    content.style.cssText = 'display:flex;align-items:center;gap:20px;flex-wrap:wrap;max-width:960px;width:100%;';
    var p = banner.querySelector('p');
    p.style.cssText = 'margin:0;flex:1;min-width:200px;line-height:1.4;';
    banner.querySelector('p a').style.cssText = 'color:#d4a574;text-decoration:underline;';
    banner.querySelector('.cc-actions').style.cssText = 'display:flex;align-items:center;gap:12px;flex-shrink:0;';
    var acceptBtn = banner.querySelector('#cc-accept');
    acceptBtn.style.cssText = 'background:#d4a574;color:#1a1a1a;border:none;border-radius:4px;padding:8px 20px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;letter-spacing:0.5px;';
    banner.querySelector('.cc-learn').style.cssText = 'color:#d4a574;font-size:13px;text-decoration:underline;white-space:nowrap;';
    acceptBtn.addEventListener('click', function () {
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) {}
      hideBanner(banner);
    });
    return banner;
  }

  function hideBanner(banner) {
    banner.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    banner.style.opacity = '0';
    banner.style.transform = 'translateY(8px)';
    setTimeout(function () { if (banner.parentNode) banner.parentNode.removeChild(banner); }, 350);
  }

  function hasConsent() {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { return false; }
  }

  function init() {
    if (hasConsent()) return;
    document.body.appendChild(createBanner());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
