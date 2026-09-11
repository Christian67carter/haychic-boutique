

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


// ─── Product Loading ──────────────────────────────────────────────────────────
// Fetches /products.json and populates all product grids on the page.

let _productsPromise = null;
function fetchProducts() {
  if (!_productsPromise) {
    _productsPromise = fetch('/products.json')
      .then(r => { if (!r.ok) throw new Error('Failed to load products'); return r.json(); })
      .then(data => { ALL_PRODUCTS = Array.isArray(data) ? data : []; return ALL_PRODUCTS; });
  }
  return _productsPromise;
}

// Build a product card HTML string for the given product object.
function productCardHtml(p) {
  const status = effectiveProductStatus(p);
  const si = statusInfo(status);
  const isSoldOut = status === 'sold-out';
  const isPreorder = status === 'preorder';

  // Determine display image — use first color image if colors exist
  const img = (p.colors && p.colors.length > 0 && p.colors[0].image) ? p.colors[0].image : p.image;

  // Color swatches (up to 6)
  let swatchesHtml = '';
  if (p.colors && p.colors.length > 1) {
    const shown = p.colors.slice(0, 6);
    swatchesHtml = `<div class="mini-swatches" style="display:flex;gap:4px;flex-wrap:wrap;margin:6px 0;">
      ${shown.map((c, i) => {
        const cs = c.status || 'in-stock';
        const soldCls = cs === 'sold-out' ? ' is-soldout' : (cs === 'in-stock' ? ' is-instock' : '');
        const style = c.image
          ? `background-image:url('${escapeHtml(c.image)}');background-size:cover;background-position:center;`
          : '';
        return `<button class="mini-swatch${soldCls}${i===0?' active':''}" style="${style}" title="${escapeHtml(c.name)}" aria-label="${escapeHtml(c.name)}" data-img="${escapeHtml(c.image||p.image||'')}"></button>`;
      }).join('')}
    </div>`;
  }

  // Urgency badge (uses top-level qty for simple products)
  const urgency = urgencyHtml(typeof p.qty === 'number' ? p.qty : undefined);

  const btnLabel = isSoldOut ? 'Sold Out' : (isPreorder ? 'Pre-Order' : 'Shop Now');

  return `<div class="product-card">
    <a href="/${escapeHtml(p.id)}.html" style="text-decoration:none;color:inherit;display:block;">
      <div class="product-img-wrap" style="position:relative;overflow:hidden;border-radius:12px;background:var(--cream);">
        <img src="${escapeHtml(img)}" alt="${escapeHtml(p.name)}" loading="lazy"
             style="width:100%;aspect-ratio:1/1;object-fit:cover;display:block;"
             onerror="this.style.background='var(--pink)';this.removeAttribute('src')">
        <span class="status-badge ${si.cls}" style="position:absolute;top:10px;left:10px;background:${si.cls==='in-stock'?'#6a9955':si.cls==='preorder'?'var(--pink-dark)':'#aaa'};color:#fff;font-size:.65rem;font-weight:800;letter-spacing:.05em;padding:3px 8px;border-radius:999px;text-transform:uppercase;">${si.label}</span>
      </div>
      <h3>${escapeHtml(p.name)}</h3>
      <p class="price">${escapeHtml(p.price)}</p>
      ${urgency}
    </a>
    ${swatchesHtml}
    <a href="/${escapeHtml(p.id)}.html" style="display:block;">
      <button${isSoldOut ? ' disabled' : ''}>${escapeHtml(btnLabel)}</button>
    </a>
  </div>`;
}

// Render an array of products into a grid element, or show an empty message.
function renderProducts(products, gridEl) {
  if (!gridEl) return;
  if (!products || products.length === 0) {
    gridEl.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--muted);">No products found.</p>';
    return;
  }
  gridEl.innerHTML = products.map(productCardHtml).join('');

  // Wire up color swatch clicks to swap the card image
  gridEl.querySelectorAll('.product-card').forEach(card => {
    card.querySelectorAll('.mini-swatch').forEach(sw => {
      sw.addEventListener('click', e => {
        e.preventDefault();
        const img = sw.dataset.img;
        if (!img) return;
        const cardImg = card.querySelector('.product-img-wrap img');
        if (cardImg) cardImg.src = img;
        card.querySelectorAll('.mini-swatch').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
      });
    });
  });
}

// Filter ALL_PRODUCTS by category and render into #products (shop page).
function applyFilter(category) {
  const grid = document.getElementById('products');
  if (!grid) return;

  // Update active filter pill
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.cat === category);
  });

  const filtered = category === 'All'
    ? ALL_PRODUCTS.slice()
    : ALL_PRODUCTS.filter(p => p.category === category);

  renderProducts(filtered, grid);
}

// Load products into all grids present on this page.
document.addEventListener('DOMContentLoaded', () => {
  fetchProducts().then(products => {
    // Shop page — #products grid
    const shopGrid = document.getElementById('products');
    if (shopGrid) {
      // Check for ?category= param
      const cat = new URLSearchParams(location.search).get('category');
      applyFilter(cat && cat !== 'all' ? cat.charAt(0).toUpperCase() + cat.slice(1) : 'All');
    }

    // New Arrivals page — #newarrivals-products
    const naGrid = document.getElementById('newarrivals-products');
    if (naGrid) renderProducts(products.slice(0, 12), naGrid);

    // Home page new arrivals — #home-newarrivals
    const homeGrid = document.getElementById('home-newarrivals');
    if (homeGrid) renderProducts(products.slice(0, 8), homeGrid);

    // Pre-Orders page — #preorder-products
    const poGrid = document.getElementById('preorder-products');
    if (poGrid) renderProducts(products.filter(p => effectiveProductStatus(p) === 'preorder'), poGrid);

    // In Stock page — #instock-products
    const isGrid = document.getElementById('instock-products');
    if (isGrid) renderProducts(products.filter(p => effectiveProductStatus(p) === 'in-stock'), isGrid);
  }).catch(err => {
    console.error('Could not load products:', err);
    ['products','newarrivals-products','home-newarrivals','preorder-products','instock-products'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--muted);">Unable to load products. Please refresh.</p>';
    });
  });
});

// ─── Product Detail Page ────────────────────────────────────────────
// Renders individual product pages. Each product HTML file has a
// <div id="productDetail"> that this populates from products.json.
// Per-color inventory: each color can independently be in-stock or preorder.
// Sold-out colors are treated as pre-orderable (never show per-color sold out).

document.addEventListener('DOMContentLoaded', () => {
  const detailEl = document.getElementById('productDetail');
  if (!detailEl) return;

  const slug = location.pathname.replace(/^\//, '').replace(/\.html$/, '');

  fetchProducts().then(products => {
    const p = products.find(prod => prod.id === slug);
    if (!p) {
      detailEl.innerHTML = '<p style="text-align:center;padding:60px 0;color:var(--muted);">Product not found.</p>';
      return;
    }

    document.title = p.name + ' | HAYCHIC Boutique';
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.content = p.description || 'Shop ' + p.name + ' from HAYCHIC Boutique.';

    const colors = Array.isArray(p.colors) && p.colors.length ? p.colors : [];
    const hasColors = colors.length > 0;
    let selectedColorIdx = 0;
    let qty = 1;

    function getSelectedColor() { return hasColors ? colors[selectedColorIdx] : null; }

    // Per-color status: sold-out or in-stock+qty=0 -> preorder (always orderable)
    function colorStatus(c) {
      if (!c) return effectiveProductStatus(p);
      const raw = c.status || 'in-stock';
      const cQty = typeof c.qty === 'number' ? c.qty : undefined;
      if (raw === 'sold-out') return 'preorder';
      if (raw === 'in-stock' && cQty === 0) return 'preorder';
      return raw;
    }

    function getSelectedStatus() { return colorStatus(getSelectedColor()); }

    // Status info block HTML for the currently selected color
    function buildStatusHtml() {
      const c = getSelectedColor();
      const status = getSelectedStatus();
      const cQty = (c && typeof c.qty === 'number') ? c.qty : (typeof p.qty === 'number' ? p.qty : undefined);

      if (status === 'preorder') {
        return '<div id="pdp-status-info" style="padding:10px 14px;background:#fdf7f0;border-radius:10px;border:1px solid #e8cdb0;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
          '<span style="font-size:.7rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;background:var(--pink-dark,#c48b70);color:#fff;padding:3px 10px;border-radius:999px;white-space:nowrap;">PRE-ORDER</span>' +
          '<span style="font-size:.88rem;color:var(--muted,#7A6F5C);">This color ships when it arrives — we'll email you updates.</span>' +
          '</div>';
      }

      let qtyNote = '';
      if (typeof cQty === 'number' && cQty > 0) {
        qtyNote = cQty <= LOW_STOCK_THRESHOLD
          ? ' — <strong style="color:#c0392b;">Only ' + cQty + ' left!</strong>'
          : ' — ' + cQty + ' available';
      }
      return '<div id="pdp-status-info" style="padding:10px 14px;background:#f0f7f0;border-radius:10px;border:1px solid #b8d8b8;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
        '<span style="font-size:.7rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;background:#6a9955;color:#fff;padding:3px 10px;border-radius:999px;white-space:nowrap;">IN STOCK</span>' +
        '<span style="font-size:.88rem;color:#2d5a2d;">✓ Ready to ship' + qtyNote + '</span>' +
        '</div>';
    }

    function render() {
      const c = getSelectedColor();
      const mainImg = (c && c.image) ? c.image : p.image;
      const selStatus = getSelectedStatus();
      const isPreorder = selStatus === 'preorder';

      const thumbsHtml = hasColors && colors.length > 1
        ? '<div id="pdp-thumbs" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">' +
          colors.slice(0, 8).map((col, i) =>
            '<img src="' + escapeHtml(col.image || p.image) + '" alt="' + escapeHtml(col.name) + '" data-idx="' + i + '" class="pdp-thumb" style="width:60px;height:60px;border-radius:8px;object-fit:cover;cursor:pointer;border:2px solid ' + (i === 0 ? 'var(--brown,#4A3F2E)' : 'var(--line,#E3D9C3)') + ';flex-shrink:0;">'
          ).join('') + '</div>' : '';

      const hasPreorderColors = hasColors && colors.some(col => colorStatus(col) === 'preorder');

      const swatchesHtml = hasColors && colors.length > 1
        ? '<div><p style="margin:0 0 8px;font-size:.9rem;font-weight:600;">Color: <span id="pdp-color-label" style="font-weight:400;">' + escapeHtml(colors[0].name) + '</span></p>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
          colors.map((col, i) => {
            const isPreCol = colorStatus(col) === 'preorder';
            const bkg = col.image ? 'background-image:url(\'' + escapeHtml(col.image) + '\');background-size:cover;background-position:center;' : 'background:var(--cream,#F2E9DA);';
            return '<button class="pdp-swatch" data-idx="' + i + '" style="' + bkg + 'width:44px;height:44px;border-radius:8px;border:2px solid ' + (i === 0 ? 'var(--brown,#4A3F2E)' : 'var(--line,#E3D9C3)') + ';cursor:pointer;flex-shrink:0;padding:0;position:relative;" title="' + escapeHtml(col.name) + (isPreCol ? ' (Pre-Order)' : '') + '" aria-label="' + escapeHtml(col.name) + '">' +
              (isPreCol ? '<span style="position:absolute;bottom:-2px;right:-2px;width:12px;height:12px;border-radius:50%;background:var(--pink-dark,#c48b70);border:1.5px solid #fff;display:block;pointer-events:none;"></span>' : '') +
              '</button>';
          }).join('') + '</div>' +
          (hasPreorderColors ? '<p style="font-size:.72rem;color:var(--muted,#7A6F5C);margin:5px 0 0;"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--pink-dark,#c48b70);vertical-align:middle;margin-right:4px;"></span>= Pre-Order color</p>' : '') +
          '</div>' : '';

      const btnBg = isPreorder ? 'var(--pink-dark,#c48b70)' : 'var(--brown,#4A3F2E)';
      const btnLabel = isPreorder ? 'Pre-Order' : 'Add to Bag';

      detailEl.innerHTML =
        '<style>@media(max-width:620px){.pdp-layout{grid-template-columns:1fr!important;gap:24px!important;}} .pdp-thumb:hover,.pdp-swatch:hover{opacity:.8;} #pdp-add-btn{transition:background .25s,border-color .25s;}</style>' +
        '<div class="pdp-layout" style="display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:start;max-width:960px;margin:24px auto;padding:0 20px;">' +
          '<div>' +
            '<img id="pdp-main-img" src="' + escapeHtml(mainImg) + '" alt="' + escapeHtml(p.name) + '" style="width:100%;border-radius:16px;object-fit:cover;aspect-ratio:1/1;display:block;">' +
            thumbsHtml +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:14px;padding-top:4px;">' +
            '<h1 style="font-family:\'Playfair Display\',serif;font-size:1.9rem;margin:0;line-height:1.2;">' + escapeHtml(p.name) + '</h1>' +
            '<p style="font-size:1.25rem;font-weight:700;margin:0;">' + escapeHtml(p.price) + '</p>' +
            (p.description ? '<p style="color:var(--muted,#7A6F5C);line-height:1.65;margin:0;">' + escapeHtml(p.description) + '</p>' : '') +
            swatchesHtml +
            buildStatusHtml() +
            '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
              '<div style="display:flex;align-items:center;border:1px solid var(--line,#E3D9C3);border-radius:999px;overflow:hidden;">' +
                '<button id="pdp-dec" aria-label="Decrease quantity" style="width:40px;height:40px;border:none;background:none;cursor:pointer;font-size:1.3rem;line-height:1;">−</button>' +
                '<span id="pdp-qty-display" style="min-width:32px;text-align:center;font-weight:700;font-size:.95rem;">' + qty + '</span>' +
                '<button id="pdp-inc" aria-label="Increase quantity" style="width:40px;height:40px;border:none;background:none;cursor:pointer;font-size:1.3rem;line-height:1;">+</button>' +
              '</div>' +
              '<button id="pdp-add-btn" style="flex:1;min-width:140px;padding:13px 20px;border-radius:999px;font-weight:700;font-size:.95rem;border:1px solid ' + btnBg + ';background:' + btnBg + ';color:#fff;cursor:pointer;">' + btnLabel + '</button>' +
            '</div>' +
            '<p id="pdp-preorder-note" style="font-size:.82rem;color:var(--muted,#7A6F5C);margin:0;' + (isPreorder ? '' : 'display:none;') + '">Pre-orders ship when your item arrives — we'll email you with updates!</p>' +
          '</div>' +
        '</div>';

      wireEvents();
    }

    // Update only dynamic parts when color changes — no full re-render, no scroll jump
    function updateForColor() {
      const c = getSelectedColor();
      const mainImg = (c && c.image) ? c.image : p.image;
      const selStatus = getSelectedStatus();
      const isPreorder = selStatus === 'preorder';

      const mainImgEl = document.getElementById('pdp-main-img');
      if (mainImgEl) mainImgEl.src = mainImg;

      const colorLabel = document.getElementById('pdp-color-label');
      if (colorLabel && c) colorLabel.textContent = c.name;

      detailEl.querySelectorAll('.pdp-swatch').forEach((sw, i) => {
        sw.style.borderColor = i === selectedColorIdx ? 'var(--brown,#4A3F2E)' : 'var(--line,#E3D9C3)';
      });
      detailEl.querySelectorAll('.pdp-thumb').forEach((th, i) => {
        th.style.borderColor = i === selectedColorIdx ? 'var(--brown,#4A3F2E)' : 'var(--line,#E3D9C3)';
      });

      const existingStatus = document.getElementById('pdp-status-info');
      if (existingStatus) {
        const tmp = document.createElement('div');
        tmp.innerHTML = buildStatusHtml();
        existingStatus.replaceWith(tmp.firstElementChild);
      }

      const addBtn = document.getElementById('pdp-add-btn');
      if (addBtn) {
        const btnBg = isPreorder ? 'var(--pink-dark,#c48b70)' : 'var(--brown,#4A3F2E)';
        addBtn.textContent = isPreorder ? 'Pre-Order' : 'Add to Bag';
        addBtn.style.background = btnBg;
        addBtn.style.borderColor = btnBg;
      }

      const note = document.getElementById('pdp-preorder-note');
      if (note) note.style.display = isPreorder ? '' : 'none';
    }

    function wireEvents() {
      detailEl.querySelectorAll('.pdp-swatch,.pdp-thumb').forEach(el => {
        el.addEventListener('click', () => {
          selectedColorIdx = +el.dataset.idx;
          updateForColor();
        });
      });

      const qtyEl = document.getElementById('pdp-qty-display');
      const dec = document.getElementById('pdp-dec');
      const inc = document.getElementById('pdp-inc');
      const addBtn = document.getElementById('pdp-add-btn');

      if (dec) dec.onclick = () => { if (qty > 1) { qty--; if (qtyEl) qtyEl.textContent = qty; } };
      if (inc) inc.onclick = () => { qty++; if (qtyEl) qtyEl.textContent = qty; };
      if (addBtn) {
        addBtn.onclick = () => {
          const label = addBtn.textContent;
          addBtn.textContent = '✓ Added!';
          addBtn.style.background = '#6a9955';
          addBtn.style.borderColor = '#6a9955';
          setTimeout(() => {
            const bg = getSelectedStatus() === 'preorder' ? 'var(--pink-dark,#c48b70)' : 'var(--brown,#4A3F2E)';
            addBtn.textContent = label;
            addBtn.style.background = bg;
            addBtn.style.borderColor = bg;
          }, 1800);
        };
      }
    }

    render();

  }).catch(() => {
    detailEl.innerHTML = '<p style="text-align:center;padding:60px 0;color:var(--muted);">Could not load this product. Please refresh.</p>';
  });
});
