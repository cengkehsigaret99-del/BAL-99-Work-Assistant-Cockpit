// BAL-99 Smart Mobile Navigation Helper
// Visual/navigation helper only. Does not change data, CSV, formulas, or localStorage.
(function(){
  'use strict';
  const VERSION = 'bal99_smart_nav_v1';

  function isIndexPage(){
    const name = (location.pathname || '').split('/').pop().toLowerCase();
    return name === '' || name === 'index.html';
  }

  function openAppModule(key){
    if(isIndexPage() && typeof window.show === 'function'){
      window.show(key);
      try{ history.replaceState(null, '', '#' + key); }catch(e){}
      setTimeout(function(){ window.scrollTo({top:0, behavior:'smooth'}); }, 80);
    }else{
      location.href = 'index.html?v=' + VERSION + '#' + key;
    }
  }

  function runHashModule(){
    if(!isIndexPage()) return;
    const key = (location.hash || '').replace('#','');
    if(['sj','piutang','dashboard','giling','verpack','barang_jadi','ck4c','pita'].indexOf(key) < 0) return;
    setTimeout(function(){
      if(typeof window.show === 'function') window.show(key);
    }, 900);
  }

  function addSmartBottomNav(){
    if(document.getElementById('bal99SmartBottomNav')) return;
    const style = document.createElement('style');
    style.textContent = '@media(max-width:720px){.mobile-favs,.bal99-core-bottom-nav{display:none!important}.bal99-smart-bottom-nav{position:fixed;left:7px;right:7px;bottom:7px;z-index:140;display:grid;grid-template-columns:repeat(6,1fr);gap:4px;padding:6px;background:rgba(6,26,49,.97);border:1px solid rgba(214,166,66,.42);border-radius:18px;box-shadow:0 14px 34px rgba(0,0,0,.22);backdrop-filter:blur(12px)}.bal99-smart-bottom-nav button{border:0;border-radius:12px;background:transparent;color:#DDE8F4;font-weight:900;font-size:9.5px;padding:7px 2px;line-height:1.05}.bal99-smart-bottom-nav button:focus,.bal99-smart-bottom-nav button:hover{outline:none;background:rgba(214,166,66,.18);color:#F9D77A}.app{padding-bottom:96px!important}}@media(min-width:721px){.bal99-smart-bottom-nav{display:none!important}}@media print{.bal99-smart-bottom-nav{display:none!important}}';
    document.head.appendChild(style);

    const nav = document.createElement('nav');
    nav.id = 'bal99SmartBottomNav';
    nav.className = 'bal99-smart-bottom-nav';

    const items = [
      ['Dashboard', function(){ location.href = 'dashboard-ringkas.html?v=' + VERSION; }],
      ['Status', function(){ location.href = 'status-hari-ini.html?v=' + VERSION; }],
      ['Cukai', function(){ location.href = 'dashboard-cukai-ringkas.html?v=' + VERSION; }],
      ['DO/SJ', function(){ openAppModule('sj'); }],
      ['Piutang', function(){ openAppModule('piutang'); }],
      ['Score', function(){ location.href = 'scorecard-borongan-premium-print.html?v=' + VERSION; }]
    ];

    items.forEach(function(item){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = item[0];
      btn.addEventListener('click', item[1]);
      nav.appendChild(btn);
    });
    document.body.appendChild(nav);
  }

  function boot(){
    runHashModule();
    addSmartBottomNav();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ setTimeout(boot, 1000); });
  else setTimeout(boot, 1000);
})();
