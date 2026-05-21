(function(){
  const V = 'cukai_auto_21mei_1';
  const links = [
    ['dashboard_cukai_ringkas','Dashboard Cukai Ringkas','dashboard-cukai-ringkas.html'],
    ['csck3_full','CSCK-3 Full','csck3-detail-full.html'],
    ['csck3_koreksi','CSCK-3 Koreksi Data','csck3-koreksi-data.html'],
    ['ck4c_detail','CK4C Detail Produksi','ck4c-detail-produksi.html'],
    ['p3c_kppbc','P3C / KPPBC / CK-1','p3c-kppbc-control.html'],
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
      ck4c: ['CK4C Detail Produksi','ck4c-detail-produksi.html'],
      saldo_ck4_before_ck1: ['CSCK-3 Koreksi Data','csck3-koreksi-data.html'],
      pita: ['CSCK-3 Full','csck3-detail-full.html'],
      billing: ['P3C / KPPBC / CK-1','p3c-kppbc-control.html'],
      saldo_pita: ['Dashboard Cukai Ringkas','dashboard-cukai-ringkas.html'],
      saldo_pita_ck1: ['P3C / KPPBC / CK-1','p3c-kppbc-control.html']
    };
    Object.entries(oldMap).forEach(([key,val])=>{
      cukai.querySelectorAll('.nav-btn[data-key="'+key+'"]').forEach(btn=>{
        btn.innerHTML = '<span class="dot"></span>' + val[0];
        btn.onclick = function(){ go(val[1]); };
        btn.title = 'Otomatis diarahkan ke halaman cukai terbaru per 21 Mei';
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
    if(fav.querySelector('[data-cukai-fav="dashboard"]')) return;
    const btn = document.createElement('button');
    btn.dataset.cukaiFav = 'dashboard';
    btn.textContent = 'Cukai Ringkas';
    btn.onclick = function(){ go('dashboard-cukai-ringkas.html'); };
    const firstCukai = Array.from(fav.querySelectorAll('button')).find(b => (b.textContent || '').toLowerCase().includes('panduan cukai'));
    if(firstCukai) fav.insertBefore(btn, firstCukai);
    else fav.appendChild(btn);
  }
  function run(){ setupSidebar(); setupMobileSelect(); setupMobileFavs(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ setTimeout(run,650); });
  else setTimeout(run,650);
})();
