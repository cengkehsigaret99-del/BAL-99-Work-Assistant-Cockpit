const {test}=require('node:test');
const assert=require('node:assert/strict');
const robot=require('../robot-ui.js');
const {status}=require('./fixtures/robot-synthetic.cjs');
const NOW=Date.parse('2026-11-20T03:00:00Z');
const model=p=>robot.buildModel(p,'2026-11',NOW);

test('period contract rejects mismatched, missing and non-proposal payloads',()=>{
 for(const p of [null,{},[],{...status(),period:'2026-12'},{...status(),config:null}])assert.throws(()=>model(p));
 const p=status();p.latest_brief.period='2026-12';assert.throws(()=>model(p));
 const q=status();q.latest_brief.payload.decisions[0].action_state='EXECUTED';assert.throws(()=>model(q),/arahan/);
 const r=status();r.latest_brief.payload.as_of='2026-11-18';assert.throws(()=>model(r),/kontrak/);
});
test('analysis freshness uses actual analysis timestamp and changed evidence',()=>{
 assert.equal(model(status()).freshness,'CURRENT');
 const p=status();p.latest_brief.created_at='2026-11-18T01:00:00Z';assert.equal(model(p).freshness,'OLD');
 p.health.source_changed_since_brief=true;assert.equal(model(p).freshness,'SOURCE_CHANGED');
 p.health.source_changed_since_brief=false;p.latest_brief.created_at='invalid';assert.equal(model(p).freshness,'UNKNOWN');
 p.latest_brief.created_at='2026-11-21T01:00:00Z';assert.equal(model(p).freshness,'UNKNOWN');
 p.latest_brief=null;assert.equal(model(p).freshness,'EMPTY');
});
test('evidence resolves source dates and cell provenance without borrowing report dates',()=>{
 const m=model(status()),ref=m.brief.decisions[0].evidence[0];
 assert.equal(ref.source.cutoff,'2026-11-19');assert.equal(ref.facts[0].fact.source_sheet,'DATA_UJI');assert.equal(ref.facts[0].fact.source_range,'B7');
 assert.equal(m.coverage[0].source_cutoff,'2026-11-19');assert.equal(m.coverage[0].report_cutoff,'2026-11-18');assert.equal(robot.factValue(ref.facts[0].fact),'12 karton');
 const p=status();p.latest_brief.payload.decisions[0].evidence[0]={document_id:'SYNTHETIC_MISSING',fact_keys:['unknown']};
 const absent=model(p).brief.decisions[0].evidence[0];assert.equal(absent.source,null);assert.equal(absent.facts[0].fact,null);
});
test('missing facts remain unknown, zero remains zero, and invalid dates are not normalized',()=>{
 assert.equal(robot.factValue({value:0,quality:'SOURCE',unit:'karton'}),'0 karton');
 assert.equal(robot.factValue({value:0,quality:'MISSING',unit:'karton'}),'Belum tersedia');
 assert.equal(robot.factValue({value:null,quality:'SOURCE',unit:'karton'}),'Belum tersedia');
 assert.equal(robot.formatDate('2026-02-30'),'Belum ada tanggal');assert.equal(robot.formatTime('2026-11-19'),'Belum tercatat');
 assert.equal(robot.formatDate('2026-11-19'),'19 Nov 2026');assert.match(robot.formatTime('2026-11-20T02:00:00Z'),/09\.00 WIB/);
});
test('priority sorting is stable and text is bounded without interpreting HTML',()=>{
 const p=status();p.latest_brief.payload.decisions[0].priority='P3';p.latest_brief.payload.decisions[1].title='<img src=x onerror=alert(1)>';
 p.latest_brief.payload.decisions[1].reason='x'.repeat(3000);
 const m=model(p);assert.equal(m.brief.decisions[0].id,'SYNTHETIC_DECISION_1');assert.equal(m.brief.decisions[0].title,'<img src=x onerror=alert(1)>');assert.equal(m.brief.decisions[0].reason.length,1600);
 assert.equal(m.brief.decisions.length,5);assert.ok(m.brief.decisions.every(x=>x.action_state==='USULAN'));
});

function environment(){
 const elements=new Map();
 const element=(tag='div')=>({tagName:tag.toUpperCase(),hidden:false,open:false,disabled:false,value:'',dataset:{},children:[],handlers:{},attributes:{},_text:'',
  set textContent(x){this._text=String(x);this.children=[];},get textContent(){return this._text+this.children.map(c=>c.textContent||'').join('');},
  replaceChildren(...items){this._text='';this.children=items;},append(...items){this.children.push(...items);},addEventListener(name,fn){this.handlers[name]=fn;},setAttribute(name,value){this.attributes[name]=value;}});
 const el=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};el('robotPeriod').value='2026-11';
 const doc={hidden:false,getElementById:el,createElement:element,createTextNode(value){const e=element('#text');e.textContent=value;return e;},addEventListener(){}};
 const win={document:doc,setTimeout(){return 1;},clearTimeout(){},ppicLoadRobotStatus:async()=>{}};robot.mount(win);win.ppicRobotSessionReady();
 return {win,el};
}
test('first screen presents only top 3 proposals with remaining priorities expandable',()=>{
 const e=environment();e.win.ppicSetRobotStatus(status(),'2026-11');
 assert.equal(e.el('robotTopDecisions').children.length,3);assert.equal(e.el('robotOtherDecisions').children.length,2);assert.equal(e.el('robotMoreDecisions').hidden,false);assert.equal(e.el('robotMoreDecisions').open,false);
 assert.match(e.el('robotTopDecisions').textContent,/Usulan/);assert.match(e.el('robotTopDecisions').textContent,/Keyakinan sedang/);assert.match(e.el('robotTopDecisions').textContent,/DATA_UJI · B7/);
});
test('unconfigured schedule and absent maintenance do not claim automatic or repaired work',()=>{
 const e=environment(),p=status();p.config.automation_id=null;p.runs=[];e.win.ppicSetRobotStatus(p,'2026-11');
 assert.match(e.el('robotHealth').textContent,/Belum terhubung ke pekerjaan otomatis/);assert.match(e.el('robotHealth').textContent,/Belum ada bukti pemeriksaan/);
 assert.doesNotMatch(e.el('robotHealth').textContent,/24 jam|sudah diperbaiki|selalu aktif/i);
});
test('failed refresh retains previous brief with visible failure rather than claiming success',()=>{
 const e=environment();e.win.ppicSetRobotStatus(status(),'2026-11');e.win.ppicRobotStatusLoading('2026-11');e.win.ppicRobotStatusError('SYNTHETIC_FAILURE',{period:'2026-11'});
 assert.equal(e.el('robotTopDecisions').children.length,3);assert.match(e.el('robotStatus').textContent,/gagal diperiksa/);assert.match(e.el('robotStatus').textContent,/Ringkasan sebelumnya/);assert.equal(e.el('robotHealthBadge').textContent,'Pemeriksaan gagal');
});
test('logout and changed period clear private DOM and reject late old data',()=>{
 const e=environment();e.win.ppicSetRobotStatus(status(),'2026-11');e.win.ppicClearRobotStatus();
 for(const id of ['robotTopDecisions','robotOtherDecisions','robotCompleted','robotPending','robotWatchlist','robotHealth','robotRuns','robotDiscoveryChannels'])assert.equal(e.el(id).children.length,0);
 e.win.ppicSetRobotStatus(status(),'2026-11');assert.equal(e.el('robotTopDecisions').children.length,0);
 e.win.ppicRobotSessionReady();e.el('robotPeriod').value='2026-12';e.el('robotPeriod').handlers.change();e.win.ppicSetRobotStatus(status(),'2026-11');assert.equal(e.el('robotTopDecisions').children.length,0);
 e.win.ppicSetRobotStatus(status('2026-12'),'2026-12');assert.equal(e.el('robotTopDecisions').children.length,3);
});
test('technical health and operating judgement remain separate',()=>{
 const e=environment(),p=status();p.health.state='HEALTHY';p.latest_brief.payload.operating_status='DATA_BELUM_CUKUP';e.win.ppicSetRobotStatus(p,'2026-11');
 assert.equal(e.el('robotOperatingStatus').textContent,'Data belum cukup');assert.equal(e.el('robotHealthBadge').textContent,'Pemeriksaan berhasil');
});
test('frontend accepts the exact sanitized status API contract',async()=>{
 const {projectRobotStatus}=await import('../supabase/functions/ppic-robot-status/validation.mjs');
 const projected=projectRobotStatus(status(),'2026-11');const m=model(projected);
 assert.equal(m.brief.decisions.length,5);assert.equal(m.brief.decisions[0].evidence[0].facts[0].fact.key,'sample_stock');assert.equal(m.coverage[0].division,'BARANG JADI');
});
test('SDM metadata conflict warning follows report date filters and clears on logout',()=>{
 const e=environment(),p=status();p.coverage[0]={...p.coverage[0],division:'SDM GILING',report_status:'WORKING / METADATA_CONFLICT'};
 e.el('sdmStart').value='2026-11-13';e.el('sdmEnd').value='2026-11-19';e.win.ppicSetRobotStatus(p,'2026-11');
 assert.equal(e.el('sdmRobotSourceWarning').hidden,false);assert.match(e.el('sdmRobotSourceWarning').textContent,/Konflik tanggal/);assert.match(e.el('sdmRobotSourceWarning').textContent,/payroll final/);assert.match(e.el('sdmRobotSourceWarning').textContent,/sumber tercatat 19 Nov 2026 · laporan 18 Nov 2026/);
 e.el('sdmStart').value='2026-12-01';e.el('sdmEnd').value='2026-12-07';e.win.ppicRefreshSDMRobotWarning();assert.equal(e.el('sdmRobotSourceWarning').hidden,true);
 e.el('sdmStart').value='2026-11-13';e.el('sdmEnd').value='2026-11-19';e.win.ppicRefreshSDMRobotWarning();assert.equal(e.el('sdmRobotSourceWarning').hidden,false);
 p.coverage[0].report_status='OPEN RECON';e.win.ppicSetRobotStatus(p,'2026-11');assert.equal(e.el('sdmRobotSourceWarning').hidden,true);
 p.coverage[0].report_status='METADATA_CONFLICT';e.win.ppicSetRobotStatus(p,'2026-11');e.win.ppicClearRobotStatus();assert.equal(e.el('sdmRobotSourceWarning').hidden,true);assert.equal(e.el('sdmRobotSourceWarning').textContent,'');
});
test('configuration alone does not prove a web check and cycle success is labelled accurately',()=>{
 const e=environment(),p=status();p.runs=[{...p.runs[1],details:{code:'ROBOT_CONFIGURED'},message:'Jadwal sintetis dikonfigurasi.'}];e.win.ppicSetRobotStatus(p,'2026-11');
 assert.match(e.el('robotHealth').textContent,/Pemeriksaan web terakhir: Belum ada bukti pemeriksaan/);
 assert.match(e.el('robotHealth').textContent,/Siklus berhasil terakhir:/);assert.doesNotMatch(e.el('robotHealth').textContent,/Analisis berhasil terakhir:/);
 assert.match(e.el('robotRuns').textContent,/Pemeliharaan sistem/);assert.doesNotMatch(e.el('robotRuns').textContent,/Pemeriksaan web/);
 p.runs[0].details={check_name:'SYNTHETIC_WEB_CHECK'};e.win.ppicSetRobotStatus(p,'2026-11');assert.match(e.el('robotHealth').textContent,/Pemeriksaan web terakhir: .*WIB · Berhasil/);
 p.runs[0].details={check_name:'x'.repeat(1000)};assert.equal(model(p).runs[0].details.check_name.length,240);
});

const CHANNELS=['DISCOVERY_CHATGPT_CONTEXT','DISCOVERY_LIBRARY','DISCOVERY_DRIVE_REGISTER'];
function scan(channel,result='SEARCHED',options={}){
 return {id:'44444444-4444-4444-8444-444444444444',kind:'CHECK',status:'SUCCESS',message:'Catatan pencarian sintetis.',created_at:'2026-11-20T02:55:00Z',...options,details:{check_name:channel,period:'2026-11',result,source_count:2,...options.details}};
}
test('discovery without matching receipts stays unknown regardless of healthy schedule',()=>{
 const p=status(),m=model(p);assert.equal(m.discovery.label,'Belum ada catatan');
 assert.ok(m.discovery.channels.every(c=>c.state==='MISSING'&&c.source_count===null));
 p.runs=[scan(CHANNELS[0],'SEARCHED',{kind:'MAINTENANCE'}),scan(CHANNELS[1],'SEARCHED',{details:{period:'2026-12'}}),scan(CHANNELS[2],'SEARCHED',{details:{period:'2026-11-invalid'}})];
 assert.ok(model(p).discovery.channels.every(c=>c.state==='MISSING'));
 assert.equal(model(p).brief.created_at,p.latest_brief.created_at);
});
test('discovery selects the latest result per channel with bounded candidate counts',()=>{
 const p=status();p.runs=[scan(CHANNELS[0],'UNAVAILABLE',{status:'BLOCKED',created_at:'2026-11-20T01:00:00Z'}),scan(CHANNELS[0]),scan(CHANNELS[1],'CANDIDATES_PENDING'),scan(CHANNELS[2],'NO_NEW_SOURCE',{status:'NO_CHANGE',details:{source_count:0}})];
 const d=model(p).discovery;assert.equal(d.label,'Menunggu verifikasi sumber');assert.equal(d.tone,'gold');
 assert.deepEqual(d.channels.map(c=>c.state),['CHECKED','PENDING','CHECKED']);assert.equal(d.channels[0].result,'SEARCHED');assert.equal(d.channels[2].source_count,0);
 p.runs=CHANNELS.map(c=>scan(c));assert.equal(model(p).discovery.label,'3 jalur diperiksa');assert.equal(model(p).discovery.tone,'good');
 for(const count of [-1,Infinity,NaN,'4',null,1000000000]){p.runs=[scan(CHANNELS[0],'SEARCHED',{details:{source_count:count}})];assert.equal(model(p).discovery.channels[0].source_count,null);}
 p.runs=Array.from({length:20},()=>({...status().runs[0]}));p.runs.push(scan(CHANNELS[0]));assert.equal(model(p).discovery.channels[0].state,'MISSING');
});
test('discovery preserves partial, unavailable and failed paths without success inference',()=>{
 const p=status();p.runs=[scan(CHANNELS[0],'PARTIAL',{status:'WAITING'}),scan(CHANNELS[1],'UNAVAILABLE',{status:'BLOCKED'}),scan(CHANNELS[2],'SEARCHED',{status:'FAILED'})];
 const d=model(p).discovery;assert.deepEqual(d.channels.map(c=>c.state),['PARTIAL','UNAVAILABLE','FAILED']);assert.equal(d.label,'Cakupan belum lengkap');assert.equal(d.tone,'gold');
 assert.equal(d.channels[0].source_count,2);assert.equal(d.channels[1].source_count,null);assert.equal(d.channels[2].source_count,null);
 for(const status of ['FAILED','BLOCKED','RUNNING','WAITING','UNRECOGNIZED']){p.runs=[scan(CHANNELS[0],'SEARCHED',{status})];assert.notEqual(model(p).discovery.channels[0].state,'CHECKED');}
 for(const result of ['ALL_GPT_INDEXED','__proto__','constructor','']){p.runs=[scan(CHANNELS[0],result)];assert.equal(model(p).discovery.channels[0].state,'UNVERIFIED');}
});
test('scheduled partial search and pending verification remain explicit without a green completion state',()=>{
 const p=status();p.runs=[scan(CHANNELS[0],'PARTIAL',{status:'WAITING'}),scan(CHANNELS[1],'CANDIDATES_PENDING',{status:'WAITING'}),scan(CHANNELS[2],'UNAVAILABLE',{status:'BLOCKED'})];
 const d=model(p).discovery;assert.deepEqual(d.channels.map(c=>c.state),['PARTIAL','PENDING','UNAVAILABLE']);assert.equal(d.channels[1].source_count,2);assert.equal(d.tone,'gold');
 for(const status of ['WAITING','SUCCESS','NO_CHANGE']){p.runs=[scan(CHANNELS[0],'CANDIDATES_PENDING',{status})];assert.equal(model(p).discovery.channels[0].state,'PENDING');assert.notEqual(model(p).discovery.tone,'good');}
 for(const status of ['FAILED','BLOCKED']){p.runs=[scan(CHANNELS[0],'CANDIDATES_PENDING',{status})];assert.equal(model(p).discovery.channels[0].state,'FAILED');assert.equal(model(p).discovery.channels[0].source_count,null);}
});
test('discovery freshness uses each actual receipt instead of schedule or analysis time',()=>{
 const p=status();p.config.last_check_at=new Date(NOW).toISOString();p.runs=[scan(CHANNELS[0],'SEARCHED',{created_at:new Date(NOW-150*60*1000-1).toISOString()})];
 let d=model(p).discovery;assert.equal(d.channels[0].stale,true);assert.equal(d.label,'Perlu pencarian baru');assert.notEqual(d.tone,'good');
 p.runs[0].created_at=new Date(NOW-150*60*1000).toISOString();assert.equal(model(p).discovery.channels[0].stale,false);
 for(const created_at of ['invalid',new Date(NOW+5*60*1000+1).toISOString()]){p.runs[0].created_at=created_at;d=model(p).discovery;assert.equal(d.channels[0].state,'UNVERIFIED');assert.equal(d.channels[0].source_count,null);}
});
test('discovery renders hostile source text as text and identifies candidates separately',()=>{
 const e=environment(),p=status(),hostile='<img src=x onerror=alert(1)><script>throw 1</script>';
 p.runs=[scan(CHANNELS[0],'CANDIDATES_PENDING',{message:hostile,created_at:new Date().toISOString()}),scan(CHANNELS[1],'PARTIAL',{created_at:new Date().toISOString()})];
 e.win.ppicSetRobotStatus(p,'2026-11');const box=e.el('robotDiscoveryChannels');assert.equal(box.children.length,3);
 assert.ok(box.textContent.includes(hostile));assert.match(box.textContent,/Kandidat dari hasil pencarian: 2/);assert.match(box.textContent,/Kandidat perlu diverifikasi/);assert.doesNotMatch(box.textContent,/2 file diimpor|seluruh akun telah dibaca/);
 const tags=[];function walk(n){tags.push(n.tagName);for(const c of n.children||[])walk(c);}walk(box);
 assert.ok(!tags.some(t=>['IMG','SCRIPT','A','IFRAME'].includes(t)));
});
test('discovery clears on logout and changed period, and marks failed refresh explicitly',()=>{
 const e=environment(),p=status();p.runs=[scan(CHANNELS[0],'SEARCHED',{created_at:new Date().toISOString()})];e.win.ppicSetRobotStatus(p,'2026-11');
 e.win.ppicRobotStatusError('SYNTHETIC_FAILURE',{period:'2026-11'});assert.equal(e.el('robotDiscoveryChannels').children.length,3);assert.equal(e.el('robotDiscoveryBadge').textContent,'Hasil lama · koneksi gagal');
 e.el('robotDiscoveryPanel').open=true;e.win.ppicClearRobotStatus();assert.equal(e.el('robotDiscoveryChannels').children.length,0);assert.equal(e.el('robotDiscoveryPanel').open,false);assert.equal(e.el('robotDiscoveryBadge').textContent,'Belum diperiksa');
 e.win.ppicRobotSessionReady();e.win.ppicSetRobotStatus(p,'2026-11');e.el('robotPeriod').value='2026-12';e.el('robotPeriod').handlers.change();assert.equal(e.el('robotDiscoveryChannels').children.length,0);
 e.win.ppicSetRobotStatus(p,'2026-11');assert.equal(e.el('robotDiscoveryChannels').children.length,0);
});
test('existing private status projection preserves discovery receipts without API changes',async()=>{
 const {projectRobotStatus}=await import('../supabase/functions/ppic-robot-status/validation.mjs');
 const p=status();p.runs=[scan(CHANNELS[0],'SEARCHED',{message:'Catatan https://example.invalid/private?token=secret'}),scan(CHANNELS[1],'PARTIAL'),scan(CHANNELS[2],'UNAVAILABLE',{status:'BLOCKED'})];
 const projected=projectRobotStatus(p,'2026-11'),d=model(projected).discovery;
 assert.deepEqual(d.channels.map(c=>c.state),['CHECKED','PARTIAL','UNAVAILABLE']);assert.doesNotMatch(d.channels[0].message,/example\.invalid|token=secret/);
});
