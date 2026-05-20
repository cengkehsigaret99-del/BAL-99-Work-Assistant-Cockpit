const CSV_FILES = {
  dashboard: null,
  work_cockpit: null,
  data_integrity: 'data_integrity_checklist_v17_5.csv',
  folder_mapping: 'work_folder_mapping_00_06.csv',
  prompt_center: 'prompt_center_gpt_bal99.csv',
  catatan_keputusan: 'catatan_keputusan_bal99.csv',
  tindak_lanjut: 'tindak_lanjut_bal99.csv',
  work_sop: 'work_assistant_sop.csv',
  giling: 'browse_giling.csv',
  rekap_giling_harian: 'rekap_giling_harian_mei_2026.csv',
  rekap_giling_merek: 'rekap_giling_per_merek_mei_2026.csv',
  verpack: 'browse_verpack.csv',
  rekap_verpack_harian: 'rekap_verpack_harian_mei_2026.csv',
  rekap_verpack_merek: 'rekap_verpack_per_merek_mei_2026.csv',
  barang_jadi: 'browse_barang_jadi.csv',
  ck4c: 'browse_ck4c.csv',
  pita: 'browse_pita_cukai.csv',
  billing: 'browse_billing_cukai.csv',
  po: 'browse_po.csv',
  sj: 'browse_surat_jalan.csv',
  piutang: 'browse_pembayaran_piutang.csv',
  stok_pasar: 'browse_stok_pasar.csv',
  retur: 'browse_retur_komplain.csv',
  master_status: 'master_status.csv',
  master_harga: 'master_harga_customer.csv',
  saldo_pita: 'saldo_pita_18_mei_2026_update.csv',
  saldo_ck4_before_ck1: 'saldo_ck4_sebelum_ck1_18_mei_2026.csv',
  saldo_pita_ck1: 'saldo_pita_setelah_ck1_18_mei_2026.csv',
  manifest: 'BAL99_BAL77_DATA_MANIFEST.csv'
};

const MENU = [
  { group: 'Owner Control', items: [['dashboard','Dashboard'],['work_cockpit','Work Assistant Cockpit'],['data_integrity','Data Integrity'],['cetak','Laporan / Cetak'],['manifest','Sumber Data BAL-99']] },
  { group: 'GPT Collaboration 00-06', items: [['folder_mapping','Folder Kerja 00-06'],['prompt_center','Prompt Center GPT'],['catatan_keputusan','Catatan Keputusan'],['tindak_lanjut','Tindak Lanjut'],['work_sop','SOP Kerja AI']] },
  { group: 'Produksi', items: [['giling','Giling Detail'],['rekap_giling_harian','Rekap Giling Harian'],['rekap_giling_merek','Rekap Giling per Merek'],['verpack','Verpack Detail'],['rekap_verpack_harian','Rekap Verpack Harian'],['rekap_verpack_merek','Rekap Verpack per Merek']] },
  { group: 'Gudang', items: [['barang_jadi','Barang Jadi'],['stok_pasar','Stock Pasar']] },
  { group: 'Cukai', items: [['ck4c','CK4C'],['saldo_ck4_before_ck1','Saldo CK4 Sebelum CK1'],['pita','Pita Cukai'],['billing','Billing Cukai'],['saldo_pita','Saldo Pita 18 Mei'],['saldo_pita_ck1','Proyeksi Setelah CK1']] },
  { group: 'Distribusi & Pasar', items: [['po','PO'],['sj','DO / Surat Jalan'],['piutang','Pembayaran / Piutang'],['retur','Retur / Komplain']] },
  { group: 'Master', items: [['master_status','Master Status'],['master_harga','Master Harga Customer']] }
];

const TITLES = {
  dashboard: ['Dashboard BAL-99 v17.8','Cutoff aktif: giling/verpack/stock barang jadi sampai 20 Mei 2026. Tanggal 21 Mei belum ada hasil verpack official.'],
  work_cockpit: ['Work Assistant Cockpit','Meja kerja pribadi BAL-99 untuk menghubungkan data aplikasi dengan GPT Plus.'],
  data_integrity: ['Data Integrity Checklist','Aturan relasi data: laporan verpack, barang jadi, CK4, pita, DO, piutang, dan cutoff stock.'],
  folder_mapping: ['Folder Kerja GPT 00–06','Struktur kerja utama BAL + GPT.'],
  prompt_center: ['Prompt Center GPT','Template prompt siap pakai per folder dan per modul aplikasi.'],
  catatan_keputusan: ['Catatan Keputusan','Log keputusan kerja dan status validasi.'],
  tindak_lanjut: ['Tindak Lanjut','Daftar kerja lanjutan berdasarkan data yang masuk.'],
  work_sop: ['SOP Kerja AI','Alur kerja data masuk → validasi → update → arsip.'],
  cetak: ['BAL Print Style Standard','Template cetak resmi BAL untuk laporan internal, owner, produksi, gudang, cukai, pasar, HPP, dan keuangan.'],
  manifest: ['Sumber Data BAL-99','Manifest data terbaru setelah update bertahap Mei dan cutoff stock 20 Mei 2026.'],
  giling: ['Produksi Giling Detail','Data giling Mei 2026 sampai 20 Mei. Giling tidak mengurangi pita dan tidak langsung menjadi barang jadi.'],
  rekap_giling_harian: ['Rekap Giling Harian','Rekap harian giling Mei 2026. Koreksi: 463.200 batang adalah 14 Mei, bukan 21 Mei.'],
  rekap_giling_merek: ['Rekap Giling per Merek','Rekap giling per merek sampai cutoff 20 Mei.'],
  verpack: ['Produksi Verpack Detail','Verpack official = barang jadi masuk = dasar CK4C/pita. Cutoff aktif sampai 20 Mei.'],
  rekap_verpack_harian: ['Rekap Verpack Harian','Rekap verpack official sampai 20 Mei. 21 Mei belum ada laporan official.'],
  rekap_verpack_merek: ['Rekap Verpack per Merek','Rekap verpack official per merek sampai 20 Mei.'],
  barang_jadi: ['Barang Jadi','Stock barang jadi posisi akhir 20 Mei 2026. Belum ada tambahan 21 Mei.'],
  ck4c: ['CK4C','Kontrol pemakaian pita berdasarkan barang jadi official, bukan giling/pacing. TUD non-pita.'],
  saldo_ck4_before_ck1: ['Saldo CK4 Sebelum CK1','Saldo pita aktif yang dipakai sebagai CK4 per 18 Mei, sebelum tambahan CK1 ditambahkan.'],
  pita: ['Pita Cukai','Mutasi dan saldo pita cukai. Pemakaian berjalan sampai official 20 Mei.'],
  billing: ['Billing Cukai','CK-1/SPPR, billing, status pembayaran, dan efektivitas saldo.'],
  sj: ['DO / Surat Jalan','Barang keluar dari gudang dan dasar invoice/piutang. Data Mei sampai SJ124.'],
  po: ['PO','Permintaan order sebelum menjadi DO/SJ.'],
  piutang: ['Pembayaran / Piutang','Kontrol invoice, pembayaran, sisa piutang, dan risiko. Status masih valid sementara.'],
  stok_pasar: ['Stock Pasar','Kontrol stock di distributor/pasar.'],
  retur: ['Retur / Komplain','Barang bermasalah dan penyelesaian.'],
  master_status: ['Master Status','Referensi status validasi aplikasi.'],
  master_harga: ['Master Harga Customer','Referensi harga customer/pasar.']
};

const BORONGAN = [
  ['Minggu 1','2026-05-01','2026-05-07'],
  ['Minggu 2','2026-05-08','2026-05-14'],
  ['Minggu 3','2026-05-15','2026-05-21'],
  ['Minggu 4','2026-05-22','2026-05-28'],
  ['Minggu 5','2026-05-29','2026-06-04']
];

const APP_CACHE = '17_8_mei20_stable2';
const state = { page: 'dashboard', raw: {}, rows: [], cols: [], sortKey: null, sortDir: 'asc', promptRows: [] };

const fmtNum = n => Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });
const rupiah = n => 'Rp' + Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 });
const clean = v => v === undefined || v === null ? '' : String(v);
const nval = v => { const n = Number(String(v ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; };
const pretty = k => String(k || '').replaceAll('_',' ').replace(/\b\w/g, m => m.toUpperCase());

function parseCSV(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], nx = text[i + 1];
    if (q) {
      if (ch === '"' && nx === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else {
      if (ch === '"') q = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (ch !== '\r') cur += ch;
    }
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  const head = (rows.shift() || []).map(h => h.trim().replace(/^\uFEFF/, ''));
  return rows
    .filter(r => r.some(x => clean(x).trim() !== ''))
    .map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

async function load(key) {
  if (state.raw[key]) return state.raw[key];
  const file = CSV_FILES[key];
  if (!file) return [];
  try {
    const res = await fetch(file + '?v=' + APP_CACHE);
    if (!res.ok) throw new Error(res.status);
    const text = await res.text();
    state.raw[key] = parseCSV(text);
    return state.raw[key];
  } catch (e) {
    state.raw[key] = [];
    state.raw[key]._error = String(e);
    return state.raw[key];
  }
}

function parseDateISO(v) {
  let s = clean(v).trim();
  if (!s || /pending|belum|locked|final/i.test(s)) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const bln = { jan:'01',januari:'01',feb:'02',februari:'02',mar:'03',maret:'03',apr:'04',april:'04',mei:'05',may:'05',jun:'06',juni:'06',jul:'07',juli:'07',agu:'08',agustus:'08',sep:'09',september:'09',okt:'10',oktober:'10',nov:'11',november:'11',des:'12',desember:'12' };
    const b = bln[m[2].toLowerCase()];
    if (b) return `${m[3]}-${b}-${m[1].padStart(2,'0')}`;
  }
  return s;
}

function dateField(cols) { return cols.find(c => /^tanggal($|_)/i.test(c)) || cols.find(c => /tanggal|date/i.test(c)) || ''; }
function statusField(cols) { return cols.find(c => /status/i.test(c)) || cols.find(c => /validasi/i.test(c)) || ''; }
function productField(cols) { return cols.find(c => /merek|produk|sku|jenis_pita/i.test(c)) || ''; }
function isDataPage(key) { return !!CSV_FILES[key]; }
function title(key) { return TITLES[key] || [pretty(key), 'Data dari file ' + (CSV_FILES[key] || '') + '.']; }

function colType(c) {
  const k = String(c || '').toLowerCase();
  if (/status|validasi|indikator|risiko|keputusan/.test(k)) return 'status';
  if (/tanggal|date/.test(k)) return 'date';
  if (/^(no|nomor|kode|id)_?/.test(k) || /no_|nomor_|kode_/.test(k)) return 'text';
  if (/invoice/.test(k) && !/(total|nilai|nominal|bayar|pembayaran|sisa|piutang)/.test(k)) return 'text';
  if (/harga|nilai|nominal|total_bayar|total_pembayaran|total_upah|upah|piutang|pembayaran|bayar|hpp|margin|debet|kredit|saldo_rp|rupiah/.test(k)) return 'money';
  if (/jumlah|qty|pack|karton|batang|keping|lembar|saldo|stok|hje|isi|tarif|umur|baris|rows/.test(k)) return 'number';
  return 'text';
}

function statusClass(v) {
  const s = clean(v).toUpperCase();
  if (/LOCK|FINAL/.test(s)) return 'b-blue';
  if (/VALID|AMAN|LUNAS|NORMAL|READY|EFEKTIF|SELESAI|UPDATED|HIJAU/.test(s)) return 'b-green';
  if (/MERAH|KURANG|BELUM|ERROR|GAGAL|BATAL/.test(s)) return 'b-red';
  if (/CEK|PENDING|KUNING|TUNGGU|PAS|AWAL|PERLU|SEMENTARA/.test(s)) return 'b-yellow';
  return 'b-gray';
}

function cell(c, v) {
  const t = colType(c);
  if (t === 'status') return `<span class="badge ${statusClass(v)}">${clean(v) || '-'}</span>`;
  if (t === 'date') return parseDateISO(v) || clean(v);
  if (t === 'money' && String(v).match(/^-?[0-9.,]+$/)) return rupiah(nval(v));
  if (t === 'number' && String(v).match(/^-?[0-9.,]+$/)) return fmtNum(nval(v));
  return clean(v);
}

function pageHead(key) {
  const [t, d] = title(key);
  const data = isDataPage(key);
  const dataBtns = data
    ? `<button class="btn primary" onclick="downloadCurrentCSV()">Download CSV Hasil Filter</button><button class="btn" onclick="downloadRaw()">Buka CSV Sumber</button>`
    : `<button class="btn primary" onclick="window.print()">Cetak Halaman Ini</button>`;
  return `<section class="page-head"><div class="print-only print-brand"><div class="print-logo-box"><img src="logo.png" alt="Logo BAL"></div><div><div class="print-company">PR. BANYU ANYAR LESTARI</div><div class="print-title">${t}</div><div class="print-subtitle">${d}</div></div></div><div class="screen-title"><h2>${t}</h2><p>${d}</p><div class="datatype-note"><span class="version-lock">v17.8</span> Cutoff data aktif: stock akhir 20 Mei 2026. Tanggal 21 Mei belum ada verpack official.</div></div><div class="head-actions">${dataBtns}<button class="btn gold" onclick="window.print()">Cetak PDF / JPG</button></div></section>`;
}

function controls() {
  return `<section class="filters"><div class="filter-grid"><div><label>Tanggal Awal</label><input type="date" id="fStart" onchange="renderTable()"></div><div><label>Tanggal Akhir</label><input type="date" id="fEnd" onchange="renderTable()"></div><div><label>Minggu Borongan</label><select id="fWeek" onchange="applyWeek()"><option value="">Semua</option>${BORONGAN.map((w,i)=>`<option value="${i}">${w[0]} (${w[1]} s/d ${w[2]})</option>`).join('')}</select></div><div><label>Produk/Merek</label><select id="fProduct" onchange="renderTable()"><option value="">Semua</option></select></div><div><label>Status/Validasi</label><select id="fStatus" onchange="renderTable()"><option value="">Semua</option></select></div><div><label>Search</label><input id="fSearch" type="search" placeholder="Cari semua kolom..." oninput="renderTable()"></div></div><div class="note" id="note">Filter bisa dipakai untuk rentang tanggal, minggu borongan Jumat–Kamis, status, produk, dan pencarian bebas.</div></section>`;
}

function applyWeek() {
  const v = document.getElementById('fWeek')?.value || '';
  if (v === '') {
    document.getElementById('fStart').value = '';
    document.getElementById('fEnd').value = '';
  } else {
    const w = BORONGAN[Number(v)];
    document.getElementById('fStart').value = w[1];
    document.getElementById('fEnd').value = w[2];
  }
  renderTable();
}

function populateFilters(rows, cols) {
  const pf = productField(cols), sf = statusField(cols);
  fill('fProduct', [...new Set(rows.map(r => r[pf]).filter(Boolean))]);
  fill('fStatus', [...new Set(rows.map(r => r[sf] || r.validasi).filter(Boolean))]);
}
function fill(id, vals) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '<option value="">Semua</option>' + vals.sort().map(v => `<option value="${clean(v).replaceAll('"','&quot;')}">${v}</option>`).join('');
}

function sortPrimitive(c, v) {
  const t = colType(c);
  if (t === 'date') return parseDateISO(v) || '0000-00-00';
  if (t === 'money' || t === 'number') return nval(v);
  return clean(v).toLowerCase();
}

function filtered() {
  const rows = state.raw[state.page] || [], cols = state.cols;
  const df = dateField(cols), pf = productField(cols);
  const st = document.getElementById('fStart')?.value || '';
  const en = document.getElementById('fEnd')?.value || '';
  const prod = document.getElementById('fProduct')?.value || '';
  const stat = document.getElementById('fStatus')?.value || '';
  const s = (document.getElementById('fSearch')?.value || '').toLowerCase();
  let out = rows.filter(r => {
    const d = parseDateISO(r[df] || '');
    if (df && st && d && d < st) return false;
    if (df && en && d && d > en) return false;
    if (prod && r[pf] !== prod) return false;
    if (stat && !Object.values(r).includes(stat)) return false;
    if (s && !Object.values(r).join(' ').toLowerCase().includes(s)) return false;
    return true;
  });
  if (state.sortKey) {
    const k = state.sortKey;
    out = [...out].sort((a,b) => {
      const av = sortPrimitive(k, a[k]), bv = sortPrimitive(k, b[k]);
      const cmp = (typeof av === 'number' && typeof bv === 'number') ? av - bv : String(av).localeCompare(String(bv));
      return state.sortDir === 'asc' ? cmp : -cmp;
    });
  } else if (df) {
    out = [...out].sort((a,b) => String(parseDateISO(b[df]) || '').localeCompare(String(parseDateISO(a[df]) || '')));
  }
  return out;
}

function renderCards(rows, cols) {
  const df = dateField(cols);
  const dates = rows.map(r => parseDateISO(r[df])).filter(Boolean).sort();
  const cards = [['Periode', dates.length ? dates[0] + ' s/d ' + dates[dates.length - 1] : '-'], ['Jumlah Baris', fmtNum(rows.length)]];
  const numeric = cols.filter(c => ['money','number'].includes(colType(c)) && rows.some(r => String(r[c] || '').match(/^-?[0-9.,]+$/))).slice(0, 4);
  numeric.forEach(c => cards.push([pretty(c), fmtNum(rows.reduce((a,r) => a + nval(r[c]), 0))]));
  const el = document.getElementById('cards');
  if (el) el.innerHTML = cards.slice(0, 6).map((x,i) => `<div class="card ${i > 1 ? 'warn' : ''}"><small>${x[0]}</small><strong>${x[1]}</strong></div>`).join('');
}

function renderTable() {
  const rows = filtered(), cols = state.cols;
  state.rows = rows;
  const rc = document.getElementById('rowCount');
  if (rc) rc.textContent = fmtNum(rows.length) + ' data';
  renderCards(rows, cols);
  const table = document.getElementById('table');
  if (!table) return;
  table.innerHTML = `<thead><tr><th class="action-head action-col">Aksi</th>${cols.map(c => `<th onclick="sortBy('${c}')">${pretty(c)} ${state.sortKey === c ? (state.sortDir === 'asc' ? '▲' : '▼') : ''}</th>`).join('')}</tr></thead><tbody>${rows.map((r,i) => `<tr><td class="action-cell"><button class="btn row-action" onclick="detail(${i})">Detail</button></td>${cols.map(c => `<td>${cell(c, r[c])}</td>`).join('')}</tr>`).join('')}</tbody>`;
}

function sortBy(c) {
  if (state.sortKey === c) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
  else { state.sortKey = c; state.sortDir = 'asc'; }
  renderTable();
}

async function show(key) {
  state.page = key;
  state.sortKey = null;
  state.sortDir = 'asc';
  const mobile = document.getElementById('mobilePage');
  if (mobile && mobile.value !== key) mobile.value = key;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.key === key));
  if (key === 'dashboard') return dashboard();
  if (key === 'work_cockpit') return workCockpit();
  if (key === 'prompt_center') return promptCenter();
  if (key === 'cetak') return cetak();
  const rows = await load(key);
  const cols = rows.length ? Object.keys(rows[0]) : [];
  state.cols = cols;
  document.getElementById('app').innerHTML = pageHead(key) + controls() + `<section class="cards" id="cards"></section><section class="table-wrap"><div class="table-toolbar"><h3>${CSV_FILES[key] || pretty(key)}</h3><span id="rowCount" class="badge b-blue">0 data</span></div><div class="scroll"><table id="table"></table></div></section><div class="footer-note">Sumber: ${CSV_FILES[key] || '-'} • BAL-99 v17.8 • Cutoff aktif stock akhir 20 Mei 2026.</div><div id="overlay" class="overlay" onclick="closeDrawer()"></div><aside id="drawer" class="drawer"><button class="btn" onclick="closeDrawer()">Tutup</button><div id="drawerContent"></div></aside>`;
  populateFilters(rows, cols);
  renderTable();
}

function detail(i) {
  const r = state.rows[i];
  document.getElementById('overlay')?.classList.add('show');
  document.getElementById('drawer')?.classList.add('open');
  const box = document.getElementById('drawerContent');
  if (box) box.innerHTML = '<h2>Detail Data</h2><div class="kv">' + Object.entries(r).map(([k,v]) => `<div class="k">${pretty(k)}</div><div class="v">${clean(v)}</div>`).join('') + '</div>';
}
function closeDrawer() { document.getElementById('overlay')?.classList.remove('show'); document.getElementById('drawer')?.classList.remove('open'); }

function csvEsc(v) { const s = clean(v).replace(/<[^>]*>/g, ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function downloadCurrentCSV() {
  const rows = state.rows || [];
  if (!rows.length) return alert('Tidak ada data untuk diunduh.');
  const cols = state.cols.length ? state.cols : Object.keys(rows[0]);
  const csv = '\ufeff' + [cols.map(csvEsc).join(',')].concat(rows.map(r => cols.map(c => csvEsc(r[c])).join(','))).join('\n');
  download(`BAL99_${state.page}_filtered_v17_8.csv`, csv, 'text/csv;charset=utf-8');
}
function downloadRaw() { const f = CSV_FILES[state.page]; if (f) window.open(f + '?v=' + APP_CACHE, '_blank'); }
function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 800); }

function maxDate(rows, field) { return rows.length ? rows.map(r => parseDateISO(r[field])).filter(Boolean).sort().at(-1) || '-' : '-'; }
function sum(rows, field) { return rows.reduce((a,r) => a + nval(r[field]), 0); }

async function dashboard() {
  const keys = Object.keys(CSV_FILES).filter(k => CSV_FILES[k]);
  for (const k of keys) await load(k);
  const g = state.raw.giling || [], v = state.raw.verpack || [], sj = state.raw.sj || [], ck = state.raw.ck4c || [], pita = state.raw.pita || [], bj = state.raw.barang_jadi || [], piutang = state.raw.piutang || [];
  const maxG = maxDate(g, 'tanggal_giling');
  const maxV = maxDate(v, 'tanggal_verpack');
  const maxSJ = maxDate(sj, 'tanggal_sj');
  const maxBJ = maxDate(bj, 'tanggal_stok');
  const totalSJPack = sj.reduce((a,r) => a + nval(r.qty_kirim || r.jumlah_pack || r.pack), 0);
  const nilaiSJ = sum(sj, 'total_nilai');
  const warn = `<div class="warning-strip"><b>Cutoff aktif:</b> Stock barang jadi posisi ${maxBJ}. Giling terakhir ${maxG}, verpack official terakhir ${maxV}. Tanggal 21 Mei belum ada verpack official, jadi belum menambah barang jadi/CK4C/pita.</div>`;
  document.getElementById('app').innerHTML = pageHead('dashboard') + warn + `<section class="cards"><div class="card green"><small>Giling Detail</small><strong>${fmtNum(g.length)}</strong><p>sampai ${maxG}</p></div><div class="card"><small>Total Batang Giling</small><strong>${fmtNum(sum(g,'jumlah_batang'))}</strong></div><div class="card"><small>Verpack Detail</small><strong>${fmtNum(v.length)}</strong><p>sampai ${maxV}</p></div><div class="card"><small>Total Verpack Official</small><strong>${fmtNum(sum(v,'jumlah_pack'))}</strong><p>pack</p></div><div class="card warn"><small>DO/SJ Mei</small><strong>${fmtNum(sj.length)}</strong><p>sampai ${maxSJ}</p></div><div class="card"><small>Total Pack DO/SJ</small><strong>${fmtNum(totalSJPack)}</strong></div><div class="card"><small>Nilai DO/SJ</small><strong>${rupiah(nilaiSJ)}</strong></div><div class="card warn"><small>Barang Jadi</small><strong>${fmtNum(bj.length)}</strong><p>posisi ${maxBJ}</p></div></section><section class="table-wrap"><div class="table-toolbar"><h3>Ringkasan Validasi BAL-99 v17.8</h3><button class="btn primary" onclick="show('manifest')">Buka Manifest</button><button class="btn" onclick="show('data_integrity')">Buka Data Integrity</button><button class="btn" onclick="show('giling')">Buka Giling</button><button class="btn" onclick="show('verpack')">Buka Verpack</button></div><div class="scroll"><table><thead><tr><th>Area</th><th>Status</th><th>Catatan</th></tr></thead><tbody><tr><td>Giling</td><td><span class="badge b-green">VALID AWAL</span></td><td>Giling sampai ${maxG}. Koreksi: 463.200 batang adalah 14 Mei, bukan 21 Mei.</td></tr><tr><td>Verpack</td><td><span class="badge b-green">VALID AWAL</span></td><td>Verpack official sampai ${maxV}. Laporan verpack 21 Mei belum ada.</td></tr><tr><td>Barang Jadi</td><td><span class="badge b-yellow">VALID AWAL</span></td><td>Stock akhir aktif posisi ${maxBJ}; belum final rekonsiliasi audit.</td></tr><tr><td>CK4/Pita</td><td><span class="badge b-blue">TERKONTROL</span></td><td>CK4C mengikuti barang jadi official. TUD tidak memakai pita.</td></tr><tr><td>Piutang</td><td><span class="badge b-yellow">VALID SEMENTARA</span></td><td>${fmtNum(piutang.length)} baris saldo kerja; Khoirul masih perlu mapping PSP/PMS.</td></tr></tbody></table></div></section><div class="footer-note">Versi: BAL-99 v17.8 Stable • Cutoff stock barang jadi 20 Mei 2026 • Patch tambahan dinonaktifkan agar aplikasi stabil.</div>`;
}

async function workCockpit() {
  const folders = await load('folder_mapping');
  const tindak = await load('tindak_lanjut');
  const prompts = await load('prompt_center');
  const qs = ['dashboard','data_integrity','giling','verpack','barang_jadi','ck4c','sj','piutang'];
  document.getElementById('app').innerHTML = pageHead('work_cockpit') + `<section class="cockpit-hero"><div><div class="report-kicker">BAL-99 WORK ASSISTANT COCKPIT</div><h2>Meja Kerja BAL + GPT Plus</h2><p>Bapak sebagai pengendali data. Bagian pabrik menjadi sumber data. Aplikasi menjadi cockpit. GPT menjadi asisten analisa, laporan, WA, dan update teknis.</p></div><div class="cockpit-status"><b>Mode Kerja</b><span>Human-in-the-loop AI</span><small>Data tetap dari CSV/Excel/aplikasi. GPT membantu analisa, bukan sumber angka.</small></div></section><section class="cards"><div class="card green"><small>Core System</small><strong>Tetap</strong><p>Produksi, Gudang, Cukai, Pasar, HPP, Keuangan tidak diubah.</p></div><div class="card"><small>Cockpit</small><strong>Aktif</strong><p>Pengarah folder, prompt, catatan keputusan, tindak lanjut.</p></div><div class="card warn"><small>Status Data</small><strong>Wajib</strong><p>VALID AWAL, CEK DOBEL, DATA BELUM VALID, PENDING, VALID FINAL.</p></div><div class="card"><small>Cutoff</small><strong>20 Mei</strong><p>Stock barang jadi aktif posisi 20 Mei 2026.</p></div></section><section class="cockpit-grid"><div class="cockpit-panel"><h3>Folder Kerja 00–06</h3><div class="folder-grid">${folders.map(f => `<button class="folder-card" onclick="copyFolderPrompt('${f.kode_folder}')"><b>${f.kode_folder}</b><span>${f.nama_folder}</span><small>${f.fungsi_utama}</small></button>`).join('')}</div></div><div class="cockpit-panel"><h3>Aksi Cepat GPT</h3><div class="quick-actions">${qs.map(k => `<button class="btn primary" onclick="copyQuickPrompt('${k}')">Copy Prompt ${title(k)[0]}</button>`).join('')}</div><div class="note">Gunakan tombol ini setelah filter data dan download CSV dari menu terkait.</div></div></section><section class="cockpit-grid"><div class="cockpit-panel"><h3>Tindak Lanjut Terdekat</h3>${miniTable(['Prioritas','Folder','Tugas','Status'], tindak.slice(0,5).map(r => [r.prioritas,r.folder,r.tugas,r.status]))}</div><div class="cockpit-panel"><h3>Prompt Tersedia</h3>${miniTable(['Kode','Folder','Nama Prompt','Output'], prompts.map(r => [r.kode_prompt,r.folder,r.nama_prompt,r.output_diharapkan]))}</div></section><div class="footer-note">Work Assistant Cockpit adalah lapisan kerja tambahan, bukan pengganti sistem utama BAL-99.</div>`;
}

async function promptCenter() {
  const rows = await load('prompt_center');
  state.promptRows = rows;
  document.getElementById('app').innerHTML = pageHead('prompt_center') + `<section class="filters"><div class="filter-grid"><div><label>Search Prompt</label><input id="promptSearch" type="search" placeholder="Cari folder, tujuan, modul..." oninput="renderPromptCards()"></div><div><label>Folder</label><select id="promptFolder" onchange="renderPromptCards()"><option value="">Semua Folder</option>${[...new Set(rows.map(r => r.folder))].map(f => `<option>${f}</option>`).join('')}</select></div></div><div class="note">Klik Copy Prompt, lalu paste ke GPT Plus. Upload CSV hasil download dari menu terkait bila diperlukan.</div></section><section id="promptCards" class="prompt-grid"></section>`;
  renderPromptCards();
}
function renderPromptCards() {
  const s = (document.getElementById('promptSearch')?.value || '').toLowerCase();
  const f = document.getElementById('promptFolder')?.value || '';
  const rows = (state.promptRows || []).filter(r => (!f || r.folder === f) && (!s || Object.values(r).join(' ').toLowerCase().includes(s)));
  const el = document.getElementById('promptCards');
  if (el) el.innerHTML = rows.map(r => `<article class="prompt-card"><div><span class="badge b-blue">${r.kode_prompt}</span> <span class="badge ${r.folder === '05' ? 'b-yellow' : 'b-green'}">Folder ${r.folder}</span></div><h3>${r.nama_prompt}</h3><p>${r.tujuan}</p><div class="prompt-text">${r.prompt_text}</div><p><b>CSV disarankan:</b> ${r.csv_disarankan}</p><p><b>Output:</b> ${r.output_diharapkan}</p><button class="btn primary" onclick="copyText(state.promptRows[${state.promptRows.indexOf(r)}].prompt_text)">Copy Prompt</button></article>`).join('') || '<div class="card"><strong>Tidak ada prompt cocok.</strong></div>';
}

function miniTable(head, rows) { return `<div class="mini-scroll"><table class="mini-table"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${cell('', c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }
function copyText(t) { navigator.clipboard?.writeText(t).then(() => alert('Prompt berhasil disalin.')).catch(() => { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); alert('Prompt berhasil disalin.'); }); }
function copyQuickPrompt(key) { const [t,d] = title(key); copyText(`Saya ingin menganalisis menu ${t} di aplikasi BAL-99. Konteks: ${d}. Tolong cek: 1) pemahaman data, 2) risiko error atau data dobel, 3) status validasi, 4) angka utama, 5) data yang harus diminta, 6) keputusan praktis. Jika perlu saya akan lampirkan CSV hasil download dari menu ${t}.`); }
function copyFolderPrompt(k) { copyText(`Saya ingin bekerja di Folder ${k} BAL-GPT. Tolong arahkan pekerjaan saya dengan format: Pemahaman file/data, Risiko error atau data dobel, Penyesuaian yang dibutuhkan, Struktur file/menu/kolom yang disarankan, Langkah update, Catatan cara pakai, Aksi sekarang, Data yang harus diminta, Komunikasi yang perlu dikirim, dan Keputusan praktis.`); }

async function cetak() {
  await dashboard();
  window.print();
}

function init() {
  const nav = document.getElementById('nav');
  if (nav) nav.innerHTML = MENU.map(g => `<div class="group"><div class="group-title">${g.group}</div>${g.items.map(([k,t]) => `<button class="nav-btn" data-key="${k}" onclick="show('${k}')"><span class="dot"></span>${t}</button>`).join('')}</div>`).join('');
  const mobile = document.getElementById('mobilePage');
  if (mobile) mobile.innerHTML = MENU.map(g => `<optgroup label="${g.group}">${g.items.map(([k,t]) => `<option value="${k}">${t}</option>`).join('')}</optgroup>`).join('');
  show('dashboard');
}

init();
