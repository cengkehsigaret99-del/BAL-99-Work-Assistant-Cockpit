(function(){
  function goUpah(){
    window.location.href = 'kontrol-upah-produksi.html?v=prod_upah_1';
  }
  function addSidebarButton(){
    const groups = Array.from(document.querySelectorAll('.group'));
    const prod = groups.find(g => (g.querySelector('.group-title')?.textContent || '').trim().toLowerCase() === 'produksi');
    if (!prod || prod.querySelector('[data-key="upah_borongan_gabungan"]')) return;
    const title = prod.querySelector('.group-title');
    const btn = document.createElement('button');
    btn.className = 'nav-btn';
    btn.dataset.key = 'upah_borongan_gabungan';
    btn.innerHTML = '<span class="dot"></span>Upah Borongan Gabungan';
    btn.onclick = goUpah;
    if (title && title.nextSibling) prod.insertBefore(btn, title.nextSibling);
    else prod.appendChild(btn);
  }
  function addMobileOption(){
    const mobile = document.getElementById('mobilePage');
    if (!mobile || mobile.querySelector('option[value="upah_borongan_gabungan"]')) return;
    const prodGroup = Array.from(mobile.querySelectorAll('optgroup')).find(g => (g.label || '').toLowerCase() === 'produksi');
    const opt = document.createElement('option');
    opt.value = 'upah_borongan_gabungan';
    opt.textContent = 'Upah Borongan Gabungan';
    if (prodGroup && prodGroup.firstChild) prodGroup.insertBefore(opt, prodGroup.firstChild);
    else if (prodGroup) prodGroup.appendChild(opt);
    mobile.addEventListener('change', function(){
      if (mobile.value === 'upah_borongan_gabungan') goUpah();
    });
  }
  function addMobileFav(){
    const fav = document.querySelector('.mobile-favs');
    if (!fav || fav.querySelector('[data-shortcut="upah_borongan_gabungan"]')) return;
    const btn = document.createElement('button');
    btn.dataset.shortcut = 'upah_borongan_gabungan';
    btn.textContent = 'Upah Borongan';
    btn.onclick = goUpah;
    const barangJadi = Array.from(fav.querySelectorAll('button')).find(b => (b.textContent || '').trim().toLowerCase() === 'barang jadi');
    if (barangJadi) fav.insertBefore(btn, barangJadi);
    else fav.appendChild(btn);
  }
  function run(){
    addSidebarButton();
    addMobileOption();
    addMobileFav();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ setTimeout(run, 500); });
  else setTimeout(run, 500);
})();
