"use strict";
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root&&root.document){root.PPICRobot=api;api.mount(root);}
})(typeof window==='object'?window:null,function(){
 const OPERATING={PERLU_PERHATIAN:'Perlu perhatian',TERKENDALI:'Terkendali',DATA_BELUM_CUKUP:'Data belum cukup'};
 const HEALTH={HEALTHY:'Pemeriksaan berhasil',WAITING:'Menunggu pemeriksaan',STALE:'Pemeriksaan terlambat',ERROR:'Ada kegagalan',DISABLED:'Jadwal tidak aktif'};
 const QUALITY={SOURCE:'Angka sumber',ESTIMATE:'Estimasi',REFERENCE:'Referensi',MISSING:'Belum tersedia'};
 const SELECTED={READY:'Fakta tersedia',MISSING_FACTS:'Fakta belum dibaca',NO_SOURCE:'Sumber belum tersedia',SUPERSEDED:'Sumber digantikan'};
 const KIND={OWNER_DECISION:'Pertimbangan Owner',ADMIN_FOLLOWUP:'Tindak lanjut divisi',DATA_BLOCKER:'Data perlu dilengkapi'};
 const RUN_KIND={CHECK:'Pemeriksaan data',ANALYSIS:'Analisis GPT',MAINTENANCE:'Pemeliharaan sistem'};
 const RUN_STATUS={RUNNING:'Sedang berjalan',SUCCESS:'Berhasil',NO_CHANGE:'Tidak ada perubahan',WAITING:'Menunggu',FAILED:'Gagal',BLOCKED:'Tertahan'};
 const text=(value,max=1200)=>typeof value==='string'?value.slice(0,max):'';
 const list=(value,max=100)=>Array.isArray(value)?value.slice(0,max):[];
 const obj=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
 const periodValid=value=>typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value);
 function dateOnly(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?value:null;
 }
 function instant(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(value))return null;
  const stamp=Date.parse(value);return Number.isFinite(stamp)?stamp:null;
 }
 function formatDate(value){const v=dateOnly(value);return v?new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(v+'T00:00:00Z')):'Belum ada tanggal';}
 function formatTime(value){const v=instant(value);return v!==null?new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jakarta'}).format(new Date(v))+' WIB':'Belum tercatat';}
 function factValue(fact){
  if(fact.quality==='MISSING'||fact.value===null||fact.value===undefined)return 'Belum tersedia';
  const value=typeof fact.value==='number'&&Number.isFinite(fact.value)?new Intl.NumberFormat('id-ID',{maximumFractionDigits:6}).format(fact.value):text(fact.value,400);
  return value?value+(fact.unit?' '+fact.unit:''):'Belum tersedia';
 }
 function buildModel(payload,period,now=Date.now()){
  const data=obj(payload);
  if(data.ok!==true||!periodValid(period)||data.period!==period||!data.config||!data.health)throw Error('Status Robot Manajer tidak sesuai periode atau belum lengkap.');
  const config=obj(data.config),health=obj(data.health),rawBrief=data.latest_brief===null?null:obj(data.latest_brief);
  const sources=list(data.evidence_sources,100).map(raw=>{const source=obj(raw);return {
   document_id:text(source.document_id,240),division:text(source.division,100),version:text(source.version,40),cutoff:dateOnly(source.cutoff),status:text(source.status,100),
   facts:list(source.facts,500).map(rawFact=>{const f=obj(rawFact);return {key:text(f.key,200),label:text(f.label,300),value:typeof f.value==='number'&&Number.isFinite(f.value)?f.value:typeof f.value==='string'?text(f.value,400):null,unit:text(f.unit,60),scope:text(f.scope,300),source_sheet:text(f.source_sheet,160),source_range:text(f.source_range,160),quality:QUALITY[f.quality]?f.quality:'MISSING',note:text(f.note,1000)};})
  };});
  const sourceMap=new Map(sources.filter(s=>s.document_id).map(s=>[s.document_id,s]));
  const references=value=>list(value,10).map(raw=>{const ref=obj(raw),id=text(ref.document_id,240),source=sourceMap.get(id);return {document_id:id,source:source||null,facts:list(ref.fact_keys,25).map(key=>{key=text(key,200);return {key,fact:source?.facts.find(f=>f.key===key)||null};})};});
  let brief=null;
  if(rawBrief&&Object.keys(rawBrief).length){
   const p=obj(rawBrief.payload);
   if(rawBrief.period!==period||p.schema_version!=='ppic-robot-brief-v1'||!dateOnly(rawBrief.as_of)||p.as_of!==rawBrief.as_of)throw Error('Ringkasan Robot Manajer tidak cocok dengan periode atau kontrak analisis.');
   const decisions=list(p.decisions,10).map((raw,index)=>{const d=obj(raw);if(d.action_state!=='USULAN')throw Error('Status arahan Robot Manajer tidak dapat diverifikasi.');return {
    id:text(d.id,100)||'decision-'+index,priority:['P1','P2','P3'].includes(d.priority)?d.priority:'P3',title:text(d.title,300),recommendation:text(d.recommendation,1600),reason:text(d.reason,1600),consequence:text(d.consequence,1200),kind:KIND[d.kind]?d.kind:'DATA_BLOCKER',owner_role:text(d.owner_role,160),evidence:references(d.evidence),confidence:['TINGGI','SEDANG','RENDAH'].includes(d.confidence)?d.confidence:'RENDAH',data_limit:text(d.data_limit,1400),action_state:'USULAN',index
   };}).sort((a,b)=>a.priority.localeCompare(b.priority)||a.index-b.index);
   brief={id:text(rawBrief.id,120),as_of:rawBrief.as_of,created_at:text(rawBrief.created_at,80),headline:text(p.headline,300),summary:text(p.summary,2000),operating_status:OPERATING[p.operating_status]?p.operating_status:'DATA_BELUM_CUKUP',decisions,
    work_completed:list(p.work_completed,20).map(x=>({title:text(obj(x).title,300),detail:text(obj(x).detail,1400),evidence:references(obj(x).evidence)})),
    pending_data:list(p.pending_data,20).map(x=>({division:text(obj(x).division,100),item:text(obj(x).item,400),why_needed:text(obj(x).why_needed,1400),owner_role:text(obj(x).owner_role,160),evidence:references(obj(x).evidence)})),
    watchlist:list(p.watchlist,20).map(x=>({division:text(obj(x).division,100),status:OPERATING[obj(x).status]?obj(x).status:'DATA_BELUM_CUKUP',summary:text(obj(x).summary,1600),evidence:references(obj(x).evidence)})),
    limitations:list(p.limitations,20).map(x=>text(x,1800)).filter(Boolean)};
  }
  const created=brief?instant(brief.created_at):null;
  const sourceChanged=health.source_changed_since_brief===true;
  const oldAnalysis=created!==null&&now-created>26*60*60*1000;
  const futureAnalysis=created!==null&&created-now>5*60*1000;
  const state=HEALTH[health.state]?health.state:'WAITING';
  return {period,config:{enabled:config.enabled===true,linked:!!text(config.automation_id,200),cadence:text(config.cadence,80),timezone:text(config.timezone,80),last_check_at:text(config.last_check_at,80),last_success_at:text(config.last_success_at,80),last_message:text(config.last_message,1600),last_error:text(config.last_error,1600)},health:{state,message:text(health.message,1600),source_changed:sourceChanged,has_unextracted:health.has_unextracted_sources===true},brief,sources,
   freshness:!brief?'EMPTY':sourceChanged?'SOURCE_CHANGED':futureAnalysis||created===null?'UNKNOWN':oldAnalysis?'OLD':'CURRENT',
   coverage:list(data.coverage,30).map(x=>{const c=obj(x);return {division:text(c.division,100),source_document_id:text(c.source_document_id,240),source_version:text(c.source_version,40),source_cutoff:dateOnly(c.source_cutoff),reconciliation_status:text(c.reconciliation_status,100),has_facts:c.has_facts===true,selection_status:SELECTED[c.selection_status]?c.selection_status:'NO_SOURCE',report_cutoff:dateOnly(c.report_cutoff),report_version:text(c.report_version,40),report_status:text(c.report_status,100)};}),
   runs:list(data.runs,20).map(x=>{const r=obj(x);return {kind:text(r.kind,100),status:text(r.status,100),message:text(r.message,1600),details:{check_name:text(obj(r.details).check_name,240).trim()},created_at:text(r.created_at,80)};}).sort((a,b)=>(instant(b.created_at)||0)-(instant(a.created_at)||0))};
 }
 function mount(win){
  const doc=win.document,$=id=>doc.getElementById(id);
  if(!$('robotPanel'))return;
  let active=false,generation=0,timer=null,loading=false,model=null;
  const sdmConflicts=new Map();
  const selected=()=>$('robotPeriod').value;
  const make=(tag,content,className)=>{const node=doc.createElement(tag);if(content!==undefined)node.textContent=content;if(className)node.className=className;return node;};
  const set=(id,value)=>{$(id).textContent=value;};
  const badge=(label,tone)=>{const node=make('span',label,'robot-badge');node.dataset.tone=tone||'neutral';return node;};
  const muted=value=>make('p',value,'robot-muted');
  function labeled(label,value){const p=make('p',undefined,'robot-labeled');p.append(make('strong',label+' '),doc.createTextNode(value||'Belum dijelaskan.'));return p;}
  function evidenceNode(refs){
   const details=make('details',undefined,'robot-evidence');details.append(make('summary','Lihat dasar & sumber'));
   if(!refs.length){details.append(muted('Rujukan sumber belum tersedia.'));return details;}
   for(const ref of refs){
    const block=make('div',undefined,'robot-evidence-source');const source=ref.source;
    block.append(make('strong',source?source.division+' · '+(source.version||'Versi belum tercatat'):'Sumber belum tersedia'));
    block.append(muted('Cut-off tercatat '+(source?.cutoff?formatDate(source.cutoff):'belum diketahui')+(source?.status?' · '+source.status:'')));
    block.append(make('p',ref.document_id||'Identitas sumber belum tersedia','robot-document-id'));
    if(ref.document_id){const link=make('button','Lihat di Bank Data','robot-text-button');link.type='button';link.addEventListener('click',()=>win.ppicRobotOpenSource?.(ref.document_id));block.append(link);}
    for(const item of ref.facts){
     const f=item.fact,row=make('div',undefined,'robot-fact');
     if(!f){row.append(muted('Fakta rujukan belum tersedia: '+item.key));}
     else{row.append(make('strong',f.label||f.key),make('p',factValue(f),'robot-fact-value'));row.append(muted([QUALITY[f.quality],f.scope].filter(Boolean).join(' · ')));row.append(muted(f.source_sheet?'Sel sumber: '+f.source_sheet+(f.source_range?' · '+f.source_range:' · rentang belum tercatat'):'Lokasi sel belum tercatat.'));if(f.note)row.append(muted(f.note));}
     block.append(row);
    }
    details.append(block);
   }
   return details;
  }
  function decisionCard(d,index){
   const article=make('article',undefined,'robot-decision');article.dataset.priority=d.priority;
   const top=make('div',undefined,'robot-decision-top');top.append(badge(d.priority,d.priority==='P1'?'alert':'gold'),make('span',KIND[d.kind],'robot-muted'));article.append(top);
   article.append(make('h4',(index+1)+'. '+d.title),make('p',d.recommendation,'robot-recommendation'));
   const footer=make('div',undefined,'robot-decision-footer');footer.append(make('span','Usulan · '+(d.owner_role||'Penanggung jawab belum ditentukan')),make('span','Keyakinan '+d.confidence.toLowerCase()));article.append(footer);
   const explain=make('details',undefined,'robot-explanation');explain.append(make('summary','Alasan & dampak'),labeled('Alasan:',d.reason),labeled('Dampak:',d.consequence),labeled('Batas data:',d.data_limit));article.append(explain,evidenceNode(d.evidence));return article;
  }
  function renderBrief(m){
   const b=m.brief;const available=!!b;$('robotBriefContent').hidden=!available;$('robotEmpty').hidden=available;
   set('robotOperatingStatus',available?OPERATING[b.operating_status]:'Menunggu analisis');$('robotOperatingStatus').dataset.tone=available&&b.operating_status==='TERKENDALI'?'good':available?'gold':'neutral';
   set('robotAnalysisTime',available?'Analisis GPT · '+formatTime(b.created_at):'Analisis GPT belum tersedia.');
   if(!available){set('robotEmptyText','Belum ada analisis tersimpan untuk periode ini. Laporan divisi tetap dapat dibuka; status sumber ada di bawah.');return;}
   set('robotHeadline',b.headline||'Ringkasan operasional');set('robotSummary',b.summary);
   const freshness={SOURCE_CHANGED:'Ada sumber yang berubah setelah analisis ini. Tunggu analisis baru sebelum memakai usulannya.',OLD:'Analisis terakhir lebih dari 26 jam lalu. Periksa kembali keadaan pabrik sebelum menggunakan usulannya.',UNKNOWN:'Waktu analisis belum dapat diverifikasi. Periksa status pekerjaan sebelum menggunakan usulannya.',CURRENT:'Tanggal acuan ringkasan: '+formatDate(b.as_of)+'. Tanggal setiap divisi dapat berbeda.'};
   set('robotFreshness',freshness[m.freshness]||'');$('robotFreshness').dataset.tone=m.freshness==='CURRENT'?'neutral':'alert';
   set('robotDecisionCount',b.decisions.length+' usulan');$('robotTopDecisions').replaceChildren();$('robotOtherDecisions').replaceChildren();
   if(!b.decisions.length)$('robotTopDecisions').append(muted('Tidak ada usulan tercatat dalam analisis ini.'));
   b.decisions.forEach((d,i)=>(i<3?$('robotTopDecisions'):$('robotOtherDecisions')).append(decisionCard(d,i)));
   $('robotMoreDecisions').hidden=b.decisions.length<=3;set('robotMoreDecisionsTitle','Lihat '+Math.max(0,b.decisions.length-3)+' prioritas lainnya');
   $('robotCompleted').replaceChildren();
   if(!b.work_completed.length)$('robotCompleted').append(muted('Belum ada pekerjaan selesai yang dilaporkan.'));
   for(const row of b.work_completed){const card=make('article',undefined,'robot-list-item');card.append(make('h4',row.title),make('p',row.detail),evidenceNode(row.evidence));$('robotCompleted').append(card);}
   $('robotPending').replaceChildren();
   if(!b.pending_data.length)$('robotPending').append(muted('Tidak ada permintaan data tercatat dalam analisis ini.'));
   for(const row of b.pending_data){const card=make('article',undefined,'robot-list-item');card.append(make('h4',row.division+' · '+row.item),make('p',row.why_needed),muted('Penanggung jawab yang diusulkan: '+(row.owner_role||'Belum ditentukan')),evidenceNode(row.evidence));$('robotPending').append(card);}
   $('robotWatchlist').replaceChildren();
   if(!b.watchlist.length)$('robotWatchlist').append(muted('Pantauan divisi belum tersedia.'));
   for(const row of b.watchlist){const card=make('article',undefined,'robot-list-item');card.append(make('h4',row.division),badge(OPERATING[row.status],row.status==='TERKENDALI'?'good':'gold'),make('p',row.summary),evidenceNode(row.evidence));$('robotWatchlist').append(card);}
   $('robotLimitations').replaceChildren(...b.limitations.map(value=>make('li',value)));$('robotLimitsDetails').hidden=!b.limitations.length;
  }
  function renderCoverage(m){
   const container=$('robotCoverage');container.replaceChildren();
   if(!m.coverage.length){container.append(muted('Cakupan sumber belum tersedia.'));return;}
   for(const row of m.coverage){const card=make('article',undefined,'robot-coverage-card');card.append(make('h4',row.division||'Divisi belum tercatat'));
    card.append(labeled('Sumber tercatat:',row.source_cutoff?formatDate(row.source_cutoff)+(row.source_version?' · '+row.source_version:''):'Belum tersedia'));
    card.append(labeled('Laporan:',row.report_cutoff?formatDate(row.report_cutoff)+(row.report_version?' · '+row.report_version:''):'Belum tersedia'));
    card.append(badge(SELECTED[row.selection_status],row.selection_status==='READY'?'good':'gold'));
    if(row.reconciliation_status)card.append(muted(row.reconciliation_status));
    if(row.report_status&&row.report_status!==row.reconciliation_status)card.append(muted('Status laporan: '+row.report_status));
    container.append(card);
   }
  }
  function renderSDMWarning(){
   const box=$('sdmRobotSourceWarning');if(!box)return;box.replaceChildren();
   const start=dateOnly($('sdmStart')?.value),end=dateOnly($('sdmEnd')?.value);
   const rows=active?[...sdmConflicts.entries()].filter(([period])=>start&&end?period>=start.slice(0,7)&&period<=end.slice(0,7):period===selected()).flatMap(([period,items])=>items.map(row=>({...row,period}))):[];
   box.hidden=!rows.length;if(!rows.length)return;
   box.append(make('strong','Konflik tanggal sumber SDM'),make('p','Tanggal pada sumber dan laporan perlu diperbaiki. Rincian hasil per hari memerlukan sumber dengan tanggal yang benar; angka ini belum dapat digunakan untuk payroll final.'));
   const details=make('ul');
   for(const row of rows)details.append(make('li',row.division+' · periode '+row.period+' · sumber tercatat '+formatDate(row.source_cutoff)+' · laporan '+formatDate(row.report_cutoff)+' · METADATA_CONFLICT'));
   box.append(details);
  }
  function renderHealth(m){
   set('robotHealthBadge',HEALTH[m.health.state]);$('robotHealthBadge').dataset.tone=m.health.state==='HEALTHY'?'good':['ERROR','STALE'].includes(m.health.state)?'alert':'neutral';
   const box=$('robotHealth');box.replaceChildren();
   const scheduled=m.config.enabled&&m.config.linked;
   box.append(labeled('Jadwal:',scheduled?(m.config.cadence==='HOURLY'?'Setiap jam':m.config.cadence||'Terdaftar')+' · '+(m.config.timezone||'Zona waktu belum tercatat'):m.config.enabled?'Belum terhubung ke pekerjaan otomatis':'Tidak aktif'));
   box.append(labeled('Pemeriksaan robot terakhir:',formatTime(m.config.last_check_at)),labeled('Siklus berhasil terakhir:',formatTime(m.config.last_success_at)));
   if(m.health.message)box.append(make('p',m.health.message));
   if(m.config.last_message)box.append(labeled('Hasil pemeriksaan:',m.config.last_message));
   if(m.config.last_error)box.append(labeled('Kegagalan terakhir:',m.config.last_error));
   if(m.health.has_unextracted)box.append(muted('Sebagian sumber belum memiliki fakta yang dapat dianalisis.'));
   const maintenance=m.runs.find(r=>r.kind==='MAINTENANCE'&&r.details.check_name);
   box.append(labeled('Pemeriksaan web terakhir:',maintenance?formatTime(maintenance.created_at)+' · '+(RUN_STATUS[maintenance.status]||maintenance.status):'Belum ada bukti pemeriksaan yang tercatat.'));
   if(maintenance?.message)box.append(make('p',maintenance.message));
   const runs=$('robotRuns');runs.replaceChildren();
   if(!m.runs.length)runs.append(muted('Belum ada aktivitas tercatat.'));
   for(const row of m.runs.slice(0,6)){const card=make('article',undefined,'robot-run');card.append(make('strong',(RUN_KIND[row.kind]||row.kind)+' · '+(RUN_STATUS[row.status]||row.status)),muted(formatTime(row.created_at)),make('p',row.message));runs.append(card);}
  }
  function stopTimer(){if(timer!==null)win.clearTimeout(timer);timer=null;}
  function schedule(){stopTimer();if(active)timer=win.setTimeout(()=>{if(doc.hidden)schedule();else refresh();},60000);}
  function setBusy(value){loading=value;$('robotRefresh').disabled=!active||loading;$('robotPanel').setAttribute('aria-busy',String(value));}
  function clearPrivate(){
   model=null;$('robotBriefContent').hidden=true;$('robotEmpty').hidden=false;
   for(const id of ['robotHeadline','robotSummary','robotFreshness','robotDecisionCount','robotTopDecisions','robotOtherDecisions','robotCompleted','robotPending','robotWatchlist','robotLimitations','robotHealth','robotRuns'])$(id).replaceChildren();
   $('robotCoverage').replaceChildren(muted('Belum diperiksa.'));$('robotMoreDecisions').hidden=true;
   for(const id of ['robotMoreDecisions','robotWatchlistDetails','robotLimitsDetails','robotHealthPanel'])$(id).open=false;
   set('robotOperatingStatus','Menunggu data');$('robotOperatingStatus').dataset.tone='neutral';set('robotAnalysisTime','Analisis GPT belum dimuat.');set('robotHealthBadge','Belum diperiksa');$('robotHealthBadge').dataset.tone='neutral';
   set('robotEmptyText','Status analisis akan tampil setelah koneksi privat diperiksa.');
  }
  function onLoading(period){if(!active||period!==selected())return;setBusy(true);set('robotStatus','Memeriksa analisis dan status pekerjaan…');$('robotStatus').dataset.tone='neutral';}
  function onData(data,period){
   if(!active||period!==selected())return;
   const next=buildModel(data,period);model=next;renderBrief(next);renderCoverage(next);renderHealth(next);
   sdmConflicts.set(period,next.coverage.filter(row=>['SDM GILING','SDM VERPACK'].includes(row.division)&&row.report_status.includes('METADATA_CONFLICT')));renderSDMWarning();
   set('robotStatus',next.brief?'Ringkasan tersimpan sudah dimuat. Muat ulang tidak menjalankan analisis baru.':'Status diperiksa. Analisis periode ini belum tersedia.');$('robotStatus').dataset.tone='neutral';setBusy(false);schedule();
  }
  function onError(message,options={}){
   if(!active||options.period&&options.period!==selected())return;
   set('robotStatus',(options.unconfigured?'Layanan Robot Manajer belum tersedia. ': 'Status terbaru gagal diperiksa. ')+text(message,1000)+(model?.brief?' Ringkasan sebelumnya tetap ditampilkan; perhatikan waktu analisis.':' Laporan divisi tetap dapat dibuka.'));
   $('robotStatus').dataset.tone='alert';set('robotHealthBadge',options.unconfigured?'Belum tersedia':'Pemeriksaan gagal');$('robotHealthBadge').dataset.tone='alert';
   if(!model)set('robotEmptyText','Analisis belum dapat dibaca. Anda tetap dapat membuka Bank Data dan laporan divisi.');setBusy(false);schedule();
  }
  async function refresh(){
   if(!active||loading)return;const current=generation,period=selected();
   if(!periodValid(period)){onError('Pilih periode yang valid.',{period});return;}
   onLoading(period);
   try{await win.ppicLoadRobotStatus(period);}catch(error){if(current===generation&&active&&period===selected()&&error?.name!=='AbortError'&&loading)onError(error?.message||'Koneksi belum tersedia.',{period});}
  }
  win.ppicRobotStatusLoading=onLoading;win.ppicSetRobotStatus=onData;win.ppicRobotStatusError=onError;
  win.ppicRefreshSDMRobotWarning=renderSDMWarning;
  win.ppicClearRobotStatus=()=>{active=false;generation++;stopTimer();clearPrivate();sdmConflicts.clear();renderSDMWarning();setBusy(false);set('robotStatus','Masuk sebagai Owner untuk membaca analisis.');$('robotStatus').dataset.tone='neutral';};
  win.ppicRobotSessionReady=()=>{active=true;generation++;setBusy(false);schedule();};
  $('robotRefresh').addEventListener('click',refresh);
  $('robotPeriod').addEventListener('change',()=>{generation++;stopTimer();clearPrivate();setBusy(false);if(active)refresh();});
  doc.addEventListener('visibilitychange',()=>{if(!doc.hidden&&active&&!loading)refresh();});
  win.ppicClearRobotStatus();
 }
 return {buildModel,mount,formatDate,formatTime,factValue,periodValid};
});
