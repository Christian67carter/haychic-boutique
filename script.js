
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

let ALL_PRODUCTS = [];

function renderProductCard(p){
  const statusClass = p.status === 'in-stock' ? 'in-stock' : 'preorder';
  const statusLabel = p.status === 'in-stock' ? 'IN STOCK' : 'PRE-ORDER';
  const bg = p.image ? `background-image:url('${p.image}');background-size:cover;background-position:center;` : '';
  const inner = p.image ? '' : '<span>HAYCHIC</span>';
  const href = `/${encodeURIComponent(p.id)}`;
  return `
    <article class="product-card">
      <a class="product-link" href="${href}">
        <div class="product-image placeholder" style="${bg}">${inner}</div>
        <div class="badges"><span class="badge ${statusClass}">${statusLabel}</span></div>
        <h3>${escapeHtml(p.name)}</h3>
        <p class="price">${escapeHtml(p.price)}</p>
      </a>
      <button class="add-to-bag-btn" data-id="${escapeHtml(p.id)}" data-name="${escapeHtml(p.name)}" data-price="${escapeHtml(p.price)}" data-image="${escapeHtml(p.image || '')}">Add to Bag</button>
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
  renderGrid(document.getElementById('products'), filtered, 'New arrivals coming soon ♡');
}

async function loadProducts(){
  const grid = document.getElementById('products');
  if(!grid) return;
  try{
    const res = await fetch('products.json?_=' + Date.now());
    ALL_PRODUCTS = await res.json();
    applyFilter('All');
    renderGrid(document.getElementById('preorder-products'), ALL_PRODUCTS.filter(p => p.status === 'preorder'), 'Pre-order picks coming soon ♡');
  }catch(err){
    grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--muted);">Could not load products right now.</p>';
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
  t.textContent=message;
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
  showToast('Request captured — connect this form to Shopify or email next ♡');
  form.reset();
}
function newsletter(e){
  e.preventDefault();
  showToast('You’re on the HAYCHIC list ♡');
  e.target.reset();
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
      wrap.innerHTML = '<p style="text-align:center;color:var(--muted);padding:60px 0;grid-column:1/-1;">Sorry, we couldn\'t find that item. <a href="index.html#shop">Back to shop →</a></p>';
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
      const activeStatus = (selectedSize && selectedSize.status) || (selectedColor && selectedColor.status) || p.status;
      const activeImage = (selectedColor && selectedColor.image) || p.image;
      const statusClass = activeStatus === 'in-stock' ? 'in-stock' : 'preorder';
      const statusLabel = activeStatus === 'in-stock' ? 'IN STOCK' : 'PRE-ORDER';
      const bg = activeImage ? `background-image:url('${activeImage}');background-size:cover;background-position:center;` : '';
      const inner = activeImage ? '' : '<span>HAYCHIC</span>';
      const desc = p.description ? escapeHtml(p.description) : 'A HAYCHIC favorite, hand-picked for you. Reach out with any questions about sizing, color or availability before you order.';
      const preorderNote = activeStatus === 'preorder'
        ? `<div class="pdp-note">This is a pre-order item — typical turnaround is about 2–3 weeks. <a href="index.html#preorders">Learn how pre-orders work →</a></div>`
        : '';
      const nameParts = [p.name];
      if(hasColors) nameParts.push(selectedColor.name);
      if(hasSizes) nameParts.push(selectedSize.name);
      const displayName = nameParts.join(' — ');
      const swatches = hasColors ? `
        <div class="pdp-colors">
          <span class="pdp-colors-label">Color: <strong>${escapeHtml(selectedColor.name)}</strong></span>
          <div class="swatch-row">
            ${p.colors.map((c, i) => `<button type="button" class="color-swatch ${c === selectedColor ? 'active' : ''}" data-idx="${i}" style="${c.image ? `background-image:url('${c.image}')` : ''}" title="${escapeHtml(c.name)}"></button>`).join('')}
          </div>
        </div>` : '';
      const sizePicker = hasSizes ? `
        <div class="pdp-sizes">
          <span class="pdp-sizes-label">Size: <strong>${escapeHtml(selectedSize.name)}</strong></span>
          <div class="size-row">
            ${p.sizes.map((s, i) => `<button type="button" class="size-pill ${s === selectedSize ? 'active' : ''} ${s.status === 'preorder' ? 'is-preorder' : ''}" data-idx="${i}">${escapeHtml(s.name)}</button>`).join('')}
          </div>
        </div>` : '';
      wrap.innerHTML = `
        <div class="pdp-image placeholder" style="${bg}">${inner}</div>
        <div class="pdp-info">
          <span class="badge ${statusClass}">${statusLabel}</span>
          <h1>${escapeHtml(p.name)}</h1>
          <p class="pdp-category">${escapeHtml(p.category || '')}</p>
          <p class="pdp-price">${escapeHtml(p.price)}</p>
          ${swatches}
          ${sizePicker}
          <p class="pdp-desc">${desc}</p>
          ${preorderNote}
          <div class="hero-actions">
            <button class="btn primary add-to-bag-btn" data-id="${escapeHtml(p.id)}" data-name="${escapeHtml(displayName)}" data-price="${escapeHtml(p.price)}" data-image="${escapeHtml(activeImage || '')}">Add to Bag</button>
            <a class="btn secondary" href="index.html#request">Ask a Question</a>
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
        wrap.querySelectorAll('.size-pill').forEach(btn => {
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

function addToCart(id, name, priceStr, image){
  const cart = loadCart();
  const existing = cart.find(item => item.id === id);
  if(existing){ existing.qty += 1; }
  else { cart.push({ id, name, price: priceStr, image: image || '', qty: 1 }); }
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
        <h3>Your Bag ♡</h3>
        <button class="cart-close-btn" aria-label="Close bag">✕</button>
      </div>
      <div id="cartItems" class="cart-items"></div>
      <div class="cart-drawer-footer">
        <div class="cart-subtotal"><span>Subtotal</span><strong id="cartSubtotal">$0.00</strong></div>
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
    itemsWrap.innerHTML = '<p class="cart-empty">Your bag is empty ♡<br>Go find something you love!</p>';
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
    showToast('Online checkout is almost ready — message Hayden to complete your order for now ♡');
    return;
  }
  const checkoutBtn = document.querySelector('.cart-checkout-btn');
  if(checkoutBtn){ checkoutBtn.disabled = true; checkoutBtn.textContent = 'Redirecting…'; }
  try{
    const res = await fetch(CHECKOUT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: cart.map(item => ({
          name: item.name,
          unitAmount: parsePriceToCents(item.price),
          quantity: item.qty,
          image: item.image
        }))
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
});

document.addEventListener('click', (e) => {
  const addBtn = e.target.closest('.add-to-bag-btn');
  if(addBtn){
    const { id, name, price, image } = addBtn.dataset;
    addToCart(id, name, price, image);
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
