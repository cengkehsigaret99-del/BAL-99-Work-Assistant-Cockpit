"use strict";
(function(root,factory){
 const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;
 if(root&&root.document){root.PPICSJCrossBook=api;api.mount(root);}
})(typeof window==="object"?window:null,function(){
 const statuses={
  DO_BJ_LINES_MATCH:"Baris DO ↔ Barang Jadi",
  SJ334_IDENTICAL_BOOK:"SJ334 sama tanggal, SKU dan jumlah",
  BJ_BOOK_ROLLFORWARD:"Saldo akhir Barang Jadi sesuai mutasi",
  CASH_23_SJ_WORKING_MATCH:"23 SJ terdahulu cocok ke Kas V16",
  CASH_PAYMENT_SJ334_ALLOCATION:"Pembayaran khusus SJ334",
  PPIC_ACTIVE_BJ_CUTOFF:"Sumber Barang Jadi aktif di PPIC"
 };
 const format=n=>typeof n==="number"&&Number.isFinite(n)?new Intl.NumberFormat("id-ID",{maximumFractionDigits:2}).format(n):"Belum tersedia";
 const date=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)?
   new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(x+"T00:00:00Z")):"Belum diketahui";
 const moment=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))?
   new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Jakarta"}).format(new Date(x))+" WIB":"Belum ada";
 const safe=(s,n=520)=>typeof s==="string"?s.slice(0,n):"";
 function buildModel(v,p){
  if(v?.ok!==true||v?.period!==p)throw Error("Periode tidak cocok.");
  if(v.ready!==true)return{ready:false,period:p};
  const d=v.latest;
  if(!d||d.status!=="BOOK_MATCHED_CASH_OPEN"||!Array.isArray(d.checks)||!Array.isArray(d.exceptions))throw Error("Data rekonsiliasi belum valid.");
  return{ready:true,period:p,...d};
 }
 function mount(win){
  const doc=win.document,$=id=>doc.getElementById(id),panel=$("ppicCrossBookPanel");
  if(!panel)return;
  const node=(tag,t,cls)=>{const e=doc.createElement(tag);if(t!==undefined)e.textContent=t;if(cls)e.className=cls;return e;};
  let enabled=false,pending=false,revision=0,timer=null;
  const period=()=>$("robotPeriod")?.value||"2026-11";
  const notice=(txt,tone="neutral")=>{$("ppicCrossBookNotice").textContent=txt;$("ppicCrossBookNotice").dataset.tone=tone;};
  function stop(){if(timer!==null)win.clearTimeout(timer);timer=null;}
  function schedule(){stop();if(enabled)timer=win.setTimeout(()=>{if(doc.hidden)schedule();else refresh();},180000);}
  function reset(){
   for(const id of ["ppicCrossBookMetrics","ppicCrossBookChecks","ppicCrossBookRisks"])$(id).replaceChildren();
   $("ppicCrossBookBadge").textContent="Belum diperiksa";$("ppicCrossBookBadge").dataset.tone="neutral";
   $("ppicCrossBookTime").textContent="Belum ada bukti rekonsiliasi yang dimuat.";
   $("ppicCrossBookRefresh").disabled=true;
   notice("Login sebagai Owner untuk melihat pencocokan buku dan bukti kas.");
  }
  function display(v){
   const badge=$("ppicCrossBookBadge");
   const historical=v.do_active_evidence_matches===false;
   badge.textContent=historical?"ARSIP 21 NOV · BUKAN SALDO TERBARU":"BUKU COCOK · KAS TERBUKA";
   badge.dataset.tone="warning";
   $("ppicCrossBookTime").textContent="SJ"+format(v.sj_no)+" · DO & BJ "+date(v.cutoff)+" · pemeriksaan "+moment(v.created_at);
   const s=v.summary,c=v.cash_context;
   notice(historical
     ?"Audit SJ334 tanggal 21 November adalah ARSIP: pengiriman Tri Sukma Aji dipindah ke SJ338; SJ334 terbaru adalah milik Khoirul Soleh. Lihat DO dan Barang Jadi 25 November untuk saldo kini. Bukti bayar/invoice/POD historis masih OPEN RECON."
     :"Seluruh baris buku cocok; alokasi pembayaran dan bukti terima pelanggan SJ334 belum disahkan. Jangan kurangi stok atau mencatat kas sekali lagi.","warning");
   const metrics=$("ppicCrossBookMetrics");metrics.replaceChildren();
   for(const [label,value]of [
    ["Baris DO ↔ BJ",format(s.do_bj_lines_matched)+" / "+format(s.do_bj_total_lines_checked)],
    ["Selisih pack",format(s.do_bj_qty_difference_pack)],
    [historical?"SJ334 lama → SJ338":"SJ334",format(s.pack)+" pack · "+format(s.cartons)+" karton"],
    ["Nilai DO kerja","Rp"+format(s.working_nominal_rp)],
    [historical?"Saldo BJ historis 21 Nov":"Saldo buku Barang Jadi",format(s.bj_book_closing_pack)+" pack"],
    ["Kas V16: alokasi SJ334",c.sj334_explicit_allocation_rp===null?"Belum ada bukti":"Rp"+format(c.sj334_explicit_allocation_rp)]
   ]){
    const m=node("div",undefined,"ppic-cross-metric");m.append(node("small",label),node("strong",value));metrics.append(m);
   }
   const checks=$("ppicCrossBookChecks");checks.replaceChildren();
   for(const x of v.checks){
    const item=node("div",undefined,"ppic-cross-check");
    item.append(node("strong",statuses[x.code]||safe(x.code,90)));
    item.append(node("span",x.state==="PASS"?"Cocok":x.state==="OPEN_RECON"?"Perlu bukti":x.state==="STALE_SOURCE"?"Sumber web tertinggal":"Tinjau","ppic-cross-check-state"));
    checks.append(item);
   }
   const riskList=$("ppicCrossBookRisks");riskList.replaceChildren();
   for(const x of v.exceptions){
    const card=node("article",undefined,"ppic-cross-risk");
    card.append(node("strong",(x.severity==="HIGH"?"Penting · ":"Periksa · ")+safe(x.division,40)));
    card.append(node("p",safe(x.description,400)));
    card.append(node("small","Tindak lanjut: "+safe(x.responsible,110)));
    riskList.append(card);
   }
   const oldCutoff=date(v.bj_active_cutoff);
   const cutoffLabel=v.bj_book_is_current_in_ppic?
     "Buku Barang Jadi aktif PPIC sudah sama dengan file yang diperiksa.":
     "Workbook Barang Jadi 21 November sudah diaudit, tetapi sumber aktif Web PPIC masih "+oldCutoff+". Jangan salah tafsir sebagai stok sudah diposting.";
   $("ppicCrossBookSource").textContent=historical
     ?"Audit lama tetap tersedia untuk jejak bukti. Sumber BJ aktif sekarang "+oldCutoff+"; saldo 25 November di modul Barang Jadi, bukan di kartu audit 21 November."
     :cutoffLabel;
  }
  async function refresh(){
   if(!enabled||pending||typeof win.ppicLoadCrossBookStatus!=="function")return;
   const thisRev=++revision,p=period();pending=true;$("ppicCrossBookRefresh").disabled=true;notice("Membaca snapshot audit dari Supabase…");
   try{
    const result=buildModel(await win.ppicLoadCrossBookStatus(p),p);
    if(!enabled||thisRev!==revision||p!==period())return;
    if(!result.ready){notice("Belum ada snapshot rekonsiliasi untuk periode ini.");return;}
    display(result);
   }catch(e){if(enabled&&thisRev===revision)notice("Status belum terbaca: "+safe(e?.message,170),"warning");}
   finally{pending=false;$("ppicCrossBookRefresh").disabled=!enabled;schedule();}
  }
  $("ppicCrossBookRefresh").addEventListener("click",refresh);
  $("robotPeriod")?.addEventListener("change",()=>{revision++;if(enabled)refresh();});
  doc.addEventListener("visibilitychange",()=>{if(!doc.hidden&&enabled&&!pending)refresh();});
  win.ppicCrossBookSessionReady=()=>{enabled=true;$("ppicCrossBookRefresh").disabled=false;refresh();};
  win.ppicCrossBookClear=()=>{enabled=false;revision++;stop();pending=false;reset();};
  reset();
 }
 return{buildModel,mount};
});
