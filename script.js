
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function loadProducts(){
  const grid = document.getElementById('products');
  if(!grid) return;
  try{
    const res = await fetch('products.json?_=' + Date.now());
    const products = await res.json();
    if(!products.length){
      grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--muted);">New arrivals coming soon ♡</p>';
      return;
    }
    grid.innerHTML = products.map(p => {
      const statusClass = p.status === 'in-stock' ? 'in-stock' : 'preorder';
      const statusLabel = p.status === 'in-stock' ? 'IN STOCK' : 'PRE-ORDER';
      const bg = p.image ? `background-image:url('${p.image}');background-size:cover;background-position:center;` : '';
      const inner = p.image ? '' : '<span>HAYCHIC</span>';
      return `
        <article class="product-card">
          <div class="product-image placeholder" style="${bg}">${inner}</div>
          <div class="badges"><span class="badge ${statusClass}">${statusLabel}</span></div>
          <h3>${escapeHtml(p.name)}</h3>
          <p class="price">${escapeHtml(p.price)}</p>
          <button onclick="showToast('${escapeHtml(p.name).replace(/'/g, "\\'")} added to bag'); logProductInterest('${escapeHtml(p.id)}','${escapeHtml(p.name).replace(/'/g, "\\'")}')">Add to Bag</button>
        </article>`;
    }).join('');
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
