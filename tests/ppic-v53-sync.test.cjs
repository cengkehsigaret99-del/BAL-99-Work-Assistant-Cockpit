const {test}=require('node:test');
const assert=require('node:assert/strict');
const sync=require('../sync-ui.js');
const config={enabled:true,cadence:'HOURLY',timezone:'Asia/Jakarta',automation_id:'SYNTHETIC_AUTOMATION',last_check_at:'2026-11-20T13:00:00Z',last_success_at:'2026-11-20T12:30:00Z'};
const job=(status,report_status='ARCHIVE_ONLY',extra={})=>({id:'TEST_'+status,filename:'SYNTHETIC_SOURCE_V001.xlsx',division:'GILING',period:'2026-11',version:'V001',cutoff:'2026-11-18',status,report_status,...extra});
const model=(jobs=[],overrides={})=>sync.buildModel({ok:true,config:{...config,...overrides},jobs});
test('automation must have a verified hourly schedule and identity before UI calls it active',()=>{
 assert.equal(model().enabled,true);
 for(const override of [{enabled:false},{enabled:'true'},{automation_id:null},{automation_id:''},{cadence:null},{timezone:'UTC'}])assert.equal(model([],override).enabled,false);
 assert.match(model([],{last_check_at:null}).stateLabel,/menunggu pemeriksaan pertama/);
});
test('archive success and report publication remain separate',()=>{
 const m=model([job('IMPORTED'),job('IMPORTED','REVIEW_REQUIRED'),job('IMPORTED','SUPERSEDED'),job('IMPORTED','PROCESSED')]);
 assert.deepEqual(m.jobs.map(j=>j.reportLabel),['Arsip sumber','Menunggu pemrosesan SDM','Referensi versi sebelumnya','Laporan diproses']);
 assert.ok(m.jobs.every(j=>j.statusLabel==='Arsip diterima'));
 assert.equal(m.counts.attention,0);assert.equal(m.counts.waiting,1);
});
test('failed, staged, and unknown records cannot claim report publication',()=>{
 const m=model([job('FAILED','PROCESSED'),job('QUEUED','PROCESSED'),job('MYSTERY','PROCESSED')]);
 assert.ok(m.jobs.every(j=>j.reportLabel==='Belum diproses menjadi laporan'));
 assert.equal(m.counts.imported,0);assert.equal(m.counts.waiting,1);assert.equal(m.counts.attention,2);
});
test('duplicate receipt is shown without counting a second import',()=>{
 const m=model([job('IMPORTED'),job('DUPLICATE'),job('STAGING'),job('PROCESSING')]);
 assert.deepEqual(m.counts,{imported:1,duplicate:1,waiting:2,attention:0});
 assert.equal(m.jobs[1].statusLabel,'Sudah tercatat');
});
test('source cutoffs retain the stated calendar day; bad dates stay unavailable',()=>{
 const m=model([job('IMPORTED','ARCHIVE_ONLY',{cutoff:'2026-11-18'}),job('IMPORTED','ARCHIVE_ONLY',{cutoff:'2026-11-19'}),job('IMPORTED','ARCHIVE_ONLY',{cutoff:'2026-11-20'})]);
 assert.deepEqual(m.jobs.map(j=>j.cutoff),['18 Nov 2026','19 Nov 2026','20 Nov 2026']);
 for(const value of ['2026-02-30','2026-13-01','',null])assert.equal(sync.dateOnly(value),'Belum tersedia');
 assert.match(m.lastCheck,/20\.00.*WIB/);
});
test('only a successful verified payload can replace displayed receipt data',()=>{
 for(const p of [null,{},[],{ok:false,config,jobs:[]},{ok:true,jobs:[]},{ok:true,config,jobs:null}])assert.throws(()=>sync.buildModel(p));
});
test('unsafe or unbounded source text remains bounded plain text',()=>{
 const m=model([job('IMPORTED','ARCHIVE_ONLY',{filename:'<img src=x onerror=alert(1)>',message:'x'.repeat(3000),document_id:'TEST_DOCUMENT'})]);
 assert.equal(m.jobs[0].filename,'<img src=x onerror=alert(1)>');assert.equal(m.jobs[0].message.length,700);assert.equal(m.jobs[0].documentId,'TEST_DOCUMENT');
 assert.equal(model(Array.from({length:250},()=>job('IMPORTED'))).jobs.length,200);
});

// Run the actual SDM source selector with the status panel lifecycle. A synthetic
// button records rebuild intent; snapshots and source names contain no real data.
function sourceEnvironment(){
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
 const elements=new Map();
 const element=()=>({hidden:false,disabled:false,value:'',textContent:'',dataset:{},children:[],handlers:{},replaceChildren(...items){this.children=items;},append(...items){this.children.push(...items);},addEventListener(name,fn){this.handlers[name]=fn;}});
 const el=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
 el('autoImportPeriod').value='2026-11';
 const doc={hidden:false,getElementById:el,createElement:element,addEventListener(){}};
 const win={document:doc,setTimeout(){return 1;},clearTimeout(){},ppicRebuildSDM(){}};
 sync.mount(win);win.ppicAutoImportSessionReady();
 let builds=0;el('sdmBuild').click=()=>{builds++;};
 const old=['CURRENT_GILING_20','CURRENT_PACKING_20'];
 const docs=[{document_id:old[0],division:'SDM GILING',period:'2026-11',ingested_at:'2026-11-20T01:00:00Z'},{document_id:old[1],division:'SDM VERPACK',period:'2026-11',ingested_at:'2026-11-20T01:00:00Z'}];
 const context={window:win,privateDocs:docs,sdmSnapshotReady:true,sdmData:{w:[],meta:{documentIds:old}},sdmSnapshots:[{period:'2026-11',source_document_ids:old}],sdmHasLegacyNames:()=>false,sdmAutoAttempted:false,sdmAutoKey:'',sdmEl:el,ppicLatest:()=>0,queueMicrotask:fn=>fn()};
 vm.createContext(context);
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const start=html.indexOf('function sdmEligibleDocs(){'),end=html.indexOf('async function sdmDecode(s){',start);
 assert.ok(start>0&&end>start);vm.runInContext(html.slice(start,end),context);
 return {win,el,context,builds:()=>builds,run:()=>vm.runInContext('sdmMaybeAutoBuild()',context),ids:()=>Array.from(vm.runInContext('sdmLatestSourceIds()',context))};
}
test('delayed status preserves the current SDM snapshot and imported archives cannot trigger a rebuild',()=>{
 const e=sourceEnvironment();
 const additions=[['ARCHIVE_GILING','GILING','ARCHIVE_ONLY'],['ARCHIVE_VERPACK','VERPACK','ARCHIVE_ONLY'],['OLD_PACKING_19','SDM VERPACK','SUPERSEDED']];
 e.context.privateDocs.push(...additions.map(([document_id,division])=>({document_id,division,period:'2026-11',ingested_at:'2026-11-20T13:00:00Z'})));
 e.run();assert.equal(e.builds(),0);assert.ok(e.context.sdmData);
 e.win.ppicSetAutoImportStatus({ok:true,config,jobs:additions.map(([document_id,division,report_status])=>job('IMPORTED',report_status,{document_id,division}))});
 assert.equal(e.builds(),0);assert.deepEqual(e.ids(),['CURRENT_GILING_20','CURRENT_PACKING_20']);
 assert.equal(e.win.ppicAutoImportSourcePolicy('2026-11').ready,true);
});
test('a new manual legacy source still triggers one rebuild after status is ready',()=>{
 const e=sourceEnvironment();
 e.context.privateDocs.push({document_id:'NEW_MANUAL_GILING',division:'GILING',period:'2026-11',ingested_at:'2026-11-20T13:00:00Z'});
 e.win.ppicSetAutoImportStatus({ok:true,config:{...config,enabled:false},jobs:[]});
 assert.equal(e.builds(),1);e.run();assert.equal(e.builds(),1);
});
test('status refresh defers auto-build on failure and 404 keeps established archive exclusions',()=>{
 const e=sourceEnvironment();
 e.context.privateDocs.push({document_id:'ARCHIVE_GILING',division:'GILING',period:'2026-11',ingested_at:'2026-11-20T12:00:00Z'});
 e.win.ppicSetAutoImportStatus({ok:true,config,jobs:[job('IMPORTED','ARCHIVE_ONLY',{document_id:'ARCHIVE_GILING'})]});
 e.win.ppicAutoImportStatusLoading('2026-11');
 e.context.privateDocs.push({document_id:'NEW_MANUAL_PACKING',division:'SDM VERPACK',period:'2026-11',ingested_at:'2026-11-20T13:00:00Z'});
 e.run();assert.equal(e.builds(),0);
 e.win.ppicAutoImportStatusError('Temporary',{period:'2026-11'});e.run();assert.equal(e.builds(),0);
 e.win.ppicAutoImportStatusError('Unconfigured',{period:'2026-11',allowLegacy:true});assert.equal(e.builds(),1);
 assert.deepEqual(e.win.ppicAutoImportSourcePolicy('2026-11').ignoredDocumentIds,['ARCHIVE_GILING']);
});
test('logout clears private receipts and source policy, and late responses cannot restore them',()=>{
 const e=sourceEnvironment();
 const payload={ok:true,config,jobs:[job('DUPLICATE','ARCHIVE_ONLY',{document_id:'PRIVATE_TEST_ID'})]};
 e.win.ppicSetAutoImportStatus(payload,'2026-11');assert.equal(e.el('autoImportJobs').children.length,1);
 assert.equal(e.win.ppicAutoImportSourcePolicy('2026-12').ready,false);
 e.win.ppicClearAutoImportStatus();assert.equal(e.el('autoImportJobs').children.length,0);
 e.win.ppicSetAutoImportStatus(payload,'2026-11');assert.equal(e.el('autoImportJobs').children.length,0);
 assert.equal(e.win.ppicAutoImportSourcePolicy('2026-11').ready,false);assert.equal(e.win.ppicAutoImportSourcePolicy('2026-11').ignoredDocumentIds.length,0);
});
test('complete source policy protects catalog documents outside the visible job page',()=>{
 const e=sourceEnvironment();
 e.context.privateDocs.push({document_id:'OLDER_ARCHIVE_OUTSIDE_80_JOBS',division:'GILING',period:'2026-11',ingested_at:'2026-11-20T12:00:00Z'});
 e.win.ppicSetAutoImportStatus({ok:true,config,jobs:[],source_policy:{period:'2026-11',complete:true,excluded_document_ids:['OLDER_ARCHIVE_OUTSIDE_80_JOBS']}});
 assert.equal(e.builds(),0);assert.deepEqual(e.ids(),['CURRENT_GILING_20','CURRENT_PACKING_20']);
});
test('eligible imported SDM awaits existing automatic processing without introducing an approval gate',()=>{
 const e=sourceEnvironment();
 e.context.privateDocs.push({document_id:'ELIGIBLE_SDM_GILING',division:'SDM GILING',period:'2026-11',ingested_at:'2026-11-20T13:00:00Z'});
 e.win.ppicSetAutoImportStatus({ok:true,config,jobs:[job('IMPORTED','REVIEW_REQUIRED',{document_id:'ELIGIBLE_SDM_GILING',division:'SDM GILING'})],source_policy:{period:'2026-11',complete:true,excluded_document_ids:[]}});
 assert.equal(e.builds(),1);assert.deepEqual(e.win.ppicAutoImportSourcePolicy('2026-11').ignoredDocumentIds,[]);
 assert.equal(e.el('autoImportWaiting').textContent,'1');assert.equal(e.el('autoImportAttention').textContent,'0');
});
test('incomplete or mismatched source policy cannot enable automatic processing',()=>{
 const e=sourceEnvironment();
 e.context.privateDocs.push({document_id:'UNCONFIRMED_SOURCE',division:'GILING',period:'2026-11',ingested_at:'2026-11-20T13:00:00Z'});
 e.win.ppicSetAutoImportStatus({ok:true,config,jobs:[],source_policy:{period:'2026-11',complete:false,excluded_document_ids:[]}});
 assert.equal(e.builds(),0);assert.equal(e.win.ppicAutoImportSourcePolicy('2026-11').ready,false);
 assert.throws(()=>e.win.ppicSetAutoImportStatus({ok:true,config,jobs:[],source_policy:{period:'2026-12',complete:true,excluded_document_ids:[]}},'2026-11'),/Periode/);
 assert.equal(e.builds(),0);
 assert.throws(()=>sync.buildModel({ok:true,config,jobs:[],source_policy:{complete:true,excluded_document_ids:[null]}}),/Kebijakan/);
});
