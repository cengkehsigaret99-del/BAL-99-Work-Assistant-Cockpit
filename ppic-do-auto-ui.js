"use strict";
(function(root,factory){
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 if(root&&root.document){root.PPICDOAutoHealth=api;api.mount(root);}
})(typeof window==="object"?window:null,function(){
 const CHECK={
  SOURCE_REGISTERED:'File sumber terdaftar',
  FACTS_MATCH:'Fakta sumber cocok',
  FULL_DO_LINES:'Seluruh rincian SJ cocok',
  DAILY_DO_TOTALS:'Rekap DO harian cocok',
  REPORT_DO_09:'Laporan DO aktif cocok'
 };
 const CROSS={
  CUTOFF_DIFFERENT:'DO dan Barang Jadi memakai tanggal sumber yang berbeda. Jangan hitung selisih sebagai transaksi baru.',
  BOOK_MATCH_SAME_DATE:'Jumlah pengeluaran DO dan buku BJ cocok pada tanggal yang sama; stok fisik tetap perlu bukti.',
  BOOK_DIFFERENCE_SAME_DATE:'Ada selisih buku DO/BJ pada tanggal yang sama; perlu audit mutasi.',
  BJ_BOOK_DELIVERY_MISSING:'Pengeluaran buku BJ yang sebanding belum tercatat.',
  BJ_SOURCE_MISSING:'Sumber BJ belum tersedia untuk dibandingkan.'
 };
 const fmt=x=>typeof x==="number"&&Number.isFinite(x)?new Intl.NumberFormat('id-ID').format(x):"Belum tersedia";
 const formatDate=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)?new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(x+'T00:00:00Z')):'Belum diketahui';
 const formatTime=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))?new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(x))+" WIB":"Belum tercatat";
 const safe=(x,n=220)=>typeof x==="string"?x.slice(0,n):"";
 function buildModel(payload,period){
  if(!payload||payload.ok!==true||payload.period!==period)throw Error('Periode sinkronisasi DO tidak sesuai.');
  if(payload.ready!==true)return{ready:false,period,configured:payload.configured===true};
  const d=payload.latest;
  if(!d||!['SYNCED_WORKING','INTEGRITY_CHECK_FAILED'].includes(d.status)||!Array.isArray(d.checks)||!Array.isArray(d.pending))throw Error('Format sinkronisasi DO belum didukung.');
  return{ready:true,period,configured:payload.configured===true,
    status:d.status,report_version:d.report_version,source_version:d.source_version,
    cutoff:d.cutoff,published_at:d.published_at,total_sj:d.total_sj,total_lines:d.total_lines,
    total_pack:d.total_pack,total_nominal:d.total_nominal,last_sj:d.last_sj,
    last_sj_lines:d.last_sj_lines,checks:d.checks,pending:d.pending,
    cross_division_state:d.cross_division_state,bj_source_cutoff:d.bj_source_cutoff,
    bj_book_delivery_pack:d.bj_book_delivery_pack,official_books_changed:d.official_books_changed,
    is_latest:d.is_latest};
 }
 function mount(win){
  const doc=win.document,$=id=>doc.getElementById(id),panel=$('ppicDOAutoPanel');
  if(!panel)return;
  const el=(tag,value,cls)=>{const n=doc.createElement(tag);if(value!==undefined)n.textContent=value;if(cls)n.className=cls;return n;};
  let ready=false,loading=false,generation=0,timer=null;
  const period=()=>$('robotPeriod')?.value||'2026-11';
  const message=(value,tone="neutral")=>{const m=$('ppicDOAutoStatus');m.textContent=value;m.dataset.tone=tone;};
  function stop(){if(timer!==null){win.clearTimeout(timer);timer=null;}}
  function schedule(){stop();if(ready)timer=win.setTimeout(()=>{if(doc.hidden)schedule();else refresh();},180000);}
  function reset(){
   $('ppicDOAutoBadge').textContent='Belum diperiksa';$('ppicDOAutoBadge').dataset.tone='neutral';
   $('ppicDOAutoTime').textContent='Belum ada laporan sinkronisasi yang dimuat.';
   for(const id of ['ppicDOAutoMetrics','ppicDOAutoChecks','ppicDOAutoPending'])$(id).replaceChildren();
   $('ppicDOAutoRefresh').disabled=true;message('Login sebagai Owner untuk melihat audit sinkronisasi DO.');
  }
  function render(m){
   $('ppicDOAutoBadge').textContent=!m.ready?'Belum tersedia':m.status==='SYNCED_WORKING'?'Sinkron · WORKING':'Perlu pemeriksaan';
   $('ppicDOAutoBadge').dataset.tone=m.ready&&m.status==='SYNCED_WORKING'?'success':'warning';
   if(!m.ready){message('Belum ada bukti DO terbit pada periode ini. Ini bukan bukti bahwa pengiriman tidak terjadi.','neutral');return;}
   $('ppicDOAutoTime').textContent='Sumber '+safe(m.source_version,16)+' · web '+safe(m.report_version,16)+' · cutoff '+formatDate(m.cutoff)+' · terakhir dicatat '+formatTime(m.published_at);
   if(m.status!=='SYNCED_WORKING')message('Pemeriksaan integritas tidak lulus. Jangan menggunakan laporan untuk komitmen tanpa validasi ulang.','warning');
   else message('DO sudah cocok antara sumber, rincian SJ, rekap harian dan laporan web. Ini laporan kerja; piutang/invoice dan stok fisik tetap belum final.','neutral');
   const box=$('ppicDOAutoMetrics');box.replaceChildren();
   for(const [label,value]of [
    ['Surat Jalan',fmt(m.total_sj)],['Total pack',fmt(m.total_pack)],
    ['Nilai DO kerja','Rp'+fmt(m.total_nominal)],['SJ terakhir',m.last_sj===null?'Belum ada':'SJ'+fmt(m.last_sj)]
   ]){const item=el('div',undefined,'ppic-do-auto-metric');item.append(el('span',label),el('strong',value));box.append(item);}
   const checks=$('ppicDOAutoChecks');checks.replaceChildren();
   for(const item of m.checks){
    const row=el('div',undefined,'ppic-do-auto-check');
    row.append(el('span',item.pass?'✓':'!','ppic-do-auto-check-icon'));
    row.append(el('span',CHECK[item.code]||safe(item.code,80)));
    row.append(el('strong',item.pass?'Cocok':'Perlu audit',item.pass?'ppic-do-ok':'ppic-do-alert'));
    checks.append(row);
   }
   const pending=$('ppicDOAutoPending');pending.replaceChildren();
   const cross=el('article',undefined,'ppic-do-auto-warning');
   cross.append(el('strong','Barang Jadi ↔ DO'));
   cross.append(el('p',CROSS[m.cross_division_state]||'Perlu pemeriksaan mutasi.','ppic-do-auto-small'));
   cross.append(el('small','DO '+formatDate(m.cutoff)+' · BJ '+formatDate(m.bj_source_cutoff)+(m.bj_book_delivery_pack!==null?' · pengeluaran BJ '+fmt(m.bj_book_delivery_pack)+' pack':''),'ppic-do-auto-small'));
   pending.append(cross);
   for(const x of m.pending.filter(x=>x.code!=='CASH_AND_STOCK_NOT_POSTED')){
    const row=el('article',undefined,'ppic-do-auto-warning');
    row.append(el('strong',safe(x.owner_role,120)));
    row.append(el('p',safe(x.description,420),'ppic-do-auto-small'));
    pending.append(row);
   }
  }
  async function refresh(){
   if(!ready||loading||typeof win.ppicLoadDOAutoStatus!=='function')return;
   const seq=++generation,p=period();loading=true;$('ppicDOAutoRefresh').disabled=true;
   message('Membaca hasil pemeriksaan dari Supabase…');
   try{const v=await win.ppicLoadDOAutoStatus(p);if(!ready||seq!==generation||p!==period())return;render(buildModel(v,p));}
   catch(err){if(ready&&seq===generation)message('Status DO belum dapat dibaca: '+safe(err?.message,170),'warning');}
   finally{loading=false;$('ppicDOAutoRefresh').disabled=!ready;schedule();}
  }
  win.ppicDOAutoSessionReady=()=>{ready=true;$('ppicDOAutoRefresh').disabled=false;refresh();};
  win.ppicDOAutoClear=()=>{ready=false;generation++;stop();loading=false;reset();};
  $('ppicDOAutoRefresh').addEventListener('click',refresh);
  $('robotPeriod')?.addEventListener('change',()=>{generation++;if(ready)refresh();});
  doc.addEventListener('visibilitychange',()=>{if(!doc.hidden&&ready&&!loading)refresh();});
  reset();
 }
 return{buildModel,mount};
});
