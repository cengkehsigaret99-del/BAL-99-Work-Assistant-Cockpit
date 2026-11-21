"use strict";
(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 if(root&&root.document){root.PPICSKTWatch=api;api.mount(root);}
})(typeof window==='object'?window:null,function(){
 const AREAS={
  giling:['Giling','GILING'],tsg:['TSG','TSG'],verpack:['Verpack','VERPACK'],barang_jadi:['Penerimaan Barang Jadi','BARANG JADI'],
  sdm_giling:['SDM Giling','SDM GILING'],sdm_verpack:['SDM Verpack','SDM VERPACK'],
  bb_po:['PO Bahan Baku','BAHAN BAKU'],bb_receipt:['Kedatangan Bahan','BAHAN BAKU'],
  bb_usage:['Pemakaian Bahan','BAHAN BAKU'],surat_jalan:['DO / Surat Jalan','DO'],
  customer_orders:['Pesanan Pelanggan','DO'],cukai_pita:['Cukai / Pita','CUKAI']
 };
 const dateLabel=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)?new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(x+'T00:00:00Z')):'Tidak diketahui';
 const timeLabel=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))?new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jakarta'}).format(new Date(x))+' WIB':'Belum tercatat';
 const fmt=n=>typeof n==='number'?new Intl.NumberFormat('id-ID').format(n):'—';
 const text=(s,max=160)=>typeof s==='string'?s.slice(0,max):'';
 const list=s=>Array.isArray(s)?s:[];
 const STATUS={
  DISETUJUI:['Sudah disetujui','approved'],DIAJUKAN:['Masih diajukan','pending'],
  DRAF:['Draf — belum lengkap','draft'],TERCATAT:['Sudah tercatat','recorded']
 };
 function buildModel(data,period){
  if(data?.ok!==true||data?.period!==period)throw Error('Periode status SKT tidak sesuai.');
  if(data.ready!==true)return {period,ready:false,cards:[]};
  const s=data.latest;
  if(!s||!Array.isArray(s.status_receipts)||!Array.isArray(s.ppic_coverage)||!s.counts)throw Error('Status SKT tidak valid.');
  const coverage=new Map(s.ppic_coverage.map(r=>[r.division,r]));
  const receipts=[...s.status_receipts].sort((a,b)=>b.business_date.localeCompare(a.business_date));
  const cards=[];
  const lastDay=receipts[0]?.business_date??null;
  for(const [id,tuple]of Object.entries(AREAS)){
   let chosen=null,seenToday=false,latestStatus=null;
   for(const receipt of receipts){
    const row=list(receipt.rows).find(x=>x.division===id);
    if(!row)continue;
    if(!latestStatus)latestStatus={...row,business_date:receipt.business_date,checked_at:receipt.checked_at};
    if(receipt.business_date===lastDay&&row.document_count>0)seenToday=true;
    if(row.document_count>0){chosen={...row,business_date:receipt.business_date,checked_at:receipt.checked_at};break;}
   }
   const row=chosen||latestStatus;
   const target=coverage.get(tuple[1]),docStatus=chosen?.document_state??null;
   let outcome='NOT_FOUND',message='Tidak ada dokumen pada jendela tanggal yang diperiksa.';
   if(chosen){
    if(docStatus==='DRAF'||chosen.status==='BELUM_LENGKAP'){outcome='DRAFT';message='Data baru masih draf; tidak boleh mengganti saldo atau laporan PPIC.';}
    else if(docStatus==='DIAJUKAN'){outcome='PENDING';message='Sudah diajukan, tetapi belum ada bukti persetujuan final.';}
    else if(docStatus==='TERCATAT'){outcome='RECORDED';message='Tercatat pada SKT; belum membuktikan posting lengkap di seluruh buku PPIC.';}
    else if(docStatus==='DISETUJUI'){outcome='APPROVED';message='Form SKT disetujui. Tetap perlu rekonsiliasi jumlah, SKU, dan cakupan dengan PPIC.';}
    else {outcome='UNKNOWN';message='Status formulir belum dapat dipetakan sebagai data final.';}
    const sktDate=chosen.report_date;
    if(sktDate&&target?.report_cutoff&&sktDate>target.report_cutoff)
      message+=' Laporan aktif PPIC lebih lama daripada tanggal form ini.';
    if(sktDate&&target?.source_cutoff&&sktDate>target.source_cutoff)
      message+=' Sumber terpilih PPIC juga lebih lama.';
   }
   cards.push({id,label:tuple[0],ppic_division:tuple[1],outcome,message,
     business_date:chosen?.business_date??null,report_date:row?.report_date??null,last_saved_at:row?.last_saved_at??null,
     document_count:chosen?.document_count??0,transaction_count:chosen?.transaction_count??0,
     document_state:docStatus,document_version:chosen?.document_version??null,
     latest_day_status:latestStatus?.status??null,found_today:seenToday,
     ppic_source:target?.source_cutoff??null,ppic_report:target?.report_cutoff??null,
     ppic_status:target?.report_status??null});
  }
  return {ready:true,period,revision:s.revision,captured_at:s.captured_at,counts:s.counts,
   receipts,latest_day:lastDay,cards,ppic_evidence_hash:s.ppic_evidence_hash};
 }
 function mount(win){
  const doc=win.document,$=id=>doc.getElementById(id),panel=$('ppicSKTWatchPanel');
  if(!panel)return;
  let active=false,loading=false,sequence=0,timer=null;
  const period=()=>$('robotPeriod')?.value||'2026-11';
  const make=(tag,value,cls)=>{const el=doc.createElement(tag);if(value!==undefined)el.textContent=value;if(cls)el.className=cls;return el;};
  const notice=(value,tone='neutral')=>{const el=$('ppicSKTWatchStatus');el.textContent=value;el.dataset.tone=tone;};
  const clearTimer=()=>{if(timer!==null)win.clearTimeout(timer);timer=null;};
  const schedule=()=>{clearTimer();if(active)timer=win.setTimeout(()=>{if(doc.hidden)schedule();else refresh();},180000);};
  const show=(m)=>{
   const badge=$('ppicSKTWatchBadge');
   badge.textContent=!m.ready?'Belum tersedia':'Sumber terpantau';badge.dataset.tone=m.ready?'good':'neutral';
   if(!m.ready){notice('Belum ada hasil pemeriksaan Web SKT pada periode ini. Tidak berarti semua divisi tidak bekerja.');return;}
   $('ppicSKTWatchTime').textContent='Mirror SKT '+timeLabel(m.captured_at)+' · '+fmt(m.counts.total_documents)+' formulir versi terkini · '+m.receipts.length+' tanggal pemeriksaan disimpan.';
   const count=(key)=>m.cards.filter(c=>c.outcome===key).length;
   const metrics=$('ppicSKTWatchMetrics');metrics.replaceChildren();
   for(const [label,num] of [['Form draf',count('DRAFT')],['Form diajukan',count('PENDING')],['Form disetujui',count('APPROVED')],['Form tercatat',count('RECORDED')]]){
    const e=make('div',undefined,'ppic-skt-metric');e.append(make('span',label),make('strong',fmt(num)));metrics.append(e);
   }
   notice('Tanggal form, waktu simpan dan status persetujuan ditampilkan terpisah dari cut-off sumber/laporan PPIC. Form terbaru belum otomatis menjadi transaksi atau stok siap pakai.');
   const cards=$('ppicSKTWatchRows');cards.replaceChildren();
   for(const item of m.cards){
    const el=make('article',undefined,'ppic-skt-card');el.dataset.outcome=item.outcome;
    const head=make('div',undefined,'ppic-skt-card-title');
    head.append(make('strong',item.label));
    const state=STATUS[item.document_state]||(['DRAFT','PENDING','APPROVED','RECORDED'].includes(item.outcome)?[item.document_state,'pending']:['Belum ada form dalam jendela','neutral']);
    head.append(make('span',state[0],'ppic-skt-chip'));
    el.append(head);
    if(item.document_count>0)el.append(make('p','Tanggal form '+dateLabel(item.report_date)+' · tersimpan '+timeLabel(item.last_saved_at)+'.','ppic-skt-muted'));
    if(item.document_version!==null)el.append(make('p','Versi form '+item.document_version+' · '+fmt(item.transaction_count)+' rincian tercatat dalam form.','ppic-skt-muted'));
    el.append(make('p','PPIC sumber '+dateLabel(item.ppic_source)+' · laporan aktif '+dateLabel(item.ppic_report)+'.','ppic-skt-muted'));
    el.append(make('p',item.message,'ppic-skt-explain'));
    if(item.latest_day_status==='JADWAL_BELUM_DIATUR'&&!item.found_today)
      el.append(make('small','Tidak ada dokumen harian pada '+dateLabel(m.latest_day)+'. Ini bukan bukti pabrik libur.','ppic-skt-muted'));
    cards.append(el);
   }
  };
  const clear=()=>{
   for(const id of ['ppicSKTWatchRows','ppicSKTWatchMetrics'])$(id).replaceChildren();
   $('ppicSKTWatchBadge').textContent='Belum diperiksa';$('ppicSKTWatchBadge').dataset.tone='neutral';
   $('ppicSKTWatchTime').textContent='Belum ada snapshot diperiksa.';
   $('ppicSKTWatchRefresh').disabled=true;notice('Login sebagai Owner untuk melihat status Web SKT vs PPIC.');
  };
  async function refresh(){
   if(!active||loading||typeof win.ppicLoadSKTWatch!=='function')return;
   const generation=++sequence,p=period();loading=true;$('ppicSKTWatchRefresh').disabled=true;
   notice('Memeriksa status yang sudah disimpan secara privat…');
   try{
    const response=await win.ppicLoadSKTWatch(p);
    if(!active||generation!==sequence||p!==period())return;
    show(buildModel(response,p));
   }catch(err){if(active&&generation===sequence)notice('Status belum dapat dibaca: '+text(err?.message,180),'alert');}
   finally{loading=false;$('ppicSKTWatchRefresh').disabled=!active;schedule();}
  }
  $('ppicSKTWatchRefresh').addEventListener('click',refresh);
  $('ppicSKTWatchAsk').addEventListener('click',()=>{
   const input=$('ppicAskText'),select=$('ppicAskIntent');
   if(!active||!input||input.disabled||!select)return;
   select.value='ANALYZE';
   input.value='Bandingkan status per divisi Web SKT dan Web PPIC yang benar-benar terbaru. Bedakan DRAF, DIAJUKAN, DISETUJUI, TERCATAT, tanggal bisnis, tanggal simpan, sumber dan laporan aktif PPIC; usulkan prioritas verifikasi tanpa memposting transaksi.';
   input.focus();input.scrollIntoView({behavior:'smooth',block:'center'});
   notice('Pertanyaan sudah disiapkan. Periksa lalu tekan Kirim ke GPT jika disetujui.');
  });
  $('robotPeriod')?.addEventListener('change',()=>{sequence++;if(active)refresh();});
  doc.addEventListener('visibilitychange',()=>{if(!doc.hidden&&active&&!loading)refresh();});
  win.ppicSKTWatchSessionReady=()=>{active=true;$('ppicSKTWatchRefresh').disabled=false;refresh();};
  win.ppicSKTWatchClear=()=>{active=false;sequence++;clearTimer();loading=false;clear();};
  clear();
 }
 return {buildModel,mount};
});
