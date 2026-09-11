// \u2500\u2500\u2500 Utilities \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function statusInfo(status) {
  if (status === 'sold-out') return { cls: 'sold-out', label: 'SOLD OUT' };
  if (status === 'preorder')  return { cls: 'preorder',  label: 'PRE-ORDER' };
  return { cls: 'in-stock', label: 'IN STOCK' };
}

const LOW_STOCK_THRESHOLD = 3;

function urgencyHtml(qty) {
  if (typeof qty !== 'number' || qty <= 0 || qty > LOW_STOCK_THRESHOLD) return '';
  return '<span class="urgency-badge">Only ' + qty + ' left!</span>';
}

let ALL_PRODUCTS = [];

function effectiveProductStatus(p) {
  return (p.status === 'in-stock' && p.qty === 0) ? 'preorder' : p.status;
}

// \u2500\u2500\u2500 Product Loading \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
let _productsPromise = null;
function fetchProducts() {
  if (!_productsPromise) {
    _productsPromise = fetch('/products.json')
      .then(function(r) { if (!r.ok) throw new Error('Failed to load products'); return r.json(); })
      .then(function(data) { ALL_PRODUCTS = Array.isArray(data) ? data : []; return ALL_PRODUCTS; });
  }
  return _productsPromise;
}

function productCardHtml(p) {
  var status = effectiveProductStatus(p);
  var si = statusInfo(status);
  var isSoldOut = status === 'sold-out';
  var isPreorder = status === 'preorder';
  var img = (p.colors && p.colors.length > 0 && p.colors[0].image) ? p.colors[0].image : p.image;

  var swatchesHtml = '';
  if (p.colors && p.colors.length > 1) {
    var shown = p.colors.slice(0, 6);
    swatchesHtml = '<div class="mini-swatches" style="display:flex;gap:4px;flex-wrap:wrap;margin:6px 0;">' +
      shown.map(function(c, i) {
        var cs = c.status || 'in-stock';
        var soldCls = cs === 'sold-out' ? ' is-soldout' : (cs === 'in-stock' ? ' is-instock' : '');
        var style = c.image ? "background-image:url('" + escapeHtml(c.image) + "');background-size:cover;background-position:center;" : '';
        return '<button class="mini-swatch' + soldCls + (i===0?' active':'') + '" style="' + style + '" title="' + escapeHtml(c.name) + '" aria-label="' + escapeHtml(c.name) + '" data-img="' + escapeHtml(c.image||p.image||'') + '"></button>';
      }).join('') +
      '</div>';
  }

  var urgency = urgencyHtml(typeof p.qty === 'number' ? p.qty : undefined);
  var btnLabel = isSoldOut ? 'Sold Out' : (isPreorder ? 'Pre-Order' : 'Shop Now');
  var bgColor = si.cls === 'in-stock' ? '#6a9955' : (si.cls === 'preorder' ? 'var(--pink-dark)' : '#aaa');

  return '<div class="product-card">' +
    '<a href="/' + escapeHtml(p.id) + '.html" style="text-decoration:none;color:inherit;display:block;">' +
      '<div class="product-img-wrap" style="position:relative;overflow:hidden;border-radius:12px;background:var(--cream);">' +
        '<img src="' + escapeHtml(img) + '" alt="' + escapeHtml(p.name) + '" loading="lazy"' +
          ' style="width:100%;aspect-ratio:1/1;object-fit:cover;display:block;"' +
          ' onerror="this.hidden=true">' +
        '<span class="status-badge ' + si.cls + '" style="position:absolute;top:10px;left:10px;background:' + bgColor + ';color:#fff;font-size:.65rem;font-weight:800;letter-spacing:.05em;padding:3px 8px;border-radius:999px;text-transform:uppercase;">' + si.label + '</span>' +
      '</div>' +
      '<h3>' + escapeHtml(p.name) + '</h3>' +
      '<p class="price">' + escapeHtml(p.price) + '</p>' +
      urgency +
    '</a>' +
    swatchesHtml +
    '<a href="/' + escapeHtml(p.id) + '.html" style="display:block;">' +
      '<button' + (isSoldOut ? ' disabled' : '') + '>' + escapeHtml(btnLabel) + '</button>' +
    '</a>' +
  '</div>';
}

function renderProducts(products, gridEl) {
  if (!gridEl) return;
  if (!products || products.length === 0) {
    gridEl.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--muted);">No products found.</p>';
    return;
  }
  gridEl.innerHTML = products.map(productCardHtml).join('');
  gridEl.querySelectorAll('.product-card').forEach(function(card) {
    card.querySelectorAll('.mini-swatch').forEach(function(sw) {
      sw.addEventListener('click', function(e) {
        e.preventDefault();
        var img = sw.dataset.img;
        if (!img) return;
        var cardImg = card.querySelector('.product-img-wrap img');
        if (cardImg) cardImg.src = img;
        card.querySelectorAll('.mini-swatch').forEach(function(s) { s.classList.remove('active'); });
        sw.classList.add('active');
      });
    });
  });
}

function applyFilter(category) {
  var grid = document.getElementById('products');
  if (!grid) return;
  document.querySelectorAll('.filter-pill').forEach(function(pill) {
    pill.classList.toggle('active', pill.dataset.cat === category);
  });
  var filtered = category === 'All' ? ALL_PRODUCTS.slice() : ALL_PRODUCTS.filter(function(p) { return p.category === category; });
  renderProducts(filtered, grid);
}

// \u2500\u2500\u2500 DOMContentLoaded \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
document.addEventListener('DOMContentLoaded', function() {

  // \u2500\u2500 Product Detail Page \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  var detailEl = document.getElementById('productDetail');
  if (detailEl) {
    var slug = location.pathname.replace(/^\//, '').replace(/\.html$/, '');
    fetchProducts().then(function(products) {
      var p = null;
      for (var i = 0; i < products.length; i++) {
        if (products[i].id === slug) { p = products[i]; break; }
      }
      if (!p) {
        detailEl.innerHTML = '<p style="text-align:center;padding:40px;">Product not found.</p>';
        return;
      }

      // Per-color status helpers
      function colorStatus(c) {
        if (!c) return effectiveProductStatus(p);
        var raw = c.status || 'in-stock';
        var cQty = typeof c.qty === 'number' ? c.qty : undefined;
        if (raw === 'sold-out') return 'preorder';
        if (raw === 'in-stock' && cQty === 0) return 'preorder';
        return raw;
      }

      var selectedColorIndex = 0;

      function getSelectedColor() {
        return (p.colors && p.colors.length > 0) ? p.colors[selectedColorIndex] : null;
      }
      function getSelectedStatus() { return colorStatus(getSelectedColor()); }

      function buildStatusHtml() {
        var c = getSelectedColor();
        var status = getSelectedStatus();
        var cQty = (c && typeof c.qty === 'number') ? c.qty : (typeof p.qty === 'number' ? p.qty : undefined);
        if (status === 'preorder') {
          return '<div id="pdp-status-info" style="margin:12px 0;padding:10px 14px;background:#fdf0f4;border:1.5px solid var(--pink-dark,#c48b70);border-radius:8px;font-size:.85rem;font-weight:700;color:var(--pink-dark,#c48b70);letter-spacing:.04em;">PRE-ORDER \u2014 This color ships when it arrives</div>';
        }
        var qtyNote = '';
        if (typeof cQty === 'number' && cQty > 0) {
          if (cQty <= LOW_STOCK_THRESHOLD) {
            qtyNote = ' \u2014 <strong style="color:#c0392b;">Only ' + cQty + ' left!</strong>';
          } else {
            qtyNote = ' \u2014 ' + cQty + ' available';
          }
        }
        return '<div id="pdp-status-info" style="margin:12px 0;padding:10px 14px;background:#f0faf3;border:1.5px solid #6a9955;border-radius:8px;font-size:.85rem;font-weight:700;color:#3a7a2a;letter-spacing:.04em;">IN STOCK' + qtyNote + '</div>';
      }

      // Build initial HTML
      var colors = p.colors || [];
      var hasColors = colors.length > 0;
      var firstImg = (hasColors && colors[0].image) ? colors[0].image : (p.image || '');
      var hasAnyPreorder = hasColors && colors.some(function(c) { return colorStatus(c) === 'preorder'; });

      var swatchesHtml = '';
      if (hasColors) {
        swatchesHtml = '<div id="pdp-swatches" style="display:flex;flex-wrap:wrap;gap:10px;margin:14px 0 4px;">' +
          colors.map(function(c, i) {
            var isPre = colorStatus(c) === 'preorder';
            var imgStyle = c.image ? "background-image:url('" + escapeHtml(c.image) + "');background-size:cover;background-position:center;" : '';
            var borderStyle = i === 0 ? '3px solid var(--brown,#4A3F2E)' : '2px solid #ddd';
            var dot = isPre ? '<span style="position:absolute;bottom:1px;right:1px;width:10px;height:10px;border-radius:50%;background:var(--pink-dark,#c48b70);border:1.5px solid #fff;display:block;"></span>' : '';
            return '<button class="pdp-swatch' + (i===0?' selected':'') + '" data-idx="' + i + '"' +
              ' style="width:48px;height:48px;border-radius:50%;border:' + borderStyle + ';cursor:pointer;position:relative;overflow:visible;' + imgStyle + 'background-color:' + (c.image?'transparent':'#eee') + ';"' +
              ' title="' + escapeHtml(c.name) + '" aria-label="' + escapeHtml(c.name) + '">' +
              dot + '</button>';
          }).join('') +
          '</div>' +
          (hasAnyPreorder ? '<p style="font-size:.75rem;color:var(--pink-dark,#c48b70);margin:0 0 12px;">\u25CF = Pre-Order color</p>' : '') +
          '<p id="pdp-color-label" style="font-size:.9rem;font-weight:600;margin:4px 0 0;">' + escapeHtml(colors[0].name) + '</p>';
      }

      var initStatus = getSelectedStatus();
      var initBtnBg = initStatus === 'preorder' ? 'var(--pink-dark,#c48b70)' : 'var(--brown,#4A3F2E)';
      var initBtnLabel = initStatus === 'preorder' ? 'Pre-Order' : 'Add to Bag';

      document.title = p.name + ' | HAYCHIC Boutique';

      detailEl.innerHTML =
        '<div style="display:flex;flex-wrap:wrap;gap:32px;max-width:960px;margin:0 auto;padding:24px 16px;">' +
          '<div style="flex:1 1 340px;min-width:0;">' +
            '<img id="pdp-main-img" src="' + escapeHtml(firstImg) + '" alt="' + escapeHtml(p.name) + '"' +
              ' style="width:100%;border-radius:16px;object-fit:cover;aspect-ratio:1/1;display:block;"' +
          ' onerror="this.hidden=true">' +
          '</div>' +
          '<div style="flex:1 1 280px;min-width:0;">' +
            '<h1 style="margin:0 0 8px;font-size:1.6rem;">' + escapeHtml(p.name) + '</h1>' +
            '<p class="price" style="font-size:1.3rem;margin:0 0 12px;">' + escapeHtml(p.price) + '</p>' +
            buildStatusHtml() +
            swatchesHtml +
            '<div style="display:flex;align-items:center;gap:12px;margin:16px 0;">' +
              '<button id="pdp-qty-minus" style="width:36px;height:36px;border-radius:50%;border:1.5px solid #ccc;background:#fff;font-size:1.2rem;cursor:pointer;">\u2212</button>' +
              '<span id="pdp-qty-val" style="font-size:1.1rem;font-weight:700;min-width:24px;text-align:center;">1</span>' +
              '<button id="pdp-qty-plus" style="width:36px;height:36px;border-radius:50%;border:1.5px solid #ccc;background:#fff;font-size:1.2rem;cursor:pointer;">+</button>' +
            '</div>' +
            '<button id="pdp-add-btn" style="width:100%;padding:14px;background:' + initBtnBg + ';color:#fff;border:none;border-radius:10px;font-size:1rem;font-weight:700;letter-spacing:.05em;cursor:pointer;">' + initBtnLabel + '</button>' +
            '<p id="pdp-preorder-note" style="font-size:.8rem;color:var(--muted);margin:8px 0 0;display:' + (initStatus==='preorder'?'block':'none') + ';">Pre-orders are charged now and ship when the item arrives.</p>' +
            (p.description ? '<p style="margin:20px 0 0;line-height:1.7;color:var(--muted);">' + escapeHtml(p.description) + '</p>' : '') +
          '</div>' +
        '</div>';

      // Update only changed parts when color switches \u2014 no scroll jump
      function updateForColor() {
        var c = getSelectedColor();
        var status = getSelectedStatus();
        var newImg = (c && c.image) ? c.image : p.image;
        var mainImg = document.getElementById('pdp-main-img');
        if (mainImg && newImg) mainImg.src = newImg;

        var colorLabel = document.getElementById('pdp-color-label');
        if (colorLabel && c) colorLabel.textContent = c.name;

        document.querySelectorAll('.pdp-swatch').forEach(function(sw, i) {
          sw.style.border = i === selectedColorIndex ? '3px solid var(--brown,#4A3F2E)' : '2px solid #ddd';
        });

        var oldStatus = document.getElementById('pdp-status-info');
        if (oldStatus) {
          var tmp = document.createElement('div');
          tmp.innerHTML = buildStatusHtml();
          oldStatus.replaceWith(tmp.firstElementChild);
        }

        var btn = document.getElementById('pdp-add-btn');
        if (btn) {
          btn.textContent = status === 'preorder' ? 'Pre-Order' : 'Add to Bag';
          btn.style.background = status === 'preorder' ? 'var(--pink-dark,#c48b70)' : 'var(--brown,#4A3F2E)';
        }

        var note = document.getElementById('pdp-preorder-note');
        if (note) note.style.display = status === 'preorder' ? 'block' : 'none';
      }

      // Wire events
      var qty = 1;
      function updateQtyDisplay() {
        var el = document.getElementById('pdp-qty-val');
        if (el) el.textContent = qty;
      }

      document.querySelectorAll('.pdp-swatch').forEach(function(sw) {
        sw.addEventListener('click', function() {
          selectedColorIndex = parseInt(sw.dataset.idx, 10);
          updateForColor();
        });
      });

      var minusBtn = document.getElementById('pdp-qty-minus');
      var plusBtn = document.getElementById('pdp-qty-plus');
      var addBtn = document.getElementById('pdp-add-btn');

      if (minusBtn) minusBtn.addEventListener('click', function() { if (qty > 1) { qty--; updateQtyDisplay(); } });
      if (plusBtn) plusBtn.addEventListener('click', function() { qty++; updateQtyDisplay(); });
      if (addBtn) {
        addBtn.addEventListener('click', function() {
          var origLabel = addBtn.textContent;
          addBtn.textContent = '\u2713 Added!';
          addBtn.disabled = true;
          setTimeout(function() { addBtn.textContent = origLabel; addBtn.disabled = false; }, 1600);
          if (window.HAYCHIC_logActivity) {
            var c = getSelectedColor();
            window.HAYCHIC_logActivity('add_to_bag', {
              productId: p.id, productName: p.name,
              color: c ? c.name : '', qty: qty, status: getSelectedStatus()
            });
          }
        });
      }

    }).catch(function() {
      detailEl.innerHTML = '<p style="text-align:center;padding:40px;color:var(--muted);">Unable to load product. Please refresh.</p>';
    });
    return;
  }

  // \u2500\u2500 Grid Pages \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  fetchProducts().then(function(products) {
    var shopGrid = document.getElementById('products');
    if (shopGrid) {
      var cat = new URLSearchParams(location.search).get('category');
      applyFilter(cat && cat !== 'all' ? cat.charAt(0).toUpperCase() + cat.slice(1) : 'All');
    }
    var naGrid = document.getElementById('newarrivals-products');
    if (naGrid) renderProducts(products.slice(0, 12), naGrid);
    var homeGrid = document.getElementById('home-newarrivals');
    if (homeGrid) renderProducts(products.slice(0, 8), homeGrid);
    var poGrid = document.getElementById('preorder-products');
    if (poGrid) renderProducts(products.filter(function(p) { return effectiveProductStatus(p) === 'preorder'; }), poGrid);
    var isGrid = document.getElementById('instock-products');
    if (isGrid) renderProducts(products.filter(function(p) { return effectiveProductStatus(p) === 'in-stock'; }), isGrid);
  }).catch(function(err) {
    console.error('Could not load products:', err);
    ['products','newarrivals-products','home-newarrivals','preorder-products','instock-products'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--muted);">Unable to load products. Please refresh.</p>';
    });
  });

  // Nav close on link click
  document.querySelectorAll('#nav a').forEach(function(a) {
    a.addEventListener('click', function() {
      var nav = document.getElementById('nav');
      if (nav) nav.classList.remove('open');
    });
  });
});

// \u2500\u2500\u2500 Nav / Toast / Forms \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function toggleMenu() {
  var nav = document.getElementById('nav');
  if (nav) nav.classList.toggle('open');
}

function showToast(message) {
  var t = document.getElementById('toast');
  if (!t) return;
  t.textContent = message;
  t.classList.add('show');
  setTimeout(function() { t.classList.remove('show'); }, 2200);
}

function submitRequest(e) {
  e.preventDefault();
  var form = e.target;
  var data = new FormData(form);
  if (window.HAYCHIC_logActivity) {
    window.HAYCHIC_logActivity('item_request', {
      requestName: data.get('name') || '',
      requestSocial: data.get('social') || '',
      requestType: data.get('type') || '',
      requestDetails: data.get('details') || '',
      requestText: data.get('request') || ''
    });
  }
  showToast('Request captured \u2665');
  form.reset();
}

function newsletter(e) {
  e.preventDefault();
  showToast("You're on the HAYCHIC list \u2665");
  e.target.reset();
}

function logProductInterest(id, name) {
  if (window.HAYCHIC_logActivity) {
    window.HAYCHIC_logActivity('product_interest', { productId: id, productName: name });
  }
}

function scrollTesti(dir) {
  var track = document.getElementById('testiTrack');
  if (track) track.scrollBy({ left: dir * 300, behavior: 'smooth' });
}
