
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
  showToast('Request captured — connect this form to Shopify or email next ♡');
  e.target.reset();
}
function newsletter(e){
  e.preventDefault();
  showToast('You’re on the HAYCHIC list ♡');
  e.target.reset();
}
