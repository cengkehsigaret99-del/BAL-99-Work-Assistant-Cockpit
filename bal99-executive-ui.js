// BAL-99 Executive Control Tower UI Enhancement
// Safe UI only: navigation, ticker, gentle animation. No CSV/data/formula/localStorage changes.
(function(){
  'use strict';

  function ready(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function showPage(key){
    if(typeof window.show === 'function') window.show(key);
  }

  function addTicker(){
    const app = document.getElementById('app');
    if(!app || document.querySelector('.bal99-ticker')) return;
    const ticker = document.createElement('div');
    ticker.className = 'bal99-ticker fade-in-up';
    ticker.innerHTML = '<b>Info Kendali</b><span>Mulai dari Dashboard Ringkas atau Status Hari Ini • Validasi data sebelum owner report • CK-4C mengikuti verpack/barang jadi official • DO, pembayaran, piutang, dan stock pasar dibaca sebagai satu alur keputusan.</span>';
    app.prepend(ticker);
  }

  function addBottomNav(){
    if(document.querySelector('.bal99-bottom-nav')) return;
    const items = [
      ['Dashboard','dashboard'],
      ['Produksi','verpack'],
      ['Stok','barang_jadi'],
      ['Pasar','sj'],
      ['Piutang','piutang']
    ];
    const nav = document.createElement('nav');
    nav.className = 'bal99-bottom-nav';
    nav.setAttribute('aria-label','Navigasi cepat BAL-99');
    items.forEach(function(item, index){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = item[0];
      if(index === 0) btn.className = 'active';
      btn.addEventListener('click', function(){
        nav.querySelectorAll('button').forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        showPage(item[1]);
        window.setTimeout(enhanceVisuals, 250);
      });
      nav.appendChild(btn);
    });
    document.body.appendChild(nav);
  }

  function enhanceVisuals(){
    document.querySelectorAll('.card,.page-head,.table-wrap,.filters,.cockpit-panel,.prompt-card,.folder-card').forEach(function(el, idx){
      if(el.dataset.bal99Animated) return;
      el.dataset.bal99Animated = '1';
      el.classList.add('fade-in-up');
      el.style.animationDelay = Math.min(idx * 0.025, 0.25) + 's';
    });
    document.querySelectorAll('.badge').forEach(function(b){
      const text = (b.textContent || '').toUpperCase();
      if(/CEK|PERLU|BELUM|RISIKO|MERAH|PENDING|TUNGGU|KURANG/.test(text)) b.classList.add('badge-pulse');
    });
  }

  ready(function(){
    addBottomNav();
    addTicker();
    enhanceVisuals();
    const app = document.getElementById('app');
    if(app && 'MutationObserver' in window){
      const obs = new MutationObserver(function(){
        clearTimeout(window.__bal99EnhanceTimer);
        window.__bal99EnhanceTimer = setTimeout(function(){ addTicker(); enhanceVisuals(); }, 120);
      });
      obs.observe(app,{childList:true,subtree:true});
    }
  });
})();
