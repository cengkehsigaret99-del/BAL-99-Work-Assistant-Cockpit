(function(){
  const V = 'cukai_auto_6c_ck1_pembelian_pita';
  const links = [
    ['dashboard_cukai_ringkas','6A. Dashboard Pita Cukai','dashboard-cukai-ringkas.html'],
    ['csck3_full','6B. Debet Kredit Saldo Pita Pabrik','csck3-detail-full.html'],
    ['ck1_pembelian_pita','6C. CK-1 / Pembelian Pita Cukai','ck1-pembelian-pita-cukai.html'],
    ['ck4c_detail','6D. CK-4C / Pemakaian Pita','ck4c-detail-produksi.html'],
    ['p3c_kppbc','6E. Saldo Pita P3C / KPPBC','p3c-kppbc-control.html'],
    ['saldo_alur_pita','6F. Rekonsiliasi Pita Cukai','saldo-alur-pita-v2.html'],
    ['csck3_koreksi','CSCK-3 Koreksi Data','csck3-koreksi-data.html'],
    ['ck4c_upload','CK4C Upload Cukai','ck4c-upload-cukai.html']
  ];
  function go(file){ window.location.href = file + '?v=' + V; }
  function makeBtn(key,label,file){
    const btn = document.createElement('button');
    btn.className = 'nav-btn cukai-auto-btn';
    btn.dataset.key = key;
    btn.innerHTML = '<span class="dot"></span>' + label;
    btn.onclick = function(){ go(file); };
    return btn;
  }
  function setupSidebar(){
    const groups = Array.from(document.querySelectorAll('.group'));
    const cukai = groups.find(g => (g.querySelector('.group-title')?.textContent || '').trim().toLowerCase() === 'cukai');
    if(!cukai) return;
    cukai.querySelectorAll('.cukai-auto-btn').forEach(x=>x.remove());
    const title = cukai.querySelector('.group-title');
    let insertAfter = title;
    links.forEach(([key,label,file])=>{
      const btn = makeBtn(key,label,file);
      if(insertAfter && insertAfter.nextSibling) cukai.insertBefore(btn, insertAfter.nextSibling);
      else cukai.appendChild(btn);
      insertAfter = btn;
    });
    const oldMap = {
      ck4c: ['6D. CK-4C / Pemakaian Pita','ck4c-detail-produksi.html'],
      saldo_ck4_before_ck1: ['6B. Debet Kredit Saldo Pita Pabrik','csck3-detail-full.html'],
      pita: ['6F. Rekonsiliasi Pita Cukai','saldo-alur-pita-v2.html'],
      billing: ['6C. CK-1 / Pembelian Pita Cukai','ck1-pembelian-pita-cukai.html'],
      saldo_pita: ['6E. Saldo Pita P3C / KPPBC','p3c-kppbc-control.html'],
      saldo_pita_ck1: ['6C. CK-1 / Pembelian Pita Cukai','ck1-pembelian-pita-cukai.html']
    };
    Object.entries(oldMap).forEach(([key,val])=>{
      cukai.querySelectorAll('.nav-btn[data-key="'+key+'"]').forEach(btn=>{
        btn.innerHTML = '<span class="dot"></span>' + val[0];
        btn.onclick = function(){ go(val[1]); };
        btn.title = 'Menu cukai disederhanakan: 6C khusus CK-1 / pembelian pita, nilai cukai, SPPR, PPN HT';
      });
    });
  }
  function setupMobileSelect(){
    const mobile = document.getElementById('mobilePage');
    if(!mobile) return;
    const group = Array.from(mobile.querySelectorAll('optgroup')).find(g => (g.label || '').toLowerCase() === 'cukai');
    if(!group) return;
    group.querySelectorAll('option[data-cukai-auto="1"]').forEach(o=>o.remove());
    links.forEach(([key,label])=>{
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = label;
      opt.dataset.cukaiAuto = '1';
      group.insertBefore(opt, group.firstChild);
    });
    mobile.addEventListener('change', function(){
      const found = links.find(x=>x[0] === mobile.value);
      if(found) go(found[2]);
    });
  }
  function setupMobileFavs(){
    const fav = document.querySelector('.mobile-favs');
    if(!fav) return;
    if(!fav.querySelector('[data-cukai-fav="ck1-pembelian"]')){
      const btn = document.createElement('button');
      btn.dataset.cukaiFav = 'ck1-pembelian';
      btn.textContent = '6C CK-1 / Pembelian Pita';
      btn.onclick = function(){ go('ck1-pembelian-pita-cukai.html'); };
      fav.insertBefore(btn, fav.firstChild);
    }
    if(!fav.querySelector('[data-cukai-fav="saldo-alur"]')){
      const btn2 = document.createElement('button');
      btn2.dataset.cukaiFav = 'saldo-alur';
      btn2.textContent = 'Rekonsiliasi Pita';
      btn2.onclick = function(){ go('saldo-alur-pita-v2.html'); };
      fav.insertBefore(btn2, fav.firstChild);
    }
  }
  function run(){ setupSidebar(); setupMobileSelect(); setupMobileFavs(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ setTimeout(run,650); });
  else setTimeout(run,650);
})();