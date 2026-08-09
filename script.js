
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Central place that maps a status value to its badge class + label.
// 'sold-out' items can be browsed but never added to the bag.
function statusInfo(status){
  if(status === 'sold-out') return { cls: 'sold-out', label: 'SOLD OUT' };
  if(status === 'preorder') return { cls: 'preorder', label: 'PRE-ORDER' };
  return { cls: 'in-stock', label: 'IN STOCK' };
}

// Below this many units left, show a red "only X left" urgency note.
// Keep in sync with LOW_STOCK_THRESHOLD in admin/index.html.
const LOW_STOCK_THRESHOLD = 3;

// Returns an "only X left" markup when qty is a low-but-nonzero number,
// otherwise an empty string. qty === 0 is handled separately by flipping
// the item's status to pre-order, not by an urgency note.
function urgencyHtml(qty){
  if(typeof qty !== 'number' || qty <= 0 || qty > LOW_STOCK_THRESHOLD) return '';
  return `<span class="urgency-badge">Only ${qty} left!</span>`;
}

let ALL_PRODUCTS = [];

// A product's status field can lag behind its tracked quantity (e.g. an
// order dropped it to 0 but nothing re-saved the record) — this treats
// "in-stock with 0 left" as pre-order everywhere a product's status is
// used, so the badge, the Pre-Order/In-Stock pages, and the bag button
// all agree with each other.
function effectiveProductStatus(p){
  return (p.status === 'in-stock' && p.qty === 0) ? 'preorder' : p.status;
}

function renderProductCard(p){
  const effectiveStatus = effectiveProductStatus(p);
  const { cls: statusClass, label: statusLabel } = statusInfo(effectiveStatus);
  const soldOut = effectiveStatus === 'sold-out';
  const bg = p.image ? `background-image:url('${p.image}');background-size:cover;background-position:center;` : '';
  const inner = p.image ? '' : '<span>HAYCHIC</span>';
  const href = `/${encodeURIComponent(p.id)}`;
  return `
    <article class="product-card">
      <a class="product-link" href="${href}">
        <div class="product-image placeholder" style="${bg}">${inner}</div>
        <div class="badges"><span class="badge ${statusClass}">${statusLabel}</span></div>
        <h3>${escapeHtml(p.name)}</h3>
        <p class="price">${escapeHtml(p.price)} ${urgencyHtml(p.qty)}</p>
      </a>
      <button class="add-to-bag-btn" data-id="${escapeHtml(p.id)}" data-name="${escapeHtml(p.name)}" data-price="${escapeHtml(p.price)}" data-image="${escapeHtml(p.image || '')}" ${soldOut ? 'disabled' : ''}>${soldOut ? 'Sold Out' : 'Add to Bag'}</button>
    </article>`;
}

function renderGrid(el, products, emptyMsg){
  if(!el) return;
  if(!products.length){
    el.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--muted);">${emptyMsg}</p>`;
    return;
  }
  el.innerHTML = products.map(renderProductCard).join('');
}

function applyFilter(cat){
  document.querySelectorAll('.filter-pill').forEach(p => p.classList.toggle('active', p.dataset.cat === cat));
  const filtered = cat === 'All' ? ALL_PRODUCTS : ALL_PRODUCTS.filter(p => p.category === cat);
  renderGrid(document.getElementById('products'), filtered, 'New arrivals coming soon <img src="/assets/flower-icon.png" class="flower-emoji" alt="">');
}

async function loadProducts(){
  const grid = document.getElementById('products');
  const preorderGrid = document.getElementById('preorder-products');
  const instockGrid = document.getElementById('instock-products');
  const newArrivalsGrid = document.getElementById('newarrivals-products');
  const homeGrid = document.getElementById('home-newarrivals');
  if(!grid && !preorderGrid && !instockGrid && !newArrivalsGrid && !homeGrid) return;
  try{
    const res = await fetch('products.json?_=' + Date.now());
    ALL_PRODUCTS = await res.json();
    if(grid){
      const catParam = getQueryParam('cat');
      applyFilter(catParam || 'All');
    }
    if(preorderGrid) renderGrid(preorderGrid, ALL_PRODUCTS.filter(p => effectiveProductStatus(p) === 'preorder'), 'Pre-order picks coming soon <img src="/assets/flower-icon.png" class="flower-emoji" alt="">');
    if(instockGrid) renderGrid(instockGrid, ALL_PRODUCTS.filter(p => effectiveProductStatus(p) === 'in-stock'), 'In-stock items coming soon <img src="/assets/flower-icon.png" class="flower-emoji" alt="">');
    // Newest-added items first — products are appended to products.json
    // as they're created, so reversing the list surfaces the latest ones.
    if(newArrivalsGrid) renderGrid(newArrivalsGrid, [...ALL_PRODUCTS].reverse(), 'New arrivals coming soon <img src="/assets/flower-icon.png" class="flower-emoji" alt="">');
    // Homepage teaser — just the 4 newest, so the homepage shows real
    // merchandise instead of only category tiles.
    if(homeGrid) renderGrid(homeGrid, [...ALL_PRODUCTS].reverse().slice(0, 4), 'New arrivals coming soon <img src="/assets/flower-icon.png" class="flower-emoji" alt="">');
  }catch(err){
    if(grid) grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--muted);">Could not load products right now.</p>';
  }
}
document.addEventListener('DOMContentLoaded', loadProducts);

function toggleMenu(){
  document.getElementById('nav').classList.toggle('open');
}
document.querySelectorAll('#nav a').forEach(a => a.addEventListener('click', () => {
  document.getElementById('nav').classList.remove('open');
}));
function showToast(message){
  const t=document.getElementById('toast');
  t.innerHTML=message;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2200);
}
function submitRequest(e){
  e.preventDefault();
  const form = e.target;
  const data = new FormData(form);
  if(window.HAYCHIC_logActivity){
    window.HAYCHIC_logActivity('item_request', {
      requestName: data.get('name') || '',
      requestSocial: data.get('social') || '',
      requestType: data.get('type') || '',
      requestDetails: data.get('details') || '',
      requestText: data.get('request') || ''
    });
  }
  showToast('Request captured — connect this form to Shopify or email next <img src="/assets/flower-icon.png" class="flower-emoji" alt="">');
  form.reset();
}
const SUPPORT_API = 'https://haychic-boutique.vercel.app/api/support-notify';
async function submitSupport(e){
  e.preventDefault();
  const form = e.target;
  const data = new FormData(form);
  const payload = {
    name: data.get('name') || '',
    email: data.get('email') || '',
    social: data.get('social') || '',
    topic: data.get('topic') || '',
    orderNumber: data.get('orderNumber') || '',
    message: data.get('message') || ''
  };
  if(window.HAYCHIC_logActivity){
    window.HAYCHIC_logActivity('support_request', payload);
  }
  try{
    await fetch(SUPPORT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }catch(err){
    // The activity log above already captured it, so a network hiccup here
    // just means Hayden sees it in the admin panel instead of a Make alert.
  }
  showToast('Message sent — Hayden will get back to you soon <img src="/assets/flower-icon.png" class="flower-emoji" alt="">');
  form.reset();
}
function newsletter(e){
  e.preventDefault();
  showToast('You’re on the HAYCHIC list <img src="/assets/flower-icon.png" class="flower-emoji" alt="">');
  e.target.reset();
}

/* ---------- Order Tracking ---------- */
const TRACK_ORDER_API = 'https://haychic-boutique.vercel.app/api/track-order';
const TRACK_STATUS_LABELS = { processing: 'Processing', shipped: 'Shipped', delivered: 'Delivered' };

async function trackOrder(e, silent){
  if(e && e.preventDefault) e.preventDefault();
  const form = document.getElementById('trackForm');
  if(!form) return;
  const orderId = document.getElementById('trackOrderId').value.trim();
  const email = form.querySelector('input[name="email"]').value.trim();
  const errEl = document.getElementById('trackError');
  const resultEl = document.getElementById('trackResult');
  errEl.textContent = '';
  resultEl.style.display = 'none';
  if(!orderId || !email) return;
  const btn = form.querySelector('button[type="submit"]');
  const originalBtnHtml = btn ? btn.innerHTML : '';
  if(btn){ btn.disabled = true; btn.textContent = 'Looking up…'; }
  try{
    const res = await fetch(`${TRACK_ORDER_API}?orderId=${encodeURIComponent(orderId)}&email=${encodeURIComponent(email)}`);
    const data = await res.json();
    if(!res.ok){
      errEl.textContent = data.error || "Could not find that order — double-check the order number and email.";
      return;
    }
    const statusLabel = TRACK_STATUS_LABELS[data.status] || data.status || 'Processing';
    resultEl.innerHTML = `
      <h3>Order ${escapeHtml(data.orderId)}</h3>
      <p class="track-status track-status-${escapeHtml(data.status || 'processing')}">${escapeHtml(statusLabel)}</p>
      ${data.trackingNumber
        ? `<p><strong>Tracking number:</strong> ${escapeHtml(data.trackingNumber)}${data.trackingCarrier ? ' via ' + escapeHtml(data.trackingCarrier) : ''}</p>`
        : `<p class="track-note">A tracking number will appear here as soon as your order ships.</p>`}
      ${data.shippingMethod ? `<p><strong>Shipping method:</strong> ${escapeHtml(data.shippingMethod)}</p>` : ''}
      ${data.amountTotal ? `<p><strong>Order total:</strong> $${escapeHtml(data.amountTotal)}</p>` : ''}
      ${Array.isArray(data.items) && data.items.length ? `<ul class="track-items">${data.items.map(i => `<li>${escapeHtml(i.quantity)} × ${escapeHtml(i.name)}</li>`).join('')}</ul>` : ''}
    `;
    resultEl.style.display = 'block';
  }catch(err){
    if(!silent) errEl.textContent = 'Something went wrong looking up your order. Please try again.';
  }finally{
    if(btn){ btn.disabled = false; btn.innerHTML = originalBtnHtml; }
  }
}
function logProductInterest(id, name){
  if(window.HAYCHIC_logActivity){
    window.HAYCHIC_logActivity('product_interest', { productId: id, productName: name });
  }
}
function scrollTesti(dir){
  const track = document.getElementById('testiTrack');
  if(track) track.scrollBy({ left: dir * 300, behavior: 'smooth' });
}

function getQueryParam(name){
  return new URLSearchParams(location.search).get(name);
}

// Resolves the product id for the current page. Prefers the old
// ?id=slug query param (so any previously-shared links keep working),
// then falls back to reading it from a clean URL like /the-tiffany or
// /the-tiffany.html (a static per-product page that GitHub Pages serves
// via extensionless resolution).
function getProductId(){
  const q = getQueryParam('id');
  if(q) return q;
  let path = location.pathname.replace(/\/+$/, '').split('/').pop() || '';
  path = path.replace(/\.html$/i, '');
  if(!path || path === 'product' || path === 'index') return null;
  return decodeURIComponent(path);
}

async function loadProductDetail(){
  const wrap = document.getElementById('productDetail');
  if(!wrap) return;
  const id = getProductId();
  try{
    const res = await fetch('/products.json?_=' + Date.now());
    const products = await res.json();
    const p = products.find(x => x.id === id);
    if(!p){
      wrap.innerHTML = '<p style="text-align:center;color:var(--muted);padding:60px 0;grid-column:1/-1;">Sorry, we couldn\'t find that item. <a href="shop.html">Back to shop →</a></p>';
      return;
    }
    document.title = `${p.name} | HAYCHIC Boutique`;

    const colorList = Array.isArray(p.colors) ? p.colors : [];
    const hasColors = colorList.length > 1; // only show a picker when there's an actual choice
    let selectedColor = colorList.length ? colorList[0] : null;

    const sizeList = Array.isArray(p.sizes) ? p.sizes : [];
    const hasSizes = sizeList.length > 1; // only show a picker when there's an actual choice
    let selectedSize = sizeList.length ? sizeList[0] : null;

    function render(){
      let activeStatus = (selectedSize && selectedSize.status) || (selectedColor && selectedColor.status) || p.status;
      const activeQty = (selectedSize && typeof selectedSize.qty === 'number') ? selectedSize.qty
        : (selectedColor && typeof selectedColor.qty === 'number') ? selectedColor.qty
        : (typeof p.qty === 'number' ? p.qty : null);
      // Defensive fallback: quantity tracked at 0 but status wasn't flipped —
      // treat as pre-order rather than letting it look sellable.
      if(activeStatus === 'in-stock' && activeQty === 0) activeStatus = 'preorder';
      const activeImage = (selectedColor && selectedColor.image) || p.image;
      const { cls: statusClass, label: statusLabel } = statusInfo(activeStatus);
      const soldOut = activeStatus === 'sold-out';
      const bg = activeImage ? `background-image:url('${activeImage}');background-size:cover;background-position:center;` : '';
      const inner = activeImage ? '' : '<span>HAYCHIC</span>';
      const desc = p.description ? escapeHtml(p.description) : 'A HAYCHIC favorite, hand-picked for you. Reach out with any questions about sizing, color or availability before you order.';
      const preorderNote = activeStatus === 'preorder'
        ? `<div class="pdp-note">This is a pre-order item — typical turnaround is about 2–3 weeks. <a href="preorders.html">Learn how pre-orders work →</a></div>`
        : '';
      const inStockNote = activeStatus === 'in-stock'
        ? `<div class="pdp-note pdp-note-instock">On hand and ready to ship — usually ships within 1–2 business days.</div>`
        : '';
      const soldOutNote = soldOut
        ? `<div class="pdp-note pdp-note-soldout">This item is currently sold out. <a href="request.html">Ask to be notified when it's back →</a></div>`
        : '';
      const nameParts = [p.name];
      if(hasColors) nameParts.push(selectedColor.name);
      if(hasSizes) nameParts.push(selectedSize.name);
      const displayName = nameParts.join(' — ');
      const swatches = hasColors ? `
        <div class="pdp-colors">
          <span class="pdp-colors-label">Color: <strong>${escapeHtml(selectedColor.name)}</strong></span>
          <div class="swatch-row">
            ${p.colors.map((c, i) => `<button type="button" class="color-swatch ${c === selectedColor ? 'active' : ''} ${c.status === 'sold-out' ? 'is-soldout' : ''}" data-idx="${i}" style="${c.image ? `background-image:url('${c.image}')` : ''}" title="${escapeHtml(c.name)}${c.status === 'sold-out' ? ' (Sold Out)' : ''}"></button>`).join('')}
          </div>
        </div>` : '';
      const sizePicker = hasSizes ? `
        <div class="pdp-sizes">
          <span class="pdp-sizes-label">Size: <strong>${escapeHtml(selectedSize.name)}</strong></span>
          <div class="size-row">
            ${p.sizes.map((s, i) => `<button type="button" class="size-pill ${s === selectedSize ? 'active' : ''} ${s.status === 'preorder' ? 'is-preorder' : ''} ${s.status === 'sold-out' ? 'is-soldout' : ''}" data-idx="${i}" ${s.status === 'sold-out' ? 'disabled' : ''}>${escapeHtml(s.name)}</button>`).join('')}
          </div>
        </div>` : '';
      wrap.innerHTML = `
        <div class="pdp-image placeholder" style="${bg}">${inner}</div>
        <div class="pdp-info">
          <span class="badge ${statusClass}">${statusLabel}</span>
          <h1>${escapeHtml(p.name)}</h1>
          <p class="pdp-category">${escapeHtml(p.category || '')}</p>
          <p class="pdp-price">${escapeHtml(p.price)} ${urgencyHtml(activeQty)}</p>
          ${swatches}
          ${sizePicker}
          <p class="pdp-desc">${desc}</p>
          ${inStockNote}
          ${preorderNote}
          ${soldOutNote}
          <div class="hero-actions">
            <button class="btn primary add-to-bag-btn" data-id="${escapeHtml(p.id)}" data-name="${escapeHtml(displayName)}" data-price="${escapeHtml(p.price)}" data-image="${escapeHtml(activeImage || '')}" data-color="${escapeHtml(selectedColor ? selectedColor.name : '')}" data-size="${escapeHtml(selectedSize ? selectedSize.name : '')}" ${soldOut ? 'disabled' : ''}>${soldOut ? 'Sold Out' : 'Add to Bag'}</button>
            <a class="btn secondary" href="request.html">Ask a Question</a>
          </div>
        </div>`;
      if(hasColors){
        wrap.querySelectorAll('.color-swatch').forEach(btn => {
          btn.addEventListener('click', () => {
            selectedColor = p.colors[parseInt(btn.dataset.idx, 10)];
            render();
          });
        });
      }
      if(hasSizes){
        // Sold-out sizes are rendered disabled and can't be selected — the
        // browser skips click handlers on disabled buttons, but we also
        // filter them out of the selector for clarity.
        wrap.querySelectorAll('.size-pill:not([disabled])').forEach(btn => {
          btn.addEventListener('click', () => {
            selectedSize = p.sizes[parseInt(btn.dataset.idx, 10)];
            render();
          });
        });
      }
    }
    render();

    if(window.HAYCHIC_logActivity){
      window.HAYCHIC_logActivity('product_view', { productId: p.id, productName: p.name });
    }
  }catch(err){
    wrap.innerHTML = '<p style="text-align:center;color:var(--muted);padding:60px 0;grid-column:1/-1;">Could not load this item right now.</p>';
  }
}
document.addEventListener('DOMContentLoaded', loadProductDetail);

/* ---------- Shopping Bag / Cart ---------- */
const CART_KEY = 'haychic_cart';
const CHECKOUT_API = 'https://haychic-boutique.vercel.app/api/create-checkout-session';

function parsePriceToCents(priceStr){
  const n = parseFloat(String(priceStr).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : Math.round(n * 100);
}

function loadCart(){
  try{ return JSON.parse(localStorage.getItem(CART_KEY)) || []; }catch(e){ return []; }
}

function saveCart(cart){
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateBagBadge();
  renderCartDrawer();
}

function getCartCount(cart){
  return cart.reduce((sum, item) => sum + item.qty, 0);
}

function updateBagBadge(){
  const count = getCartCount(loadCart());
  document.querySelectorAll('.bag-count').forEach(el => {
    el.textContent = count > 0 ? count : '';
    el.classList.toggle('show', count > 0);
  });
}

function addToCart(id, name, priceStr, image, colorName, sizeName){
  const cart = loadCart();
  const existing = cart.find(item => item.id === id);
  if(existing){
    existing.qty += 1;
    // Keep the most recently selected variant tied to this line item.
    if(colorName) existing.colorName = colorName;
    if(sizeName) existing.sizeName = sizeName;
  } else {
    cart.push({ id, name, price: priceStr, image: image || '', qty: 1, colorName: colorName || '', sizeName: sizeName || '' });
  }
  saveCart(cart);
}

function removeFromCart(id){
  saveCart(loadCart().filter(item => item.id !== id));
}

function changeQty(id, delta){
  const cart = loadCart();
  const item = cart.find(x => x.id === id);
  if(!item) return;
  item.qty += delta;
  if(item.qty <= 0){ removeFromCart(id); return; }
  saveCart(cart);
}

function injectCartDrawer(){
  if(document.getElementById('cartDrawer')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div id="cartOverlay" class="cart-overlay"></div>
    <aside id="cartDrawer" class="cart-drawer">
      <div class="cart-drawer-header">
        <h3>Your Bag <img src="/assets/flower-icon.png" class="flower-emoji" alt=""></h3>
        <button class="cart-close-btn" aria-label="Close bag">✕</button>
      </div>
      <div id="cartItems" class="cart-items"></div>
      <div class="cart-drawer-footer">
        <div class="cart-subtotal"><span>Subtotal</span><strong id="cartSubtotal">$0.00</strong></div>
        <div class="cart-zip">
          <label for="cartZip">ZIP code (for shipping)</label>
          <input type="text" id="cartZip" inputmode="numeric" maxlength="5" placeholder="e.g. 79601" />
          <p class="cart-zip-note">Abilene, TX ZIP codes unlock Local Delivery at checkout.</p>
        </div>
        <div class="cart-zip">
          <label for="cartInstagram">Instagram / TikTok (optional)</label>
          <input type="text" id="cartInstagram" placeholder="@username" />
        </div>
        <button class="btn primary cart-checkout-btn" style="width:100%;text-align:center;">Checkout</button>
        <p class="cart-note">Shipping and any final adjustments are calculated at checkout.</p>
      </div>
    </aside>`;
  document.body.appendChild(wrap);
}

function renderCartDrawer(){
  const itemsWrap = document.getElementById('cartItems');
  const subtotalEl = document.getElementById('cartSubtotal');
  if(!itemsWrap || !subtotalEl) return;
  const cart = loadCart();
  if(!cart.length){
    itemsWrap.innerHTML = '<p class="cart-empty">Your bag is empty <img src="/assets/flower-icon.png" class="flower-emoji" alt=""><br>Go find something you love!</p>';
    subtotalEl.textContent = '$0.00';
    return;
  }
  let subtotalCents = 0;
  itemsWrap.innerHTML = cart.map(item => {
    subtotalCents += parsePriceToCents(item.price) * item.qty;
    const bg = item.image ? `background-image:url('${item.image}');background-size:cover;background-position:center;` : '';
    return `
      <div class="cart-item">
        <div class="cart-item-thumb" style="${bg}"></div>
        <div class="cart-item-info">
          <h4>${escapeHtml(item.name)}</h4>
          <span>${escapeHtml(item.price)}</span>
          <div class="cart-qty">
            <button class="cart-qty-btn" data-id="${escapeHtml(item.id)}" data-delta="-1">−</button>
            <span>${item.qty}</span>
            <button class="cart-qty-btn" data-id="${escapeHtml(item.id)}" data-delta="1">+</button>
          </div>
        </div>
        <button class="cart-remove-btn" data-id="${escapeHtml(item.id)}" aria-label="Remove">✕</button>
      </div>`;
  }).join('');
  subtotalEl.textContent = '$' + (subtotalCents / 100).toFixed(2);
}

function toggleCart(){
  renderCartDrawer();
  document.getElementById('cartDrawer').classList.toggle('open');
  document.getElementById('cartOverlay').classList.toggle('open');
}

function closeCart(){
  document.getElementById('cartDrawer').classList.remove('open');
  document.getElementById('cartOverlay').classList.remove('open');
}

async function checkout(){
  const cart = loadCart();
  if(!cart.length) return;
  if(!CHECKOUT_API){
    showToast('Online checkout is almost ready — message Hayden to complete your order for now <img src="/assets/flower-icon.png" class="flower-emoji" alt="">');
    return;
  }
  const checkoutBtn = document.querySelector('.cart-checkout-btn');
  if(checkoutBtn){ checkoutBtn.disabled = true; checkoutBtn.textContent = 'Redirecting…'; }
  const zipInput = document.getElementById('cartZip');
  const zip = zipInput ? zipInput.value.trim() : '';
  const instagramInput = document.getElementById('cartInstagram');
  const instagram = instagramInput ? instagramInput.value.trim() : '';
  try{
    const res = await fetch(CHECKOUT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: cart.map(item => ({
          name: item.name,
          unitAmount: parsePriceToCents(item.price),
          quantity: item.qty,
          image: item.image,
          productId: item.id,
          colorName: item.colorName || '',
          sizeName: item.sizeName || ''
        })),
        zip,
        instagram
      })
    });
    const data = await res.json();
    if(data.url){ window.location = data.url; }
    else { throw new Error('No checkout URL returned'); }
  }catch(err){
    showToast('Something went wrong starting checkout. Please try again.');
    if(checkoutBtn){ checkoutBtn.disabled = false; checkoutBtn.textContent = 'Checkout'; }
  }
}

function injectBagBadges(){
  document.querySelectorAll('.bag-btn').forEach(btn => {
    if(btn.querySelector('.bag-count')) return;
    const span = document.createElement('span');
    span.className = 'bag-count';
    btn.appendChild(span);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  injectCartDrawer();
  injectBagBadges();
  updateBagBadge();

  const topicSelect = document.querySelector('select[name="topic"]');
  const topicParam = new URLSearchParams(location.search).get('topic');
  if(topicSelect && topicParam){
    const match = Array.from(topicSelect.options).find(o => o.value === topicParam);
    if(match) topicSelect.value = topicParam;
  }
});

document.addEventListener('click', (e) => {
  const addBtn = e.target.closest('.add-to-bag-btn');
  if(addBtn){
    if(addBtn.disabled) return; // sold-out items can't be added to the bag
    const { id, name, price, image, color, size } = addBtn.dataset;
    addToCart(id, name, price, image, color, size);
    showToast(`${name} added to bag`);
    logProductInterest(id, name);
    return;
  }
  const bagBtn = e.target.closest('.bag-btn');
  if(bagBtn){ toggleCart(); return; }
  const qtyBtn = e.target.closest('.cart-qty-btn');
  if(qtyBtn){ changeQty(qtyBtn.dataset.id, parseInt(qtyBtn.dataset.delta, 10)); return; }
  const removeBtn = e.target.closest('.cart-remove-btn');
  if(removeBtn){ removeFromCart(removeBtn.dataset.id); return; }
  const closeEl = e.target.closest('.cart-close-btn, .cart-overlay');
  if(closeEl){ closeCart(); return; }
  const checkoutBtn = e.target.closest('.cart-checkout-btn');
  if(checkoutBtn){ checkout(); return; }
});
