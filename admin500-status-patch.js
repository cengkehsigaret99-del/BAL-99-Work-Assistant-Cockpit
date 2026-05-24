(function(){
  var FIXES = [
    ['Cutoff data aktif: stock akhir 20 Mei 2026. Tanggal 21 Mei belum ada verpack official.', 'Cutoff kerja: data produksi, verpack, pita, CK4C, dan barang jadi sudah membaca posisi 21 Mei. Item CEK DOBEL tetap belum final.'],
    ['Cutoff aktif: stock akhir 20 Mei 2026. Tanggal 21 Mei belum ada verpack official, jadi belum menambah barang jadi/CK4C/pita.', 'Cutoff kerja 21 Mei: verpack official sudah masuk. Barang jadi dan DO/SJ membaca 21 Mei dengan catatan CEK DOBEL pada SJ126/C-023.'],
    ['Versi: BAL-99 v17.8 Stable • Cutoff stock barang jadi 20 Mei 2026 • Patch tambahan dinonaktifkan agar aplikasi stabil.', 'Versi: BAL-99 v17.8 • Admin Profesional 500 Gate • Data kerja membaca 21 Mei; item CEK DOBEL belum final.'],
    ['Manifest data terbaru setelah update bertahap Mei dan cutoff stock 20 Mei 2026.', 'Manifest data terbaru setelah update bertahap Mei dan sinkronisasi status 21 Mei.']
  ];

  var TITLE_FIX = {
    dashboard: ['Dashboard BAL-99 v17.8', 'Cutoff kerja 21 Mei: produksi, verpack, pita, CK4C, dan barang jadi sudah membaca data 21 Mei. Pasar/piutang tetap dibaca sesuai status validasi.'],
    manifest: ['Sumber Data BAL-99', 'Manifest data terbaru setelah update bertahap Mei dan sinkronisasi status 21 Mei.'],
    giling: ['Produksi Giling Detail', 'Data giling Mei 2026 sampai 21 Mei. Giling tetap WIP, tidak mengurangi pita, dan tidak langsung menjadi barang jadi.'],
    rekap_giling_merek: ['Rekap Giling per Merek', 'Rekap giling per merek sampai cutoff kerja 21 Mei.'],
    verpack: ['Produksi Verpack Detail', 'Verpack official = barang jadi masuk = dasar CK4C/pita. Cutoff kerja sampai 21 Mei.'],
    rekap_verpack_harian: ['Rekap Verpack Harian', 'Rekap verpack official sampai 21 Mei.'],
    rekap_verpack_merek: ['Rekap Verpack per Merek', 'Rekap verpack official per merek sampai 21 Mei.'],
    barang_jadi: ['Barang Jadi', 'Stock barang jadi posisi kerja 21 Mei. Cek dobel SJ126 dan mapping C-023/C-031 sebelum valid final.'],
    pita: ['Pita Cukai', 'Mutasi dan saldo pita cukai. Pemakaian berjalan sampai official 21 Mei.'],
    sj: ['DO / Surat Jalan', 'Barang keluar dari gudang dan dasar invoice/piutang. Data Mei sudah memuat SJ126 dengan status cek dobel.'],
    piutang: ['Pembayaran / Piutang', 'Kontrol invoice, pembayaran, dan sisa piutang. Menu bawaan masih perlu merge penuh untuk beberapa file khusus 21 Mei.']
  };

  function patchTitles(){ try{ if (typeof TITLES !== 'undefined') Object.keys(TITLE_FIX).forEach(function(k){ if (TITLES[k]) TITLES[k] = TITLE_FIX[k]; }); }catch(e){} }
  function replaceText(node){ if (!node || !node.childNodes) return; node.childNodes.forEach(function(child){ if (child.nodeType === Node.TEXT_NODE) { var t = child.nodeValue; FIXES.forEach(function(f){ t = t.split(f[0]).join(f[1]); }); child.nodeValue = t; } else if (child.nodeType === Node.ELEMENT_NODE && !['SCRIPT','STYLE','TEXTAREA','INPUT'].includes(child.tagName)) replaceText(child); }); }

  function addStyle(){
    if (document.getElementById('admin500-status-style')) return;
    var st = document.createElement('style'); st.id = 'admin500-status-style';
    st.textContent = '.admin500-calm-strip{margin:0 0 14px;border:1px solid #bee8d4;border-left:7px solid #0f7a4d;background:#f0fbf7;color:#0b4d34;border-radius:16px;padding:12px 14px;line-height:1.5;box-shadow:0 10px 24px rgba(7,27,53,.06)}.admin500-calm-strip b{color:#064e3b}.top-meta a:first-of-type{background:#fff8e6;border:1px solid #f6ca60;border-radius:10px;padding:8px 10px;color:#071b35!important}.pemasaran-bal99-shortcut{display:block;padding:11px 12px;border:1px solid #92d6b3;border-radius:12px;color:#052e1a!important;background:#ecfdf5!important;font-weight:1000;text-decoration:none;font-size:15px}.nav-btn.pemasaran-bal99-extra{background:#ecfdf5!important;color:#064e3b!important;border-color:#86efac!important;font-weight:1000!important}.mobile-favs button.pemasaran-bal99-extra{background:#ecfdf5!important;color:#064e3b!important;border-color:#86efac!important}';
    document.head.appendChild(st);
  }

  function addStrip(){
    var app = document.getElementById('app'); if (!app || app.querySelector('.admin500-calm-strip')) return;
    var div = document.createElement('div'); div.className = 'admin500-calm-strip';
    div.innerHTML = '<b>Admin Profesional 500 aktif:</b> baca status dulu, cek dobel dipisahkan, angka final hanya setelah sumber dikunci. Produksi/cukai sudah membaca 21 Mei; pasar/piutang dibaca sesuai status validasi. <br><b>Pemasaran BAL-99:</b> menu baru tersedia untuk kontrol distributor, DO, peredaran barang, RO, dan potensi area.';
    app.prepend(div);
  }

  function addPemasaranShortcut(){
    if (document.querySelector('a[href^="pemasaran-bal99-control.html"]')) return;
    var url = 'pemasaran-bal99-control.html?v=pemasaran_1';
    var topGrid = document.querySelector('.top-meta div[style*="display:grid"]');
    if (topGrid) { var a = document.createElement('a'); a.href = url; a.target = '_blank'; a.className = 'pemasaran-bal99-shortcut'; a.textContent = '★ Pemasaran BAL-99 — Distributor / RO / Potensi Area'; topGrid.insertBefore(a, topGrid.children[2] || null); }
    var nav = document.getElementById('nav');
    if (nav && !nav.querySelector('.pemasaran-bal99-extra')) {
      var g = Array.from(nav.querySelectorAll('.group')).find(function(x){ return /Distribusi|Pasar/i.test(x.textContent); }) || nav;
      var b = document.createElement('button'); b.className = 'nav-btn pemasaran-bal99-extra'; b.innerHTML = '<span class="dot"></span>Pemasaran BAL-99'; b.onclick = function(){ location.href = url; };
      g.appendChild(b);
    }
    var fav = document.querySelector('.mobile-favs');
    if (fav && !fav.querySelector('.pemasaran-bal99-extra')) { var mb = document.createElement('button'); mb.className = 'pemasaran-bal99-extra'; mb.textContent = 'Pemasaran BAL-99'; mb.onclick = function(){ location.href = url; }; fav.insertBefore(mb, fav.children[2] || null); }
  }

  function run(){ patchTitles(); addStyle(); replaceText(document.body); addStrip(); addPemasaranShortcut(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  var obs = new MutationObserver(function(){ run(); }); if (document.body) obs.observe(document.body,{childList:true,subtree:true});
})();