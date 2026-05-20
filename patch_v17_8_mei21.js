/* BAL-99 v17.8 Mei 21 patch
   Tujuan: sinkronisasi label dashboard/cache tanpa mengubah desain utama aplikasi.
*/
(function(){
  try{
    if(typeof TITLES !== 'undefined'){
      TITLES.dashboard=['Dashboard BAL-99 berbasis data Mei 2026','Ringkasan data Mei incremental update: DO/SJ sampai SJ124, giling sampai 21 Mei, verpack/CK4C sampai 20 Mei.'];
      TITLES.giling=['Produksi Giling Detail','Data giling Mei 2026 sampai 21 Mei. Giling tidak mengurangi pita dan tidak langsung menjadi barang jadi.'];
      TITLES.verpack=['Produksi Verpack Detail','Verpack official = barang jadi masuk = dasar pemakaian pita / CK4C. TUD dipisah non-pita.'];
      TITLES.ck4c=['CK4C','Kontrol pemakaian pita berdasarkan barang jadi official. TUD tidak memakai pita.'];
      TITLES.manifest=['Sumber Data BAL-99','Manifest data terbaru setelah update bertahap Mei sampai 21 Mei 2026.'];
    }
  }catch(e){console.warn('BAL v17.8 title patch skipped',e)}
})();

async function load(key){
  if(state.raw[key]) return state.raw[key];
  const file=CSV_FILES[key];
  if(!file){return []}
  try{
    const res=await fetch(file+'?v=17_8_mei21_csv_refresh');
    if(!res.ok) throw new Error(res.status);
    const text=await res.text();
    state.raw[key]=parseCSV(text);
    return state.raw[key];
  }catch(e){
    state.raw[key]=[];
    state.raw[key]._error=String(e);
    return state.raw[key];
  }
}

function pageHead(key){
  const [t,d]=title(key);
  const data=isDataPage(key);
  const dataBtns=data?`<button class="btn primary" onclick="downloadCurrentCSV()">Download CSV Hasil Filter</button><button class="btn" onclick="downloadRaw()">Buka CSV Sumber</button>`:`<button class="btn primary" onclick="window.print()">Cetak Halaman Ini</button>`;
  return `<section class="page-head"><div class="print-only print-brand"><div class="print-logo-box"><img src="logo.png" alt="Logo BAL"></div><div><div class="print-company">PR. BANYU ANYAR LESTARI</div><div class="print-title">${t}</div><div class="print-subtitle">${d}</div></div></div><div class="screen-title"><h2>${t}</h2><p>${d}</p><div class="datatype-note"><span class="version-lock">v17.8</span> Data Mei sudah disinkronkan bertahap. CSV cache direfresh agar update GitHub lebih cepat terbaca.</div></div><div class="head-actions">${dataBtns}<button class="btn gold" onclick="window.print()">Cetak PDF / JPG</button></div></section>`;
}

async function dashboard(){
  const keys=Object.keys(CSV_FILES).filter(k=>CSV_FILES[k]);
  for(const k of keys) await load(k);
  const g=state.raw.giling||[], v=state.raw.verpack||[], ck=state.raw.ck4c||[], sj=state.raw.sj||[], pita=state.raw.pita||[], bj=state.raw.barang_jadi||[], piutang=state.raw.piutang||[];
  const maxDate=(rows,field)=>rows.length?rows.map(r=>parseDateISO(r[field])).filter(Boolean).sort().at(-1)||'-':'-';
  const maxG=maxDate(g,'tanggal_giling');
  const maxV=maxDate(v,'tanggal_verpack');
  const maxSJ=maxDate(sj,'tanggal_sj');
  const maxBJ=maxDate(bj,'tanggal_stok');
  const totalG=g.reduce((a,r)=>a+nval(r.jumlah_batang),0);
  const totalV=v.reduce((a,r)=>a+nval(r.jumlah_pack),0);
  const totalSJ=sj.reduce((a,r)=>a+nval(r.qty_kirim||r.jumlah_pack||r.pack),0);
  const nilaiSJ=sj.reduce((a,r)=>a+nval(r.total_nilai),0);
  const warn=(maxG!==maxV)?`<div class="warning-strip"><b>Kontrol tanggal:</b> Giling terakhir ${maxG}, Verpack/Barang Jadi official terakhir ${maxV}. CK4C mengikuti verpack/barang jadi, bukan giling.</div>`:'';
  document.getElementById('app').innerHTML=pageHead('dashboard')+warn+`<section class="cards"><div class="card green"><small>Giling Detail</small><strong>${fmtNum(g.length)}</strong><p>sampai ${maxG}</p></div><div class="card"><small>Total Batang Giling</small><strong>${fmtNum(totalG)}</strong></div><div class="card"><small>Verpack Detail</small><strong>${fmtNum(v.length)}</strong><p>sampai ${maxV}</p></div><div class="card"><small>Total Verpack Official</small><strong>${fmtNum(totalV)}</strong><p>pack</p></div><div class="card warn"><small>DO/SJ Mei</small><strong>${fmtNum(sj.length)}</strong><p>sampai ${maxSJ}</p></div><div class="card"><small>Total Pack DO/SJ</small><strong>${fmtNum(totalSJ)}</strong></div><div class="card"><small>Nilai DO/SJ</small><strong>${rupiah(nilaiSJ)}</strong></div><div class="card warn"><small>Barang Jadi</small><strong>${fmtNum(bj.length)}</strong><p>posisi ${maxBJ}</p></div></section><section class="table-wrap"><div class="table-toolbar"><h3>Ringkasan Validasi BAL-99 v17.8</h3><button class="btn primary" onclick="show('manifest')">Buka Manifest</button><button class="btn" onclick="show('data_integrity')">Buka Data Integrity</button><button class="btn" onclick="show('ck4c')">Buka CK4C</button></div><div class="scroll"><table><thead><tr><th>Area</th><th>Status</th><th>Catatan</th></tr></thead><tbody><tr><td>DO/SJ</td><td><span class="badge b-green">UPDATED</span></td><td>browse_surat_jalan.csv sudah sampai SJ124; total ${fmtNum(sj.length)} baris.</td></tr><tr><td>Giling</td><td><span class="badge b-green">UPDATED</span></td><td>browse_giling.csv sudah sampai ${maxG}; giling tidak mengurangi pita.</td></tr><tr><td>Verpack</td><td><span class="badge b-green">UPDATED</span></td><td>browse_verpack.csv sampai ${maxV}; TUD 600 pack 18 Mei dipisah dan non-pita.</td></tr><tr><td>CK4/Pita</td><td><span class="badge b-blue">TERKONTROL</span></td><td>CK4C mengikuti barang jadi official. PITA 16 terpakai 90.600 keping; TUD tidak mengurangi saldo.</td></tr><tr><td>Piutang</td><td><span class="badge b-yellow">VALID SEMENTARA</span></td><td>Saldo kerja Khoirul sudah termasuk dampak SJ123/SJ124, masih perlu mapping PSP/PMS.</td></tr></tbody></table></div></section><div class="footer-note">Versi: BAL-99 v17.8 Data Mei Incremental Update • CSV root updated bertahap sampai 21 Mei 2026.</div>`;
}

function refreshVersionLabels(){
  document.querySelectorAll('.footer-note').forEach(el=>{
    el.innerHTML=el.innerHTML
      .replace('Data mengikuti BAL-77 final 18 Mei 2026 • v17.7: filter tanggal, sort tanggal, invoice, CSV Excel, dan HP UX sudah diperbaiki.','Data Mei update sampai 21 Mei 2026 • v17.8: CSV cache & label data sudah disinkronkan.')
      .replace('Versi: BAL-99 v17.7 Operational UX & Data Type Fix','Versi: BAL-99 v17.8 Data Mei Incremental Update')
      .replace('Data mengikuti BAL-77 final 18 Mei 2026','Data Mei update sampai 21 Mei 2026');
  });
  document.querySelectorAll('.version-lock').forEach(el=>{el.textContent='v17.8'});
}

function downloadCurrentCSV(){
  const rows=state.rows||[];
  if(!rows.length)return alert('Tidak ada data untuk diunduh.');
  const cols=state.cols.length?state.cols:Object.keys(rows[0]);
  const csv='\ufeff'+[cols.map(csvEsc).join(',')].concat(rows.map(r=>cols.map(c=>csvEsc(r[c])).join(','))).join('\n');
  download(`BAL99_${state.page}_filtered_v17_8.csv`,csv,'text/csv;charset=utf-8');
}

setTimeout(()=>{
  try{
    const app=document.getElementById('app');
    if(app){
      new MutationObserver(refreshVersionLabels).observe(app,{childList:true,subtree:true});
      refreshVersionLabels();
      if(typeof show==='function') show(state.page||'dashboard');
    }
  }catch(e){console.warn('BAL v17.8 refresh patch skipped',e)}
},0);
