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

// ‚îÄ‚îÄ‚îÄ Cart State ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
function loadCart() {
  try { return JSON.parse(localStorage.getItem('haychic_cart') || '[]'); } catch(e) { return []; }
}
function saveCart() {
  try { localStorage.setItem('haychic_cart', JSON.stringify(cart)); } catch(e) {}
}
var cart = loadCart();

function parsePrice(str) {
  return parseFloat(String(str).replace(/[^0-9.]/g, '')) || 0;
}

function addToCart(product, qty, colorName, colorImg) {
  var key = product.id + '|' + (colorName || '');
  var found = false;
  for (var i = 0; i < cart.length; i++) {
    if (cart[i].key === key) { cart[i].qty += qty; found = true; break; }
  }
  if (!found) {
    cart.push({
      key: key,
      id: product.id,
      name: product.name,
      price: product.price,
      priceNum: parsePrice(product.price),
      color: colorName || '',
      img: colorImg || product.image || '',
      qty: qty
    });
  }
  saveCart();
  updateCartBadge();
  renderCartItems();
  openCart();
}

function removeFromCart(key) {
  cart = cart.filter(function(item) { return item.key !== key; });
  saveCart();
  updateCartBadge();
  renderCartItems();
}

function updateCartQty(key, delta) {
  for (var i = 0; i < cart.length; i++) {
    if (cart[i].key === key) {
      cart[i].qty = Math.max(1, cart[i].qty + delta);
      break;
    }
  }
  saveCart();
  updateCartBadge();
  renderCartItems();
}

function cartTotal() {
  return cart.reduce(function(sum, item) { return sum + item.priceNum * item.qty; }, 0);
}

function updateCartBadge() {
  var count = cart.reduce(function(sum, item) { return sum + item.qty; }, 0);
  var badge = document.querySelector('.cart-badge');
  if (!badge) return;
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}

function renderCartItems() {
  var itemsEl = document.querySelector('.cart-items');
  var subtotalEl = document.querySelector('.cart-subtotal-amt');
  if (!itemsEl) return;

  if (cart.length === 0) {
    itemsEl.innerHTML =
      '<div class="cart-empty">' +
        '<p style="font-size:2rem;margin:0 0 10px;">üõçÔ∏è</p>' +
        '<p style="font-weight:700;color:var(--brown);">Your bag is empty</p>' +
        '<p style="color:var(--muted);font-size:.9rem;">Browse our collection and add something beautiful!</p>' +
      '</div>';
    if (subtotalEl) subtotalEl.textContent = '$0.00';
    var chkBtn = document.querySelector('.cart-checkout-btn');
    if (chkBtn) { chkBtn.disabled = true; chkBtn.style.opacity = '0.5'; }
    return;
  }

  itemsEl.innerHTML = cart.map(function(item) {
    var lineTotal = '$' + (item.priceNum * item.qty).toFixed(2);
    var safeKey = escapeHtml(item.key).replace(/'/g, '&#39;');
    return '<div class="cart-item" style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #f0e8e0;">' +
      (item.img ? '<img src="' + escapeHtml(item.img) + '" alt="' + escapeHtml(item.name) + '" style="width:64px;height:64px;object-fit:cover;border-radius:8px;flex-shrink:0;">' : '') +
      '<div style="flex:1;min-width:0;">' +
        '<p style="margin:0 0 2px;font-weight:700;font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(item.name) + '</p>' +
        (item.color ? '<p style="margin:0 0 4px;font-size:.8rem;color:var(--muted);">' + escapeHtml(item.color) + '</p>' : '') +
        '<div style="display:flex;align-items:center;gap:8px;margin:4px 0;">' +
          '<button onclick="updateCartQty(\'' + safeKey + '\',-1)" style="width:26px;height:26px;border-radius:50%;border:1.5px solid #ccc;background:#fff;font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">‚àí</button>' +
          '<span style="font-weight:700;min-width:18px;text-align:center;">' + item.qty + '</span>' +
          '<button onclick="updateCartQty(\'' + safeKey + '\',1)" style="width:26px;height:26px;border-radius:50%;border:1.5px solid #ccc;background:#fff;font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">+</button>' +
        '</div>' +
        '<p style="margin:0;font-size:.85rem;font-weight:600;">' + lineTotal + '</p>' +
      '</div>' +
      '<button onclick="removeFromCart(\'' + safeKey + '\')" style="background:none;border:none;font-size:1.1rem;color:#bbb;cursor:pointer;padding:4px;flex-shrink:0;" title="Remove">‚úï</button>' +
    '</div>';
  }).join('');

  if (subtotalEl) subtotalEl.textContent = '$' + cartTotal().toFixed(2);
  var chkBtn = document.querySelector('.cart-checkout-btn');
  if (chkBtn) { chkBtn.disabled = false; chkBtn.style.opacity = '1'; }
}

function startCheckout() {
  if (cart.length === 0) return;
  var btn = document.querySelector('.cart-checkout-btn');
  var origText = btn ? btn.textContent : 'Checkout';
  if (btn) { btn.textContent = 'Loading‚Ä¶'; btn.disabled = true; }
  var zip = '';
  var zipEl = document.querySelector('.cart-zip-input');
  if (zipEl) zip = zipEl.value.trim();
  var items = cart.map(function(item) {
    return {
      name: item.name + (item.color ? ' ‚Äî ' + item.color : ''),
      unitAmount: Math.round(item.priceNum * 100),
      quantity: item.qty
    };
  });
  fetch('/api/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: items, zip: zip })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert('Checkout error: ' + (data.error || 'Please try again.'));
      if (btn) { btn.textContent = origText; btn.disabled = false; }
    }
  })
  .catch(function() {
    alert('Checkout error. Please check your connection and try again.');
    if (btn) { btn.textContent = origText; btn.disabled = false; }
  });
}

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
          var c = getSelectedColor();
          addToCart(p, qty, c ? c.name : '', c ? (c.image || p.image || '') : (p.image || ''));
          var origLabel = addBtn.textContent;
          addBtn.textContent = '\u2713 Added!';
          addBtn.disabled = true;
          setTimeout(function() { addBtn.textContent = origLabel; addBtn.disabled = false; }, 1600);
          if (window.HAYCHIC_logActivity) {
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

// \u2500\u2500\u2500 Cart / Bag \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
(function initCart() {
  if (!document.querySelector('.cart-drawer')) {
    document.body.insertAdjacentHTML('beforeend',
      '<div class="cart-overlay" onclick="closeCart()"></div>' +
      '<div class="cart-drawer">' +
        '<div class="cart-drawer-header">' +
          '<h3>Your Bag</h3>' +
          '<button class="cart-close-btn" onclick="closeCart()" aria-label="Close bag">\u00d7</button>' +
        '</div>' +
        '<div class="cart-items"></div>' +
        '<div class="cart-drawer-footer">' +
          '<input class="cart-zip-input" type="text" placeholder="ZIP code (for shipping)" maxlength="10"' +
            ' style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid #ddd;border-radius:8px;font-size:.9rem;margin-bottom:10px;">' +
          '<div class="cart-subtotal"><span>Subtotal</span><span class="cart-subtotal-amt">$0.00</span></div>' +
          '<button class="cart-checkout-btn" onclick="startCheckout()" disabled' +
            ' style="width:100%;padding:14px;background:var(--brown,#4A3F2E);color:#fff;border:none;border-radius:10px;font-size:1rem;font-weight:700;letter-spacing:.05em;cursor:pointer;margin-top:10px;opacity:0.5;">Checkout</button>' +
          '<p style="font-size:.75rem;color:var(--muted);text-align:center;margin:8px 0 0;">Secure checkout \u2665 Powered by Stripe</p>' +
        '</div>' +
      '</div>'
    );
    renderCartItems();
  }
  // Wire Bag button
  var bagBtn = document.querySelector('.bag-btn');
  if (bagBtn && !bagBtn._cartWired) {
    bagBtn._cartWired = true;
    bagBtn.addEventListener('click', openCart);
    if (!bagBtn.querySelector('.cart-badge')) {
      var badge = document.createElement('span');
      badge.className = 'cart-badge';
      badge.style.cssText = 'display:none;position:absolute;top:-6px;right:-6px;background:var(--pink-dark,#c48b70);color:#fff;border-radius:50%;width:18px;height:18px;font-size:.65rem;font-weight:700;align-items:center;justify-content:center;pointer-events:none;';
      bagBtn.style.position = 'relative';
      bagBtn.appendChild(badge);
    }
  }
})();

function openCart() {
  renderCartItems();
  var overlay = document.querySelector('.cart-overlay');
  var drawer = document.querySelector('.cart-drawer');
  if (overlay) overlay.classList.add('open');
  if (drawer) drawer.classList.add('open');
}

function closeCart() {
  var overlay = document.querySelector('.cart-overlay');
  var drawer = document.querySelector('.cart-drawer');
  if (overlay) overlay.classList.remove('open');
  if (drawer) drawer.classList.remove('open');
}

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
