(function(){
  const PATCH_VERSION = 'mei22_merge_final_v1';
  const LATEST_DATE = '2026-05-22';
  const LATEST_LABEL = '22 Mei 2026';

  if (typeof TITLES !== 'undefined') {
    TITLES.dashboard = ['Dashboard BAL-99 v17.15', 'Update 22 Mei 2026 sudah merge ke data utama untuk Verpack, Barang Jadi, CK4C, dan Pita. Giling 22 Mei menunggu angka sumber.'];
    TITLES.giling = ['Produksi Giling Detail', 'Data giling Mei 2026. Terakhir di data utama: 21 Mei. Giling 22 Mei belum digabung karena belum ada angka sumber utama.'];
    TITLES.verpack = ['Produksi Verpack Detail', 'Verpack official = barang jadi masuk = dasar CK4C/pita. Data 22 Mei sudah merge utama.'];
    TITLES.barang_jadi = ['Barang Jadi', 'Barang jadi 22 Mei sudah merge utama. PO belum mengurangi stok sebelum DO/SJ resmi.'];
    TITLES.ck4c = ['CK4C', 'CK4C 22 Mei sudah merge utama. Basis 33.300 pack/keping termasuk TUD 2 pack berpita.'];
    TITLES.pita = ['Pita Cukai', 'Pita 22 Mei sudah sinkron: PITA16 akhir 222.900, PITA 10.325 akhir 313.700, Refill 9.970.'];
    TITLES.po = ['PO', 'Permintaan order sebelum menjadi DO/SJ. PO masuk belum mengurangi stok.'];
  }

  if (typeof pageHead === 'function') {
    const oldPageHead = pageHead;
    pageHead = function(key){
      return oldPageHead(key)
        .replaceAll('v17.8', 'v17.15')
        .replaceAll('v17.11', 'v17.15')
        .replaceAll('Cutoff data aktif: stock akhir 20 Mei 2026. Tanggal 21 Mei belum ada verpack official.', 'Update 22 Mei 2026 sudah merge utama untuk Verpack, Barang Jadi, CK4C, dan Pita. Giling 22 Mei menunggu angka sumber.')
        .replaceAll('Cutoff tampilan utama: update 22 Mei 2026. Gunakan filter tanggal dari–sampai untuk audit data.', 'Update 22 Mei 2026 sudah merge utama. Gunakan filter tanggal dari–sampai untuk audit data.')
        .replaceAll('Cutoff aktif stock akhir 20 Mei 2026.', 'Update utama aktif sampai 22 Mei 2026 untuk Verpack/Barang Jadi/CK4C/Pita.');
    };
  }

  function frontRangeBox(){
    return `<section class="filters" style="border-left:6px solid #f6ca60">
      <div class="filter-grid">
        <div><label>Tanggal Dari</label><input type="date" id="frontStart" value="2026-05-01"></div>
        <div><label>Tanggal Sampai</label><input type="date" id="frontEnd" value="${LATEST_DATE}"></div>
        <div><label>Buka Detail</label><select id="frontTarget"><option value="verpack">Verpack</option><option value="barang_jadi">Barang Jadi</option><option value="ck4c">CK4C</option><option value="pita">Pita Cukai</option><option value="giling">Giling</option><option value="po">PO</option><option value="sj">DO/SJ</option><option value="piutang">Piutang</option></select></div>
        <div><label>Aksi</label><button class="btn primary" onclick="applyFrontDateRange()">Terapkan Rentang</button></div>
      </div>
      <div class="note"><b>Mode pelaksana:</b> data utama 22 Mei sudah masuk untuk Verpack, Barang Jadi, CK4C, dan Pita. Giling 22 Mei belum digabung sampai angka sumber dikirim.</div>
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
      const g = state.raw.giling || [], v = state.raw.verpack || [], sj = state.raw.sj || [], bj = state.raw.barang_jadi || [], po = state.raw.po || [];
      const maxG = maxDate(g, 'tanggal_giling');
      const maxV = maxDate(v, 'tanggal_verpack');
      const maxSJ = maxDate(sj, 'tanggal_sj');
      const maxBJ = maxDate(bj, 'tanggal_stok');
      const totalSJPack = sj.reduce((a,r) => a + nval(r.qty_kirim || r.jumlah_pack || r.pack), 0);
      const nilaiSJ = sum(sj, 'total_nilai');
      const warn = `<div class="warning-strip"><b>MERGE 22 MEI SELESAI:</b> Verpack, Barang Jadi, CK4C, dan Pita sudah masuk data utama. Regular 33.298 pack, TUD 2 pack terpisah, basis CK4C/pita 33.300. Giling 22 Mei belum digabung karena angka sumber belum ada.</div>`;
      document.getElementById('app').innerHTML = pageHead('dashboard') + warn + frontRangeBox() + `<section class="cards"><div class="card green"><small>Status 22 Mei</small><strong>MERGE UTAMA</strong><p>Verpack • Barang Jadi • CK4C • Pita</p></div><div class="card"><small>Barang Jadi Regular 22 Mei</small><strong>33.298</strong><p>pack masuk stok</p></div><div class="card warn"><small>TUD Berpita</small><strong>2</strong><p>tidak masuk stok regular</p></div><div class="card"><small>Basis CK4C / Pita</small><strong>33.300</strong><p>pack/keping</p></div><div class="card"><small>Saldo PITA 16</small><strong>222.900</strong><p>keping akhir 22 Mei</p></div><div class="card"><small>Saldo PITA 10.325</small><strong>313.700</strong><p>keping akhir 22 Mei</p></div><div class="card"><small>Saldo PITA Refill</small><strong>9.970</strong><p>tetap</p></div><div class="card warn"><small>Giling</small><strong>${maxG}</strong><p>22 Mei belum ada angka sumber</p></div><div class="card"><small>Verpack Detail</small><strong>${fmtNum(v.length)}</strong><p>sampai ${maxV}</p></div><div class="card warn"><small>DO/SJ Mei</small><strong>${fmtNum(sj.length)}</strong><p>sampai ${maxSJ}</p></div><div class="card"><small>Total Pack DO/SJ</small><strong>${fmtNum(totalSJPack)}</strong></div><div class="card"><small>Nilai DO/SJ</small><strong>${rupiah(nilaiSJ)}</strong></div><div class="card warn"><small>PO</small><strong>${fmtNum(po.length)}</strong><p>belum kurangi stok</p></div></section><section class="table-wrap"><div class="table-toolbar"><h3>Ringkasan Validasi BAL-99 v17.15</h3><button class="btn primary" onclick="show('verpack')">Buka Verpack</button><button class="btn" onclick="show('barang_jadi')">Buka Barang Jadi</button><button class="btn" onclick="show('ck4c')">Buka CK4C</button><button class="btn" onclick="show('pita')">Buka Pita</button></div><div class="scroll"><table><thead><tr><th>Area</th><th>Status</th><th>Catatan</th></tr></thead><tbody><tr><td>Verpack 22 Mei</td><td><span class="badge b-green">MERGE UTAMA</span></td><td>33.298 pack regular + 2 pack TUD berpita.</td></tr><tr><td>Barang Jadi</td><td><span class="badge b-green">MERGE UTAMA</span></td><td>C-031 19.998; C-023 69.780; C-015 1.800; C-012 1.000; TUD 2 terpisah.</td></tr><tr><td>CK4C/Pita</td><td><span class="badge b-blue">SINKRON</span></td><td>PITA16 222.900; PITA 10.325 313.700; Refill 9.970.</td></tr><tr><td>Giling 22 Mei</td><td><span class="badge b-yellow">BELUM ADA SUMBER</span></td><td>Jangan dibuat manual sampai angka giling dikirim.</td></tr><tr><td>PO</td><td><span class="badge b-yellow">VALID AWAL</span></td><td>PO belum mengurangi stok dan belum menambah piutang sebelum DO/SJ resmi.</td></tr></tbody></table></div></section><div class="footer-note">Versi: BAL-99 v17.15 • Patch ${PATCH_VERSION} • Merge utama ${LATEST_LABEL}.</div>`;
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(function(){ if (typeof show === 'function') show('dashboard'); }, 600); });
  } else {
    setTimeout(function(){ if (typeof show === 'function') show('dashboard'); }, 600);
  }
})();
