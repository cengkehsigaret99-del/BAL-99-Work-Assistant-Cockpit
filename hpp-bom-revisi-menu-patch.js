(function(){
  function go(path){ window.location.assign(path); }
  function addMenu(){
    var nav = document.getElementById('nav');
    if(nav && !document.getElementById('btnHppBomRevisi')){
      var box = document.createElement('div');
      box.className = 'group';
      box.innerHTML = '<div class="group-title">HPP & BOM</div><button id="btnHppBomRevisi" class="nav-btn"><span class="dot"></span>HPP & BOM Revisi</button>';
      nav.insertBefore(box, nav.firstChild);
      document.getElementById('btnHppBomRevisi').onclick = function(){ go('hpp-bom-revisi-control.html?v=bom_rev_20260524'); };
    }
    var mobile = document.getElementById('mobilePage');
    if(mobile && !document.getElementById('optHppBomRevisi')){
      var opt = document.createElement('option');
      opt.id = 'optHppBomRevisi';
      opt.value = 'hpp_bom_revisi';
      opt.textContent = 'HPP & BOM Revisi';
      mobile.insertBefore(opt, mobile.firstChild);
      mobile.addEventListener('change', function(){ if(mobile.value === 'hpp_bom_revisi') go('hpp-bom-revisi-control.html?v=bom_rev_20260524'); });
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ setTimeout(addMenu, 1000); });
  else setTimeout(addMenu, 1000);
})();