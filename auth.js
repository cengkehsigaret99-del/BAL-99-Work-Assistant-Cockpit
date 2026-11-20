"use strict";
(() => {
 const ROOT="https://jryfozndxpjymggevkgq.supabase.co";
 const KEY="sb_publishable_T6Yt1YFAIu0F7o-twLOGNg_AgAvDGbP";
 const EMAIL="cengkehsigaret99@gmail.com";
 const $=id=>document.getElementById(id);
 const login=$("ownerLogin"),main=$("ppicMain"),status=$("loginStatus"),form=$("loginForm"),logout=$("logoutOwner");
 let accessToken="",expiresAt=0,expiryTimer=null,attempt=0,docsRequest=null,reportsRequest=null,dailyRequest=null,customerRequest=null,materialRequest=null,finishedRequest=null,sdmRequest=null,autoImportRequest=null,autoImportSequence=0,robotRequest=null,robotSequence=0;
 const robotPeriod=()=>$("robotPeriod")?.value||"2026-11";
 async function loadRobotStatus(token,current,period=robotPeriod()){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw Error("Periode Robot Manajer tidak valid.");
  if(robotRequest)robotRequest.abort();robotRequest=new AbortController();const sequence=++robotSequence;
  window.ppicRobotStatusLoading?.(period);
  try{
   const response=await fetch(ROOT+"/functions/v1/ppic-robot-status",{method:"POST",headers:{"apikey":KEY,"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({period}),cache:"no-store",signal:robotRequest.signal});
   const data=await response.json().catch(()=>({}));
   if(current!==attempt||accessToken!==token||sequence!==robotSequence||period!==robotPeriod())throw Object.assign(Error("Sesi atau periode Robot Manajer berubah."),{name:"AbortError"});
   if(!response.ok||data.ok!==true)throw Object.assign(Error(data.error||data.message||"Robot Manajer belum dapat dibaca ("+response.status+")."),{status:response.status});
   if(data.period!==period)throw Error("Periode jawaban Robot Manajer tidak sesuai. Muat ulang status.");
   window.ppicSetRobotStatus?.(data,period);return data;
  }catch(error){
   if(current===attempt&&accessToken===token&&sequence===robotSequence&&period===robotPeriod()&&error?.name!=="AbortError")window.ppicRobotStatusError?.(error.message||"Robot Manajer belum dapat dibaca.",{period,unconfigured:error.status===404});
   if(error?.status===404)return null;
   throw error;
  }
 }
 window.ppicLoadRobotStatus=async(period=robotPeriod())=>{
  if(!accessToken||Date.now()>=expiresAt)throw Error("Sesi Owner berakhir. Login kembali.");
  return loadRobotStatus(accessToken,attempt,period);
 };
 window.ppicAssistantTransport=async payload=>{
  if(!accessToken||Date.now()>=expiresAt)throw Error("Sesi Owner berakhir. Login kembali.");
  const current=attempt,token=accessToken;
  const response=await fetch(ROOT+"/functions/v1/ppic-owner-assistant",{
   method:"POST",headers:{"apikey":KEY,"Authorization":"Bearer "+token,"Content-Type":"application/json"},
   body:JSON.stringify(payload),cache:"no-store"
  });
  const data=await response.json().catch(()=>({}));
  if(current!==attempt||token!==accessToken)throw Object.assign(Error("Sesi Owner berubah."),{name:"AbortError"});
  if(!response.ok||data.ok!==true)throw Error(data.error||"Asisten PPIC belum dapat dihubungi ("+response.status+").");
  return data;
 };
 let stage3Controller=null,stage3Sequence=0;
 window.ppicLoadStage3Status=async(period=robotPeriod())=>{
  if(!accessToken||Date.now()>=expiresAt)throw Error("Sesi Owner berakhir. Login kembali.");
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw Error("Periode keputusan tidak valid.");
  if(stage3Controller)stage3Controller.abort();
  stage3Controller=new AbortController();
  const token=accessToken,current=attempt,sequence=++stage3Sequence;
  const response=await fetch(ROOT+"/functions/v1/ppic-stage3-status",{
   method:"POST",headers:{"apikey":KEY,"Authorization":"Bearer "+token,"Content-Type":"application/json"},
   body:JSON.stringify({period}),cache:"no-store",signal:stage3Controller.signal
  });
  const data=await response.json().catch(()=>({}));
  if(current!==attempt||token!==accessToken||sequence!==stage3Sequence||period!==robotPeriod())
   throw Object.assign(Error("Sesi Owner atau periode berubah."),{name:"AbortError"});
  if(!response.ok||data.ok!==true)throw Error(data.error||"Pusat keputusan belum dapat dibaca ("+response.status+").");
  return data;
 };
 let stage2Controller=null,stage2Sequence=0;
 window.ppicLoadStage2Status=async(period=robotPeriod())=>{
  if(!accessToken||Date.now()>=expiresAt)throw Error("Sesi Owner berakhir. Login kembali.");
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw Error("Periode Tahap 2 tidak valid.");
  if(stage2Controller)stage2Controller.abort();
  stage2Controller=new AbortController();
  const token=accessToken,current=attempt,sequence=++stage2Sequence;
  const response=await fetch(ROOT+"/functions/v1/ppic-stage2-status",{
   method:"POST",headers:{"apikey":KEY,"Authorization":"Bearer "+token,"Content-Type":"application/json"},
   body:JSON.stringify({period}),cache:"no-store",signal:stage2Controller.signal
  });
  const data=await response.json().catch(()=>({}));
  if(current!==attempt||token!==accessToken||sequence!==stage2Sequence||period!==robotPeriod())
   throw Object.assign(Error("Sesi atau periode berubah."),{name:"AbortError"});
  if(!response.ok||data.ok!==true)throw Error(data.error||"Rekonsiliasi otomatis belum dapat dibaca ("+response.status+").");
  return data;
 };
 const autoImportPeriod=()=>$("autoImportPeriod")?.value||"2026-11";
 async function loadAutoImportStatus(token,current,period=autoImportPeriod()){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw Error("Periode sinkron tidak valid.");
  if(autoImportRequest)autoImportRequest.abort();autoImportRequest=new AbortController();const sequence=++autoImportSequence;
  window.ppicAutoImportStatusLoading?.(period);
  try{
  const response=await fetch(ROOT+"/functions/v1/ppic-auto-import-status",{method:"POST",headers:{"apikey":KEY,"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({period}),cache:"no-store",signal:autoImportRequest.signal});
  const data=await response.json().catch(()=>({}));
  if(current!==attempt||accessToken!==token||sequence!==autoImportSequence||period!==autoImportPeriod())throw Object.assign(Error("Sesi atau periode sinkron berubah."),{name:"AbortError"});
  if(!response.ok||data.ok!==true)throw Object.assign(Error(data.error||data.message||"Status sinkron belum dapat dibaca ("+response.status+")."),{status:response.status});
  window.ppicSetAutoImportStatus?.(data,period);return data;
  }catch(error){
   if(current===attempt&&accessToken===token&&sequence===autoImportSequence&&period===autoImportPeriod()&&error?.name!=="AbortError")window.ppicAutoImportStatusError?.(error.message||"Status sinkron belum dapat dibaca.",{period,allowLegacy:error.status===404});
   throw error;
  }
 }
 window.ppicLoadAutoImportStatus=async(period=autoImportPeriod())=>{
  if(!accessToken||Date.now()>=expiresAt)throw Error("Sesi Owner berakhir. Login kembali.");
  return loadAutoImportStatus(accessToken,attempt,period);
 };
 async function loadDocs(token,current){
  if(docsRequest)docsRequest.abort();docsRequest=new AbortController();
  const response=await fetch(ROOT+"/rest/v1/ppic_source_catalog?select=document_id,division,period,cutoff,version,reconciliation_status,access_class,ingested_at&order=ingested_at.desc&limit=200",{headers:{"apikey":KEY,"Authorization":"Bearer "+token},cache:"no-store",signal:docsRequest.signal});
  if(!response.ok)throw Error("Bank Data belum dapat dibaca ("+response.status+").");
  const rows=await response.json();if(current===attempt&&accessToken===token)window.ppicSetDocs(rows);
 }
 async function loadReports(token,current){
  if(reportsRequest)reportsRequest.abort();reportsRequest=new AbortController();
  const response=await fetch(ROOT+"/rest/v1/ppic_reports_owner_view?select=report_key,period,title,cutoff,version,status,basis,payload,source_refs,created_at&order=created_at.desc&limit=50",{headers:{"apikey":KEY,"Authorization":"Bearer "+token},cache:"no-store",signal:reportsRequest.signal});
  if(!response.ok)throw Error("Laporan privat belum dapat dibaca ("+response.status+").");
  const rows=await response.json();
  if(current===attempt&&accessToken===token)window.ppicSetReports(rows);
 }
 window.ppicUploadPrivate=async({file,division,period,cutoff,version})=>{
  if(!accessToken||Date.now()>=expiresAt)throw Error("Sesi Owner berakhir. Login kembali.");
  const current=attempt;
  const response=await fetch(ROOT+"/functions/v1/ppic-owner-upload",{
   method:"POST",headers:{"apikey":KEY,"Authorization":"Bearer "+accessToken,"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "x-ppic-filename":file.name,"x-ppic-division":division,"x-ppic-period":period,"x-ppic-cutoff":cutoff,"x-ppic-version":version},
   body:file,cache:"no-store"
  });
  const data=await response.json().catch(()=>({}));
  if(current!==attempt||!accessToken)throw Error("Sesi berubah. Periksa daftar sumber sebelum mengulang upload.");
  if(!response.ok||data.ok!==true)throw Error(data.message||data.error||"Upload gagal ("+response.status+").");
  await loadDocs(accessToken,current);
  return data;
 };
 window.ppicRebuildSDM=async({period="2026-11"}={})=>{
  if(!accessToken||Date.now()>=expiresAt)throw Error("Sesi Owner berakhir. Login kembali.");
  const current=attempt,token=accessToken;
  const response=await fetch(ROOT+"/functions/v1/ppic-sdm-rebuild",{
   method:"POST",headers:{"apikey":KEY,"Authorization":"Bearer "+token,"Content-Type":"application/json"},
   body:JSON.stringify({period}),cache:"no-store"
  });
  const data=await response.json().catch(()=>({}));
  if(current!==attempt||accessToken!==token)throw Error("Sesi Owner berubah. Silakan login kembali.");
  if(!response.ok||data.ok!==true)throw Error(data.error||data.message||"Gagal memproses sumber SDM.");
  await loadDocs(token,current);
  await loadSDM(token,current);
  return data;
 };
 window.ppicRefreshPrivateData=async()=>{
  if(!accessToken||Date.now()>=expiresAt)throw Error("Sesi Owner berakhir.");
  const token=accessToken,current=attempt;
  const outcomes=await Promise.allSettled([loadDocs(token,current),loadReports(token,current),loadDaily(token,current),loadCustomers(token,current),loadMaterials(token,current),loadFinished(token,current),loadSDM(token,current),loadAutoImportStatus(token,current),loadRobotStatus(token,current)]);
  if(current!==attempt||accessToken!==token)throw Error("Sesi berubah. Login kembali untuk membaca laporan terbaru.");
  const failed=outcomes.filter(result=>result.status==="rejected"&&result.reason?.name!=="AbortError");
  if(failed.length)throw Error("Sebagian data belum diperbarui: "+failed.map(result=>result.reason?.message||"akses gagal").join("; "));
  return {ok:true,modules:outcomes.length};
 };
 window.ppicRefreshPrivateDocs=window.ppicRefreshPrivateData;
 async function loadDaily(token,current){
  if(dailyRequest)dailyRequest.abort();dailyRequest=new AbortController();
  const response=await fetch(ROOT+"/rest/v1/ppic_daily_owner_view?select=period,division,cutoff,version,status,unit,valuation_basis,payload,source_document_ids,created_at&order=created_at.desc&limit=100",{
   headers:{"apikey":KEY,"Authorization":"Bearer "+token},cache:"no-store",signal:dailyRequest.signal
  });
  if(!response.ok)throw Error("Ledger harian belum dapat dibaca ("+response.status+").");
  const rows=await response.json();if(current===attempt&&accessToken===token)window.ppicSetDaily(rows);
 }
 async function loadCustomers(token,current){
  if(customerRequest)customerRequest.abort();customerRequest=new AbortController();
  const response=await fetch(ROOT+"/rest/v1/ppic_do_customer_owner_view?select=period,cutoff,version,status,source_document_id,rows,created_at&order=created_at.desc&limit=20",{headers:{"apikey":KEY,"Authorization":"Bearer "+token},cache:"no-store",signal:customerRequest.signal});
  if(!response.ok)throw Error("Detail DO customer belum terbaca ("+response.status+").");
  const rows=await response.json();if(current===attempt&&accessToken===token)window.ppicSetDoCustomers(rows);
 }
 async function loadMaterials(token,current){
  if(materialRequest)materialRequest.abort();materialRequest=new AbortController();
  const response=await fetch(ROOT+"/rest/v1/ppic_material_daily_owner_view?select=period,cutoff,version,status,payload,source_document_id,created_at&order=created_at.desc&limit=20",{headers:{"apikey":KEY,"Authorization":"Bearer "+token},cache:"no-store",signal:materialRequest.signal});
  if(!response.ok)throw Error("Detail bahan baku belum terbaca ("+response.status+").");
  const rows=await response.json();if(current===attempt&&accessToken===token)await window.ppicSetMaterials(rows);
 }
 async function loadFinished(token,current){
  if(finishedRequest)finishedRequest.abort();finishedRequest=new AbortController();
  const response=await fetch(ROOT+"/rest/v1/ppic_finished_goods_owner_view?select=period,cutoff,version,status,payload,source_document_id,created_at&order=created_at.desc&limit=20",{headers:{"apikey":KEY,"Authorization":"Bearer "+token},cache:"no-store",signal:finishedRequest.signal});
  if(!response.ok)throw Error("Detail Barang Jadi belum terbaca ("+response.status+").");
  const rows=await response.json();if(current===attempt&&accessToken===token)await window.ppicSetFinished(rows);
 }
 async function loadSDM(token,current){
  window.ppicBeginSDMLoad?.();
  if(sdmRequest)sdmRequest.abort();sdmRequest=new AbortController();
  const response=await fetch(ROOT+"/rest/v1/ppic_sdm_weekly_owner_view?select=period,version,cutoff,status,payload,source_document_ids,created_at&order=created_at.desc&limit=12",{headers:{"apikey":KEY,"Authorization":"Bearer "+token},cache:"no-store",signal:sdmRequest.signal});
  if(!response.ok)throw Error("Detail SDM belum terbaca ("+response.status+").");
  const rows=await response.json();if(current===attempt&&accessToken===token)await window.ppicSetSDM(rows);
 }
 const MAX_SESSION_MS=30*60*1000;
 function clearExpiry(){if(expiryTimer!==null){clearTimeout(expiryTimer);expiryTimer=null}expiresAt=0}
 function expire(){attempt++;show(false);message("Sesi berakhir. Silakan login kembali.")}
 const show=(authorized)=>{login.hidden=authorized;main.hidden=!authorized;logout.hidden=!authorized;if(authorized){window.ppicAutoImportSessionReady?.();window.ppicRobotSessionReady?.();window.ppicAssistantSessionReady?.();window.ppicStage2SessionReady?.();window.ppicStage3SessionReady?.()}else{window.ppicStage3Clear?.();if(stage3Controller)stage3Controller.abort();stage3Sequence++;window.ppicStage2Clear?.();if(stage2Controller)stage2Controller.abort();stage2Sequence++;window.ppicAssistantClear?.();window.ppicClearRobotStatus?.();if(robotRequest)robotRequest.abort();robotSequence++;window.ppicClearAutoImportStatus?.();if(autoImportRequest)autoImportRequest.abort();autoImportSequence++;if(window.ppicClearDailyInfo)window.ppicClearDailyInfo();if(docsRequest)docsRequest.abort();if(reportsRequest)reportsRequest.abort();if(dailyRequest)dailyRequest.abort();if(customerRequest)customerRequest.abort();if(materialRequest)materialRequest.abort();if(finishedRequest)finishedRequest.abort();if(sdmRequest)sdmRequest.abort();accessToken="";clearExpiry();if($("search"))$("search").value="";window.ppicSetDocs([]);window.ppicSetReports([]);window.ppicSetDaily([]);window.ppicSetDoCustomers([]);window.ppicSetMaterials([]);window.ppicSetFinished([]);window.ppicSetSDM([]);const modal=$("previewModal");if(modal)modal.hidden=true;const frame=$("previewFrame");if(frame)frame.srcdoc="";$("ownerPassword").value=""}};
 const message=(value)=>{status.textContent=value};
 async function verify(token){
  const response=await fetch(ROOT+"/functions/v1/ppic-owner-check",{method:"GET",headers:{"apikey":KEY,"Authorization":"Bearer "+token},cache:"no-store"});
  if(!response.ok)throw Error(response.status===403?"Akun ini tidak memiliki izin Owner.":"Verifikasi Owner gagal ("+response.status+").");
  const result=await response.json();
  if(result.authorized!==true||result.role!=="owner")throw Error("Identitas Owner tidak sah.");
 }
 async function signIn(email,password){
  const response=await fetch(ROOT+"/auth/v1/token?grant_type=password",{method:"POST",headers:{"apikey":KEY,"Content-Type":"application/json"},body:JSON.stringify({email,password}),cache:"no-store"});
  if(!response.ok)throw Error("Login gagal. Periksa email, kata sandi, dan pengaturan Supabase Auth.");
  return response.json();
 }
 form.addEventListener("submit",async(event)=>{
  event.preventDefault();const current=++attempt;$("loginButton").disabled=true;message("Memverifikasi akun Owner…");
  try{
   const email=$("ownerEmail").value.trim().toLowerCase();
   if(email!==EMAIL)throw Error("Email ini bukan akun Owner BAL PPIC.");
   const session=await signIn(email,$("ownerPassword").value);
   await verify(session.access_token);
   if(current!==attempt)return;
   const seconds=Number(session.expires_in);
   if(!Number.isFinite(seconds)||seconds<=0)throw Error("Masa berlaku sesi tidak valid.");
   accessToken=session.access_token;
   const duration=Math.min(seconds*1000,MAX_SESSION_MS);
   expiresAt=Date.now()+duration;
   expiryTimer=setTimeout(expire,duration);
   show(true);window.ppicGoHome?.();message("Owner terverifikasi. Memuat Bank Data dan laporan privat…");
   const outcomes=await Promise.allSettled([loadDocs(accessToken,current),loadReports(accessToken,current),loadDaily(accessToken,current),loadCustomers(accessToken,current),loadMaterials(accessToken,current),loadFinished(accessToken,current),loadSDM(accessToken,current),loadAutoImportStatus(accessToken,current),loadRobotStatus(accessToken,current)]);
   if(current===attempt){
    const bad=outcomes.filter(result=>result.status==="rejected"&&result.reason?.name!=="AbortError");
    if(bad.length)message("Login berhasil, tetapi sebagian data belum terbaca: "+bad.map(x=>x.reason?.message||"akses gagal").join("; "));
    else message("Bank Data dan laporan kerja berhasil diperiksa. Laporan OPEN RECON bukan closing final.");
   }
  }catch(error){if(current===attempt){show(false);message(error.message||"Gagal masuk.")}}
  finally{$("loginButton").disabled=false}
 });
 logout.addEventListener("click",async()=>{
  attempt++;const token=accessToken;show(false);message("Anda sudah keluar.");
  if(token){try{await fetch(ROOT+"/auth/v1/logout",{method:"POST",headers:{"apikey":KEY,"Authorization":"Bearer "+token}})}catch(_){/* local logout always applies */}}
 });
 document.addEventListener("visibilitychange",()=>{if(!document.hidden&&accessToken&&Date.now()>=expiresAt)expire()});
 window.addEventListener("pageshow",event=>{if(event.persisted)expire()});
 // Fail closed on reload; do not persist credentials or tokens in browser storage.
 show(false);
})();

