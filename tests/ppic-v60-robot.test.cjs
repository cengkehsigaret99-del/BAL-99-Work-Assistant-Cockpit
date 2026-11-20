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
 for(const id of ['robotTopDecisions','robotOtherDecisions','robotCompleted','robotPending','robotWatchlist','robotHealth','robotRuns'])assert.equal(e.el(id).children.length,0);
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
