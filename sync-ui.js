(function(root,factory){
 "use strict";
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root&&root.document){root.PPICAutoImport=api;api.mount(root);}
})(typeof window==='object'?window:null,function(){
 "use strict";
 const states={STAGING:['Menyiapkan file','pending'],QUEUED:['Dalam antrean','pending'],PROCESSING:['Sedang diperiksa','pending'],IMPORTED:['Arsip diterima','success'],DUPLICATE:['Sudah tercatat','neutral'],FAILED:['Perlu pemeriksaan','warning']};
 const reports={ARCHIVE_ONLY:['Arsip sumber','neutral'],REVIEW_REQUIRED:['Menunggu pemrosesan SDM','pending'],SUPERSEDED:['Referensi versi sebelumnya','neutral'],PROCESSED:['Laporan diproses','success']};
 const text=(value,max=500)=>typeof value==='string'?value.slice(0,max):'';
 function dateOnly(value){
  const s=text(value,40).slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return 'Belum tersedia';
  const d=new Date(s+'T00:00:00Z');
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s)return 'Belum tersedia';
  return new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(d);
 }
 function timestamp(value){
  const s=text(value,60);if(!s)return 'Belum tercatat';
  const d=new Date(s);if(!Number.isFinite(d.getTime()))return 'Belum tercatat';
  return new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jakarta'}).format(d)+' WIB';
 }
 function buildModel(payload){
  if(!payload||payload.ok!==true||!payload.config||!Array.isArray(payload.jobs))throw Error('Status sinkron belum dapat diverifikasi.');
  const config=payload.config;
  const policy=payload.source_policy;
  if(policy!==undefined&&(!policy||!Array.isArray(policy.excluded_document_ids)||policy.excluded_document_ids.length>2000||policy.excluded_document_ids.some(id=>typeof id!=='string'||!id||id.length>200)))throw Error('Kebijakan sumber sinkron belum dapat diverifikasi.');
  const enabled=config.enabled===true&&!!text(config.automation_id,200)&&config.cadence==='HOURLY'&&config.timezone==='Asia/Jakarta';
  const jobs=payload.jobs.slice(0,200).map(raw=>{
   const j=raw&&typeof raw==='object'?raw:{};
   const state=text(j.status,40),status=states[state]||['Status belum dikenal','warning'];
   const archived=state==='IMPORTED'||state==='DUPLICATE';
   const report=archived?(reports[text(j.report_status,40)]||['Status laporan belum tersedia','neutral']):['Belum diproses menjadi laporan','neutral'];
   return {id:text(j.id,200),documentId:text(j.document_id,200),filename:text(j.filename,200)||'Nama file belum tersedia',division:text(j.division,60)||'Kategori belum tersedia',period:text(j.period,7),version:text(j.version,20)||'—',cutoff:dateOnly(j.cutoff),status:state,statusLabel:status[0],statusTone:status[1],reportStatus:text(j.report_status,40),reportLabel:report[0],reportTone:report[1],message:text(j.message,700),completed:timestamp(j.completed_at),archived,needsReview:state==='FAILED'||!states[state]};
  });
  const counts={imported:jobs.filter(j=>j.status==='IMPORTED').length,duplicate:jobs.filter(j=>j.status==='DUPLICATE').length,waiting:jobs.filter(j=>['STAGING','QUEUED','PROCESSING'].includes(j.status)||j.archived&&j.reportStatus==='REVIEW_REQUIRED').length,attention:jobs.filter(j=>j.needsReview).length};
  const excludedDocumentIds=[...new Set([...(policy?.excluded_document_ids||[]),...jobs.filter(j=>j.archived&&j.documentId&&['ARCHIVE_ONLY','SUPERSEDED'].includes(j.reportStatus)).map(j=>j.documentId)])];
  return {enabled,sourcePolicyComplete:policy===undefined||policy.complete===true,sourcePolicyPeriod:text(policy?.period,7),excludedDocumentIds,waitingForFirstCheck:enabled&&!text(config.last_check_at,60),lastCheck:timestamp(config.last_check_at),lastSuccess:timestamp(config.last_success_at),jobs,counts,stateLabel:enabled?(config.last_check_at?'Sinkron otomatis aktif':'Aktif · menunggu pemeriksaan pertama'):'Sinkron otomatis belum aktif',scheduleLabel:enabled?'Pemeriksaan setiap jam · WIB':'Jadwal belum terkonfirmasi'};
 }
 function mount(win){
  const doc=win.document,$=id=>doc.getElementById(id);
  if(!$('autoImportPanel'))return;
  let sessionActive=false,generation=0,timer=null,lastModel=null,loading=false;
  const sourcePolicies=new Map();
  const set=(id,value)=>{const e=$(id);if(e)e.textContent=value;};
  const badge=(label,tone)=>{const el=doc.createElement('span');el.className='sync-badge sync-'+tone;el.textContent=label;return el;};
  function reset(){
   generation++;sessionActive=false;loading=false;lastModel=null;sourcePolicies.clear();
   if(timer!==null)win.clearTimeout(timer);timer=null;
   $('autoImportJobs').replaceChildren();set('autoImportState','Masuk sebagai Owner untuk melihat status sinkron.');
   $('autoImportState').dataset.tone='neutral';set('autoImportSchedule','Status koneksi belum diperiksa');
   set('autoImportLastCheck','Belum tercatat');set('autoImportLastSuccess','Belum tercatat');
   set('autoImportImported','—');set('autoImportWaiting','—');set('autoImportAttention','—');
   set('autoImportCount','');set('autoImportError','');set('autoImportEmpty','Belum ada hasil sinkron yang ditampilkan.');
   $('autoImportEmpty').hidden=false;$('autoImportRefresh').disabled=true;
  }
  function render(model){
   if(!sessionActive||$('ppicMain').hidden)return;
   lastModel=model;set('autoImportState',model.stateLabel);$('autoImportState').dataset.tone=model.enabled?'success':'neutral';
   set('autoImportSchedule',model.scheduleLabel);set('autoImportLastCheck',model.lastCheck);set('autoImportLastSuccess',model.lastSuccess);
   set('autoImportImported',String(model.counts.imported));set('autoImportWaiting',String(model.counts.waiting));set('autoImportAttention',String(model.counts.attention));
   set('autoImportCount',model.jobs.length+' file pada daftar ini'+(model.counts.duplicate?' · '+model.counts.duplicate+' file identik sudah tercatat':''));set('autoImportError','');
   const list=$('autoImportJobs');list.replaceChildren();
   for(const job of model.jobs){
    const li=doc.createElement('li');li.className='sync-file';
    const name=doc.createElement('strong');name.className='sync-file-name';name.textContent=job.filename;li.append(name);
    const meta=doc.createElement('p');meta.className='sync-file-meta';meta.textContent=job.division+' · '+job.version+' · Cut-off '+job.cutoff;li.append(meta);
    const labels=doc.createElement('div');labels.className='sync-file-labels';labels.append(badge(job.statusLabel,job.statusTone),badge(job.reportLabel,job.reportTone));li.append(labels);
    if(job.message){const p=doc.createElement('p');p.className='sync-file-message';p.textContent=job.message;li.append(p);}
    list.append(li);
   }
   $('autoImportEmpty').hidden=model.jobs.length>0;
   set('autoImportEmpty',model.enabled?'Belum ada file hasil chat yang masuk pada periode ini.':'Belum ada file tercatat. Status otomatis akan berubah setelah konfigurasi terverifikasi.');
  }
  function schedule(){
   if(timer!==null)win.clearTimeout(timer);timer=null;
   if(!sessionActive)return;
   timer=win.setTimeout(async()=>{timer=null;if(sessionActive&&!doc.hidden)await refresh();schedule();},60000);
  }
  async function refresh(){
   if(!sessionActive||$('ppicMain').hidden||loading)return;
   const period=$('autoImportPeriod').value;
   if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)){set('autoImportError','Pilih periode bulan yang valid.');return;}
   const current=generation;loading=true;$('autoImportRefresh').disabled=true;set('autoImportError','Memuat status sinkron…');
   try{
    if(typeof win.ppicLoadAutoImportStatus!=='function')throw Error('Status sinkron belum tersedia.');
    await win.ppicLoadAutoImportStatus(period);
   }catch(error){
    if(current===generation&&sessionActive&&!$('ppicMain').hidden&&error?.name!=='AbortError')set('autoImportError',(error?.message||'Status sinkron belum dapat dibaca.')+(lastModel?' Daftar terakhir tetap ditampilkan.':''));
   }finally{if(current===generation){loading=false;$('autoImportRefresh').disabled=!sessionActive;}}
  }
  win.ppicSetAutoImportStatus=(payload,period=$('autoImportPeriod').value)=>{
   if(!sessionActive||$('ppicMain').hidden)return;
   const model=buildModel(payload);
   if(model.sourcePolicyPeriod&&model.sourcePolicyPeriod!==period)throw Error('Periode kebijakan sumber sinkron tidak cocok.');
   sourcePolicies.set(period,{ready:model.sourcePolicyComplete,ignoredDocumentIds:model.excludedDocumentIds});
   render(model);win.ppicAutoImportPolicyChanged?.();
  };
  win.ppicAutoImportSourcePolicy=(period='2026-11')=>sourcePolicies.get(period)||{ready:false,ignoredDocumentIds:[]};
  win.ppicAutoImportStatusLoading=(period='2026-11')=>{if(sessionActive)sourcePolicies.set(period,{ready:false,ignoredDocumentIds:sourcePolicies.get(period)?.ignoredDocumentIds||[]});};
  win.ppicClearAutoImportStatus=reset;
  win.ppicAutoImportSessionReady=()=>{sessionActive=true;$('autoImportRefresh').disabled=false;if(!lastModel)set('autoImportState','Memuat status sinkron…');schedule();};
  win.ppicAutoImportStatusError=(message,{period=$('autoImportPeriod').value,allowLegacy=false}={})=>{
   if(!sessionActive||$('ppicMain').hidden)return;
   sourcePolicies.set(period,{ready:allowLegacy,ignoredDocumentIds:sourcePolicies.get(period)?.ignoredDocumentIds||[]});
   set('autoImportState','Status sinkron belum dapat diperbarui');$('autoImportState').dataset.tone='warning';set('autoImportError',text(message,500)+(lastModel?' Daftar terakhir tetap ditampilkan.':''));
   if(allowLegacy)win.ppicAutoImportPolicyChanged?.();
  };
  win.ppicRefreshAutoImportStatus=refresh;
  $('autoImportRefresh').addEventListener('click',refresh);
  $('autoImportPeriod').addEventListener('change',()=>{generation++;loading=false;lastModel=null;$('autoImportJobs').replaceChildren();$('autoImportEmpty').hidden=false;set('autoImportCount','');set('autoImportImported','—');set('autoImportWaiting','—');set('autoImportAttention','—');refresh();});
  doc.addEventListener('visibilitychange',()=>{if(sessionActive&&!doc.hidden){refresh();schedule();}});
  reset();
 }
 return {buildModel,dateOnly,timestamp,mount};
});
