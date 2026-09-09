

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
