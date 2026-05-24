(function(){
  function go(path){ window.location.assign(path); }
  function addMenu(){
    var nav = document.getElementById('nav');
    if(nav && !document.getElementById('btnHppBomRevisi')){
      var boxBom = document.createElement('div');
      boxBom.className = 'group';
      boxBom.innerHTML = '<div class="group-title">HPP & BOM</div><button id="btnHppBomRevisi" class="nav-btn"><span class="dot"></span>HPP & BOM Revisi</button>';
      nav.insertBefore(boxBom, nav.firstChild);
      document.getElementById('btnHppBomRevisi').onclick = function(){ go('hpp-bom-revisi-control.html?v=bom_rev_20260524'); };
    }
    if(nav && !document.getElementById('btnHpp3Sku')){
      var box = document.createElement('div');
      box.className = 'group';
      box.innerHTML = '<div class="group-title">Eksekusi Biaya</div><button id="btnHpp3Sku" class="nav-btn"><span class="dot"></span>Eksekusi HPP 3 SKU</button>';
      nav.insertBefore(box, nav.firstChild);
      document.getElementById('btnHpp3Sku').onclick = function(){ go('hpp-mini-eksekusi-3sku.html?v=hpp_3sku_v1'); };
    }
    var mobile = document.getElementById('mobilePage');
    if(mobile && !document.getElementById('optHppBomRevisi')){
      var optBom = document.createElement('option');
      optBom.id = 'optHppBomRevisi';
      optBom.value = 'hpp_bom_revisi';
      optBom.textContent = 'HPP & BOM Revisi';
      mobile.insertBefore(optBom, mobile.firstChild);
      mobile.addEventListener('change', function(){ if(mobile.value === 'hpp_bom_revisi') go('hpp-bom-revisi-control.html?v=bom_rev_20260524'); });
    }
    if(mobile && !document.getElementById('optHpp3Sku')){
      var opt = document.createElement('option');
      opt.id = 'optHpp3Sku';
      opt.value = 'hpp3sku';
      opt.textContent = 'Eksekusi HPP 3 SKU';
      mobile.insertBefore(opt, mobile.firstChild);
      mobile.addEventListener('change', function(){ if(mobile.value === 'hpp3sku') go('hpp-mini-eksekusi-3sku.html?v=hpp_3sku_v1'); });
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ setTimeout(addMenu, 900); });
  else setTimeout(addMenu, 900);
})();