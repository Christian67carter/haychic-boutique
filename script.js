
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

let ALL_PRODUCTS = [];

function renderProductCard(p){
  const statusClass = p.status === 'in-stock' ? 'in-stock' : 'preorder';
  const statusLabel = p.status === 'in-stock' ? 'IN STOCK' : 'PRE-ORDER';
  const bg = p.image ? `background-image:url('${p.image}');background-size:cover;background-position:center;` : '';
  const inner = p.image ? '' : '<span>HAYCHIC</span>';
  const href = `product.html?id=${encodeURIComponent(p.id)}`;
  return `
    <article class="product-card">
      <a class="product-link" href="${href}">
        <div class="product-image placeholder" style="${bg}">${inner}</div>
        <div class="badges"><span class="badge ${statusClass}">${statusLabel}</span></div>
        <h3>${escapeHtml(p.name)}</h3>
        <p class="price">${escapeHtml(p.price)}</p>
      </a>
      <button onclick="showToast('${escapeHtml(p.name).replace(/'/g, "\\'")} added to bag'); logProductInterest('${escapeHtml(p.id)}','${escapeHtml(p.name).replace(/'/g, "\\'")}')">Add to Bag</button>
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

async function loadProductDetail(){
  const wrap = document.getElementById('productDetail');
  if(!wrap) return;
  const id = getQueryParam('id');
  try{
    const res = await fetch('products.json?_=' + Date.now());
    const products = await res.json();
    const p = products.find(x => x.id === id);
    if(!p){
      wrap.innerHTML = '<p style="text-align:center;color:var(--muted);padding:60px 0;grid-column:1/-1;">Sorry, we couldn\'t find that item. <a href="index.html#shop">Back to shop →</a></p>';
      return;
    }
    document.title = `${p.name} | HAYCHIC Boutique`;
    const statusClass = p.status === 'in-stock' ? 'in-stock' : 'preorder';
    const statusLabel = p.status === 'in-stock' ? 'IN STOCK' : 'PRE-ORDER';
    const bg = p.image ? `background-image:url('${p.image}');background-size:cover;background-position:center;` : '';
    const inner = p.image ? '' : '<span>HAYCHIC</span>';
    const desc = p.description ? escapeHtml(p.description) : 'A HAYCHIC favorite, hand-picked for you. Reach out with any questions about sizing, color or availability before you order.';
    const preorderNote = p.status === 'preorder'
      ? `<div class="pdp-note">This is a pre-order item — typical turnaround is about 2–3 weeks. <a href="index.html#preorders">Learn how pre-orders work →</a></div>`
      : '';
    wrap.innerHTML = `
      <div class="pdp-image placeholder" style="${bg}">${inner}</div>
      <div class="pdp-info">
        <span class="badge ${statusClass}">${statusLabel}</span>
        <h1>${escapeHtml(p.name)}</h1>
        <p class="pdp-category">${escapeHtml(p.category || '')}</p>
        <p class="pdp-price">${escapeHtml(p.price)}</p>
        <p class="pdp-desc">${desc}</p>
        ${preorderNote}
        <div class="hero-actions">
          <button class="btn primary" onclick="showToast('${escapeHtml(p.name).replace(/'/g, "\\'")} added to bag'); logProductInterest('${escapeHtml(p.id)}','${escapeHtml(p.name).replace(/'/g, "\\'")}')">Add to Bag</button>
          <a class="btn secondary" href="index.html#request">Ask a Question</a>
        </div>
      </div>`;
    if(window.HAYCHIC_logActivity){
      window.HAYCHIC_logActivity('product_view', { productId: p.id, productName: p.name });
    }
  }catch(err){
    wrap.innerHTML = '<p style="text-align:center;color:var(--muted);padding:60px 0;grid-column:1/-1;">Could not load this item right now.</p>';
  }
}
document.addEventListener('DOMContentLoaded', loadProductDetail);
