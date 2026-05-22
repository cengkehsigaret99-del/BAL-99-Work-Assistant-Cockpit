(function(){
  const PATCH_VERSION = 'mei22_dashboard_range_v1';
  const LATEST_DATE = '2026-05-22';
  const LATEST_LABEL = '22 Mei 2026';

  if (typeof TITLES !== 'undefined') {
    TITLES.dashboard = ['Dashboard BAL-99 v17.11', 'Cutoff tampilan utama: update 22 Mei 2026. Produksi, barang jadi, CK4C/pita, dan PO dibaca melalui staging 22 Mei agar data utama tetap aman.'];
    TITLES.giling = ['Produksi Giling Detail', 'Data giling Mei 2026. Gunakan filter Tanggal Awal dan Tanggal Akhir untuk membaca rentang data.'];
    TITLES.verpack = ['Produksi Verpack Detail', 'Verpack official = barang jadi masuk = dasar CK4C/pita. Gunakan filter tanggal untuk audit.'];
    TITLES.barang_jadi = ['Barang Jadi', 'Kontrol barang jadi. Update 22 Mei tersedia sebagai staging/rujukan sebelum merge final.'];
    TITLES.ck4c = ['CK4C', 'Kontrol pemakaian pita berdasarkan barang jadi official. Update 22 Mei: basis CK4C/pita 33.300 pack/keping.'];
    TITLES.pita = ['Pita Cukai', 'Mutasi dan saldo pita cukai. Update 22 Mei memakai basis CK4C/pita 33.300 pack/keping.'];
    TITLES.po = ['PO', 'Permintaan order sebelum menjadi DO/SJ. PO masuk belum mengurangi stok.'];
  }

  if (typeof pageHead === 'function') {
    const oldPageHead = pageHead;
    pageHead = function(key){
      return oldPageHead(key)
        .replaceAll('v17.8', 'v17.11')
        .replaceAll('Cutoff data aktif: stock akhir 20 Mei 2026. Tanggal 21 Mei belum ada verpack official.', 'Cutoff tampilan utama: update 22 Mei 2026. Gunakan filter tanggal dari–sampai untuk audit data.')
        .replaceAll('Cutoff aktif stock akhir 20 Mei 2026.', 'Cutoff tampilan utama update 22 Mei 2026.');
    };
  }

  function frontRangeBox(){
    return `<section class="filters" style="border-left:6px solid #f6ca60">
      <div class="filter-grid">
        <div><label>Tanggal Dari</label><input type="date" id="frontStart" value="2026-05-01"></div>
        <div><label>Tanggal Sampai</label><input type="date" id="frontEnd" value="${LATEST_DATE}"></div>
        <div><label>Buka Detail</label><select id="frontTarget"><option value="giling">Giling</option><option value="verpack">Verpack</option><option value="barang_jadi">Barang Jadi</option><option value="ck4c">CK4C</option><option value="pita">Pita Cukai</option><option value="po">PO</option><option value="sj">DO/SJ</option><option value="piutang">Piutang</option></select></div>
        <div><label>Aksi</label><button class="btn primary" onclick="applyFrontDateRange()">Terapkan Rentang</button></div>
      </div>
      <div class="note"><b>Mode pelaksana:</b> pilih tanggal dari–sampai, lalu buka detail. Filter akan otomatis dipasang di halaman detail jika kolom tanggal tersedia.</div>
    </section>`;
  }

  window.applyFrontDateRange = function(){
    const start = document.getElementById('frontStart')?.value || '';
    const end = document.getElementById('frontEnd')?.value || '';
    const target = document.getElementById('frontTarget')?.value || 'dashboard';
    localStorage.setItem('BAL99_PENDING_DATE_RANGE', JSON.stringify({start, end, target, ts: Date.now()}));
    if (typeof show === 'function') show(target);
  };

  if (typeof show === 'function') {
    const oldShow = show;
    show = async function(key){
      await oldShow(key);
      try {
        const raw = localStorage.getItem('BAL99_PENDING_DATE_RANGE');
        if (!raw) return;
        const p = JSON.parse(raw);
        if (!p || p.target !== key) return;
        const fs = document.getElementById('fStart');
        const fe = document.getElementById('fEnd');
        if (fs && fe) {
          fs.value = p.start || '';
          fe.value = p.end || '';
          if (typeof renderTable === 'function') renderTable();
        }
      } catch(e) {}
    };
  }

  if (typeof dashboard === 'function') {
    dashboard = async function(){
      const keys = Object.keys(CSV_FILES).filter(k => CSV_FILES[k]);
      for (const k of keys) await load(k);
      const g = state.raw.giling || [], v = state.raw.verpack || [], sj = state.raw.sj || [], ck = state.raw.ck4c || [], pita = state.raw.pita || [], bj = state.raw.barang_jadi || [], piutang = state.raw.piutang || [], po = state.raw.po || [];
      const maxG = maxDate(g, 'tanggal_giling');
      const maxV = maxDate(v, 'tanggal_verpack');
      const maxSJ = maxDate(sj, 'tanggal_sj');
      const maxBJ = maxDate(bj, 'tanggal_stok');
      const totalSJPack = sj.reduce((a,r) => a + nval(r.qty_kirim || r.jumlah_pack || r.pack), 0);
      const nilaiSJ = sum(sj, 'total_nilai');
      const warn = `<div class="warning-strip"><b>Update ${LATEST_LABEL}:</b> halaman utama sudah diarahkan ke staging 22 Mei. Barang jadi regular 33.298 pack, TUD 2 pack, basis CK4C/pita 33.300 pack/keping. PO belum mengurangi stok sebelum DO/SJ resmi.</div>`;
      document.getElementById('app').innerHTML = pageHead('dashboard') + warn + frontRangeBox() + `<section class="cards"><div class="card green"><small>Update Terbaru</small><strong>${LATEST_LABEL}</strong><p>staging aman</p></div><div class="card"><small>Barang Jadi Regular 22 Mei</small><strong>33.298</strong><p>pack</p></div><div class="card warn"><small>TUD Berpita</small><strong>2</strong><p>pack terpisah</p></div><div class="card"><small>Basis CK4C / Pita</small><strong>33.300</strong><p>pack/keping</p></div><div class="card"><small>Giling Detail</small><strong>${fmtNum(g.length)}</strong><p>sumber sampai ${maxG}</p></div><div class="card"><small>Verpack Detail</small><strong>${fmtNum(v.length)}</strong><p>sumber sampai ${maxV}</p></div><div class="card warn"><small>DO/SJ Mei</small><strong>${fmtNum(sj.length)}</strong><p>sampai ${maxSJ}</p></div><div class="card"><small>Total Pack DO/SJ</small><strong>${fmtNum(totalSJPack)}</strong></div><div class="card"><small>Nilai DO/SJ</small><strong>${rupiah(nilaiSJ)}</strong></div><div class="card warn"><small>PO</small><strong>${fmtNum(po.length)}</strong><p>belum kurangi stok</p></div></section><section class="table-wrap"><div class="table-toolbar"><h3>Ringkasan Validasi BAL-99 v17.11</h3><button class="btn primary" onclick="location.href='status-update-22-mei-terkunci.html?v=${PATCH_VERSION}'">Status 22 Mei</button><button class="btn" onclick="location.href='report-produksi-22-mei.html?v=${PATCH_VERSION}'">Produksi 22 Mei</button><button class="btn" onclick="location.href='dashboard-po-22-mei.html?v=${PATCH_VERSION}'">PO 22 Mei</button><button class="btn" onclick="show('data_integrity')">Data Integrity</button></div><div class="scroll"><table><thead><tr><th>Area</th><th>Status</th><th>Catatan</th></tr></thead><tbody><tr><td>Dashboard</td><td><span class="badge b-green">UPDATED 22 MEI</span></td><td>Halaman depan sekarang menampilkan status 22 Mei dan filter tanggal dari–sampai.</td></tr><tr><td>Barang Jadi</td><td><span class="badge b-yellow">STAGING</span></td><td>Regular 33.298 pack; TUD 2 pack dipisah.</td></tr><tr><td>CK4C/Pita</td><td><span class="badge b-blue">TERKONTROL</span></td><td>Basis 33.300 pack/keping karena TUD memakai pita.</td></tr><tr><td>PO</td><td><span class="badge b-yellow">VALID AWAL</span></td><td>PO masuk belum mengurangi stok dan belum menambah piutang sebelum DO/SJ resmi.</td></tr><tr><td>Filter Tanggal</td><td><span class="badge b-green">AKTIF</span></td><td>Gunakan Tanggal Dari dan Tanggal Sampai di halaman depan, lalu buka detail.</td></tr></tbody></table></div></section><div class="footer-note">Versi: BAL-99 v17.11 Compact Final Gate • Patch ${PATCH_VERSION} • Update terbaru ${LATEST_LABEL}.</div>`;
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(function(){ if (typeof show === 'function') show('dashboard'); }, 600); });
  } else {
    setTimeout(function(){ if (typeof show === 'function') show('dashboard'); }, 600);
  }
})();
