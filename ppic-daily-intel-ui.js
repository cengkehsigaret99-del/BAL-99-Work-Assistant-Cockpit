"use strict";
(function(root,factory){
 const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;
 if(root&&root.document){root.PPICDailyIntel=api;api.mount(root);}
})(typeof window==="object"?window:null,function(){
 const STATE={
  ACTIVE_WORKING:"Aktif · laporan kerja",
  CANDIDATE_OPEN_RECON:"Kandidat · belum diposting",
  SOURCE_VERIFIED_OPEN_RECON:"File asli sudah diperiksa",
  SKT_DIAJUKAN:"SKT · diajukan",
  SKT_TERCATAT:"SKT · tercatat",
  LAST_WORKING:"Posisi kerja terakhir",
  METADATA_CONFLICT:"Konflik metadata",
  BANK_MATCH_OPEN:"Bukti kas · bank match terbuka",
  OPEN_RECON:"Rekonsiliasi terbuka",
  SOURCE_MISSING:"Belum ada sumber"
 };
 const QUAL={SOURCE:"Sumber",REFERENCE:"Acuan kerja",ESTIMATE:"Estimasi",MISSING:"Belum terbukti"};
 const fmt=v=>typeof v==="number"&&Number.isFinite(v)?new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}).format(v):
   typeof v==="string"?v:"Belum ada";
 const day=v=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)?
   new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(v+"T00:00:00Z")):"Tidak tersedia";
 const time=v=>typeof v==="string"&&Number.isFinite(Date.parse(v))?
   new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jakarta'}).format(new Date(v))+" WIB":"Belum tercatat";
 const safe=(v,n=800)=>typeof v==="string"?v.slice(0,n):"";
 function buildModel(data,period){
  if(!data||data.ok!==true||data.period!==period)throw Error("Periode sumber tidak sesuai.");
  if(data.ready!==true)return {ready:false,period};
  const d=data.latest;
  if(!d||d.posting_done!==false||d.state!=="WORKING_OPEN_RECON"
    ||!Array.isArray(d.source_rows)||!Array.isArray(d.kpi_rows)||!Array.isArray(d.exceptions)||!Array.isArray(d.next_actions))
    throw Error("Kontrak snapshot tidak valid.");
  return{ready:true,period,as_of:d.as_of,created_at:d.created_at,source_rows:d.source_rows,
   kpi_rows:d.kpi_rows,exceptions:d.exceptions,next_actions:d.next_actions,
   evidence_current:d.skt_revision_current===true&&d.ppic_evidence_current===true};
 }
 function mount(win){
  const doc=win.document,$=id=>doc.getElementById(id),panel=$("ppicDailyIntelPanel");
  if(!panel)return;
  const el=(tag,content,cls)=>{const node=doc.createElement(tag);if(content!==undefined)node.textContent=content;if(cls)node.className=cls;return node;};
  let enabled=false,reading=false,rev=0,timer=null,lastSnapshotDate=null;
  const period=()=>$("robotPeriod")?.value||"2026-11";
  const info=(str,state="neutral")=>{const node=$("ppicDailyIntelNotice");node.textContent=str;node.dataset.tone=state;};
  const stop=()=>{if(timer!==null)win.clearTimeout(timer);timer=null;};
  const schedule=()=>{stop();if(enabled)timer=win.setTimeout(()=>{if(doc.hidden)schedule();else refresh();},180000);};
  function reset(){
   for(const id of ["ppicDailyIntelKpis","ppicDailyIntelSources","ppicDailyIntelRisks","ppicDailyIntelActions"])$(id).replaceChildren();
   $("ppicDailyIntelBadge").textContent="Belum diperiksa";$("ppicDailyIntelBadge").dataset.tone="neutral";
   $("ppicDailyIntelTime").textContent="Belum ada sumber yang ditampilkan.";
   lastSnapshotDate=null;
   $("ppicDailyIntelTitle").textContent="Inteligensi Operasional — Update Terbaru";
   $("ppicDailyIntelRefresh").disabled=true;info("Login sebagai Owner untuk membaca analitik operasional terbaru.");
  }
  function metric(item){
   const n=el("div",undefined,"ppic-daily-kpi");
   n.append(el("span",safe(item.label,110)),el("strong",(item.unit==="Rp"?"Rp":"")+fmt(item.value)+(item.unit==="Rp"?"":" "+safe(item.unit,30))));
   n.append(el("small",QUAL[item.quality]||"Acuan","ppic-daily-quality"));return n;
  }
  function render(m){
   lastSnapshotDate=m.as_of;
   $("ppicDailyIntelTitle").textContent="Inteligensi Operasional — "+day(m.as_of);
   const badge=$("ppicDailyIntelBadge");badge.textContent=m.evidence_current?"Data terbaru · WORKING":"Ada pembaruan sumber";badge.dataset.tone=m.evidence_current?"working":"alert";
   $("ppicDailyIntelTime").textContent="Cut-off analitik "+day(m.as_of)+" · disimpan "+time(m.created_at)+" · "+m.source_rows.length+" kelompok sumber.";
   if(!m.evidence_current)info("Revisi sumber PPIC atau SKT berubah setelah snapshot ini. Tetap baca sebagai historis sampai pemeriksaan baru tersedia.","alert");
   else info("File terbaru sudah tercatat sebagai REFERENSI WORKING / OPEN RECON. Angka kandidat tidak otomatis mengganti ledger aktif, saldo fisik, invoice atau bank.","neutral");
   const kpis=$("ppicDailyIntelKpis");kpis.replaceChildren(...m.kpi_rows.map(metric));
   const sources=$("ppicDailyIntelSources");sources.replaceChildren();
   for(const src of m.source_rows){
    const card=el("article",undefined,"ppic-daily-source");card.dataset.state=src.source_status;
    const heading=el("div",undefined,"ppic-daily-source-head");
    heading.append(el("strong",safe(src.division,50)),el("span",STATE[src.source_status]||"WORKING","ppic-daily-state"));
    card.append(heading);
    const srcInfo=el("p","Sumber: "+safe(src.source_label,240),"ppic-daily-small");card.append(srcInfo);
    card.append(el("p","Data "+day(src.book_cutoff)+" · aktif PPIC "+day(src.active_cutoff),"ppic-daily-small"));
    for(const measure of src.metrics){
     const row=el("div",undefined,"ppic-daily-source-metric");
     row.append(el("span",safe(measure.label,140)),el("strong",(measure.unit==="Rp"?"Rp":"")+fmt(measure.value)+(measure.unit==="Rp"?"":" "+safe(measure.unit,40))));
     const qualifier=el("small",QUAL[measure.quality]||"Acuan","ppic-daily-quality");
     row.append(qualifier);card.append(row);
    }
    card.append(el("p",safe(src.note,800),"ppic-daily-explain"));
    if(src.source_binary_verified)card.append(el("small","Hash file asli telah diperiksa","ppic-daily-provenance"));
    else card.append(el("small","Referensi/metadata; pembacaan primer perlu pemeriksaan tambahan","ppic-daily-provenance"));
    sources.append(card);
   }
   const risks=$("ppicDailyIntelRisks");risks.replaceChildren();
   for(const risk of m.exceptions){
    const row=el("article",undefined,"ppic-daily-risk");row.dataset.priority=risk.priority;
    row.append(el("strong",safe(risk.priority+" · "+risk.division,100)));
    row.append(el("p",safe(risk.title,650)));
    risks.append(row);
   }
   const actions=$("ppicDailyIntelActions");actions.replaceChildren();
   for(const item of m.next_actions){
    const row=el("article",undefined,"ppic-daily-action");
    row.append(el("strong",safe(item.priority+" · "+item.owner,160)));
    row.append(el("p",safe(item.action,700)));
    actions.append(row);
   }
  }
  async function refresh(){
   if(!enabled||reading||typeof win.ppicLoadDailyIntel!=="function")return;
   const curr=++rev,p=period();reading=true;$("ppicDailyIntelRefresh").disabled=true;info("Memeriksa sumber terbaru dari database privat…");
   try{
    const response=await win.ppicLoadDailyIntel(p);
    if(!enabled||curr!==rev||p!==period())return;
    const m=buildModel(response,p);
    if(!m.ready){reset();$("ppicDailyIntelRefresh").disabled=false;info("Belum ada snapshot untuk periode ini. Tidak berarti produksi nol.");return;}
    render(m);
   }catch(e){if(enabled&&curr===rev)info("Status operasional belum dapat dibaca: "+safe(e?.message,180),"alert");}
   finally{reading=false;$("ppicDailyIntelRefresh").disabled=!enabled;schedule();}
  }
  $("ppicDailyIntelRefresh").addEventListener("click",refresh);
  $("ppicDailyIntelAsk").addEventListener("click",()=>{
   const input=$("ppicAskText"),intent=$("ppicAskIntent");
   if(!enabled||!input||input.disabled||!intent||!lastSnapshotDate)return;
   intent.value="ANALYZE";
   input.value="Berdasarkan snapshot lintas divisi BAL tanggal "+day(lastSnapshotDate)+" di Web PPIC, ringkas perubahan kerja terbaru DO, Barang Jadi, Cukai, Bahan Baku, Kas, PMS, Giling, Verpack, TSG, SDM, serta SKT. Pisahkan data aktif, kandidat OPEN RECON, dan sumber DIAJUKAN. Tentukan prioritas P1 tanpa mengubah ledger, stok, CK-1, kas atau piutang.";
   input.focus();input.scrollIntoView({behavior:"smooth",block:"center"});
   info("Pertanyaan siap ditinjau. Tekan Kirim ke GPT setelah Anda memeriksanya.");
  });
  $("robotPeriod")?.addEventListener("change",()=>{rev++;reset();if(enabled)refresh();});
  doc.addEventListener("visibilitychange",()=>{if(!doc.hidden&&enabled&&!reading)refresh();});
  win.ppicDailyIntelSessionReady=()=>{enabled=true;$("ppicDailyIntelRefresh").disabled=false;refresh();};
  win.ppicDailyIntelClear=()=>{enabled=false;rev++;stop();reading=false;reset();};
  reset();
 }
 return{buildModel,mount};
});
