(function(){
  function go(path){ window.location.assign(path); }
  function addMenu(){
    var nav = document.getElementById('nav');
    if(nav && !document.getElementById('btnPenilaianKondisiPabrik')){
      var boxAssess = document.createElement('div');
      boxAssess.className = 'group';
      boxAssess.innerHTML = '<div class="group-title">Penilaian Manajerial</div><button id="btnPenilaianKondisiPabrik" class="nav-btn"><span class="dot"></span>Penilaian Kondisi Pabrik</button>';
      nav.insertBefore(boxAssess, nav.firstChild);
      document.getElementById('btnPenilaianKondisiPabrik').onclick = function(){ go('penilaian-kondisi-pabrik.html?v=penilaian_pabrik_v1'); };
    }
    if(nav && !document.getElementById('btnUjiKelayakanBal99')){
      var boxAudit = document.createElement('div');
      boxAudit.className = 'group';
      boxAudit.innerHTML = '<div class="group-title">Audit & Keputusan</div><button id="btnUjiKelayakanBal99" class="nav-btn"><span class="dot"></span>Uji Kelayakan BAL-99</button>';
      nav.insertBefore(boxAudit, nav.firstChild);
      document.getElementById('btnUjiKelayakanBal99').onclick = function(){ go('uji-kelayakan-bal99.html?v=uji_kelayakan_v1'); };
    }
    if(nav && !document.getElementById('btnHppBomSj')){
      var boxHppSj = document.createElement('div');
      boxHppSj.className = 'group';
      boxHppSj.innerHTML = '<div class="group-title">HPP Profesional</div><button id="btnHppBomSj" class="nav-btn"><span class="dot"></span>HPP BOM + HPP per SJ</button><button id="btnHppBomRevisi" class="nav-btn"><span class="dot"></span>HPP & BOM Revisi</button>';
      nav.insertBefore(boxHppSj, nav.firstChild);
      document.getElementById('btnHppBomSj').onclick = function(){ go('hpp-bom-sj.html?v=hpp_bom_sj_v1'); };
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
    if(mobile && !document.getElementById('optPenilaianKondisiPabrik')){
      var optAssess = document.createElement('option');
      optAssess.id = 'optPenilaianKondisiPabrik';
      optAssess.value = 'penilaian_kondisi_pabrik';
      optAssess.textContent = 'Penilaian Kondisi Pabrik';
      mobile.insertBefore(optAssess, mobile.firstChild);
      mobile.addEventListener('change', function(){ if(mobile.value === 'penilaian_kondisi_pabrik') go('penilaian-kondisi-pabrik.html?v=penilaian_pabrik_v1'); });
    }
    if(mobile && !document.getElementById('optUjiKelayakanBal99')){
      var optAudit = document.createElement('option');
      optAudit.id = 'optUjiKelayakanBal99';
      optAudit.value = 'uji_kelayakan_bal99';
      optAudit.textContent = 'Uji Kelayakan BAL-99';
      mobile.insertBefore(optAudit, mobile.firstChild);
      mobile.addEventListener('change', function(){ if(mobile.value === 'uji_kelayakan_bal99') go('uji-kelayakan-bal99.html?v=uji_kelayakan_v1'); });
    }
    if(mobile && !document.getElementById('optHppBomSj')){
      var optSj = document.createElement('option');
      optSj.id = 'optHppBomSj';
      optSj.value = 'hpp_bom_sj';
      optSj.textContent = 'HPP BOM + HPP per SJ';
      mobile.insertBefore(optSj, mobile.firstChild);
      mobile.addEventListener('change', function(){ if(mobile.value === 'hpp_bom_sj') go('hpp-bom-sj.html?v=hpp_bom_sj_v1'); });
    }
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