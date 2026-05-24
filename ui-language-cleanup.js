(function(){
  function setText(selector,value){var el=document.querySelector(selector);if(el)el.textContent=value;}
  function cleanHeader(){
    document.title='BAL-99 Control Tower';
    setText('.eyebrow','Pusat Kendali Pabrik & Pasar');
    setText('.brand h1','BAL-99 Control Tower');
    setText('.brand p','Produksi • Stok • Cukai • Piutang • HPP • Keputusan Supply');
    setText('.top-meta b','Mode Operasional Terarah');
    setText('.top-meta small','Mulai dari Ringkasan Hari Ini, Status Operasional, lalu Penilaian Kesehatan Pabrik. Menu teknis lama disimpan sebagai arsip.');
  }
  function mapLabel(t){
    var map={
      'Dashboard':'Ringkasan Utama','Work Assistant Cockpit':'Meja Kerja BAL-99','Data Integrity':'Cek Integritas Data','Laporan / Cetak':'Cetak Laporan','Sumber Data BAL-99':'Sumber Data','Folder Kerja 00-06':'Folder Kerja','Prompt Center GPT':'Pusat Prompt','Catatan Keputusan':'Arsip Keputusan','Tindak Lanjut':'Daftar Tindak Lanjut','SOP Kerja AI':'SOP Kerja Data','Giling Detail':'Produksi Giling','Verpack Detail':'Produksi Verpack','Barang Jadi':'Stok Barang Jadi','Stock Pasar':'Stok Pasar','CK4C':'CK4C Produksi','Saldo CK4 Sebelum CK1':'Saldo CK4 Sebelum CK-1','Proyeksi Setelah CK1':'Proyeksi Setelah CK-1','DO / Surat Jalan':'Surat Jalan & DO','Pembayaran / Piutang':'Piutang & Pembayaran','Retur / Komplain':'Retur & Komplain','Master Harga Customer':'Master Harga','Penilaian Kondisi Pabrik':'Penilaian Kesehatan Pabrik','Uji Kelayakan BAL-99':'Uji Kelayakan Operasional','HPP BOM + HPP per SJ':'HPP & Margin per Surat Jalan','HPP & BOM Revisi':'Master BOM & HPP Produk','Eksekusi HPP 3 SKU':'Simulasi HPP Produk'
    };
    return map[t]||t;
  }
  function mapGroup(t){
    var groups={'Owner Control':'Beranda & Kontrol','GPT Collaboration 00-06':'Arsip Kerja & SOP','Gudang':'Stok & Gudang','Cukai':'Pita Cukai & CK4C','Distribusi & Pasar':'Pasar, DO & Piutang','Master':'Master & Arsip','HPP Profesional':'HPP & Margin','Eksekusi Biaya':'Simulasi Biaya'};
    return groups[t]||t;
  }
  function renameText(){
    document.querySelectorAll('.group-title').forEach(function(el){el.textContent=mapGroup((el.textContent||'').trim());});
    document.querySelectorAll('.nav-btn').forEach(function(btn){
      var t=(btn.textContent||'').trim();
      var n=mapLabel(t);
      if(n!==t) btn.innerHTML='<span class="dot"></span>'+n;
    });
    document.querySelectorAll('option').forEach(function(el){var t=(el.textContent||'').trim();var n=mapLabel(t);if(n!==t)el.textContent=n;});
    document.querySelectorAll('a').forEach(function(el){var t=(el.textContent||'').trim();var n=mapLabel(t);if(n!==t)el.textContent=n;});
    document.querySelectorAll('summary').forEach(function(s){s.textContent='Arsip Teknis / Menu Lama';});
  }
  function simplifyHeaderLinks(){
    var box=document.querySelector('.top-meta > div');
    if(!box||box.getAttribute('data-cleaned')==='1')return;
    box.setAttribute('data-cleaned','1');
    box.innerHTML='<a href="ringkasan-hari-ini.html?v=pintu_ringkas_v1" target="_blank" style="display:block;padding:11px 12px;border:1px solid #e4c86a;border-radius:12px;color:#111827;background:#ffeeb8;font-weight:1000;text-decoration:none;font-size:15px">Ringkasan Hari Ini</a><a href="status-operasional.html?v=pintu_status_v1" target="_blank" style="display:block;padding:11px 12px;border:1px solid #e4c86a;border-radius:12px;color:#111827;background:#fff4cf;font-weight:1000;text-decoration:none;font-size:15px">Status Operasional</a><a href="penilaian-kondisi-pabrik.html?v=penilaian_pabrik_v1" target="_blank" style="display:block;padding:10px 12px;border:1px solid #e4c86a;border-radius:12px;color:#111827;background:#fffdf3;font-weight:900;text-decoration:none;font-size:15px">Penilaian Kesehatan Pabrik</a>';
  }
  function emptyDataMessage(){
    var rc=document.getElementById('rowCount');
    var table=document.getElementById('table');
    if(rc&&table&&/^0 data/.test(rc.textContent||'')){
      table.innerHTML='<tbody><tr><td style="padding:18px;line-height:1.55"><b>Belum ada data aktif.</b><br>Menu ini sudah disiapkan, tetapi data belum tersedia atau belum diaktifkan.<br><small>Gunakan sebagai arsip/ruang persiapan, bukan dasar keputusan.</small></td></tr></tbody>';
    }
  }
  function run(){cleanHeader();simplifyHeaderLinks();renameText();emptyDataMessage();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(run,1200);setTimeout(run,2400);});else{setTimeout(run,1200);setTimeout(run,2400);}
  document.addEventListener('click',function(){setTimeout(run,500);});
  document.addEventListener('change',function(){setTimeout(run,500);});
  setInterval(run,2500);
})();
