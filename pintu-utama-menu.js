(function(){
  function go(path){ window.location.assign(path); }
  function add(){
    var nav=document.getElementById('nav');
    if(nav && !document.getElementById('btnRingkasanHariIni')){
      var box=document.createElement('div');
      box.className='group';
      box.innerHTML='<div class="group-title">Pintu Utama</div><button id="btnRingkasanHariIni" class="nav-btn"><span class="dot"></span>Ringkasan Hari Ini</button><button id="btnStatusOperasional" class="nav-btn"><span class="dot"></span>Status Operasional</button>';
      nav.insertBefore(box,nav.firstChild);
      document.getElementById('btnRingkasanHariIni').onclick=function(){go('ringkasan-hari-ini.html?v=pintu_ringkas_v1');};
      document.getElementById('btnStatusOperasional').onclick=function(){go('status-operasional.html?v=pintu_status_v1');};
    }
    var mobile=document.getElementById('mobilePage');
    if(mobile && !document.getElementById('optRingkasanHariIni')){
      var o1=document.createElement('option');o1.id='optRingkasanHariIni';o1.value='ringkasan_hari_ini';o1.textContent='Ringkasan Hari Ini';
      var o2=document.createElement('option');o2.id='optStatusOperasional';o2.value='status_operasional';o2.textContent='Status Operasional';
      mobile.insertBefore(o2,mobile.firstChild);mobile.insertBefore(o1,mobile.firstChild);
      mobile.addEventListener('change',function(){if(mobile.value==='ringkasan_hari_ini')go('ringkasan-hari-ini.html?v=pintu_ringkas_v1');if(mobile.value==='status_operasional')go('status-operasional.html?v=pintu_status_v1');});
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(add,1000);setTimeout(add,2500);});else{setTimeout(add,1000);setTimeout(add,2500);}
})();
