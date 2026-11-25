const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../cukai-sync.js');const {snapshot}=require('./fixtures/cukai-synthetic.cjs');
const fixture=(r=1,n=0)=>api.validate(snapshot(r,n),'2026-11');
test('canonical identity and source controls verified, same HJE distinct pools preserved',()=>{
 const s=fixture();assert.equal(s.hjes.length,2);assert.equal(s.hjes[0].hje,s.hjes[1].hje);assert.notEqual(s.hjes[0].id,s.hjes[1].id);
 assert.equal(s.hjes[0].physical_count,null);assert.equal(s.hjes[0].packs_per_carton,null);
});
test('invalid period, hash, pool duplicates, control balances and unknown pool usage fail closed',()=>{
 for(const mutate of [s=>s.period='2026-12',s=>s.source_hash='x',s=>s.hjes[1].id=s.hjes[0].id,s=>s.hjes[0].closing=999,s=>s.daily_usage[0].source_hje_id='UNKNOWN']){
  const s=snapshot();mutate(s);assert.throws(()=>api.validate(s,'2026-11'),/tidak valid/);
 }
});
test('missing period remains unavailable and never produces zero balances',()=>{
 const x=api.validate({ok:true,ready:false,period:'2026-12'},'2026-12');assert.equal(x.ready,false);assert.deepEqual(api.dailyProjection(x),[]);assert.equal(api.reportProjection(x),null);
});
test('duplicate revision idempotent and delayed older revision rejected',()=>{
 const s=fixture(2,10);assert.equal(api.accept(s,s).source_revision,2);
 assert.throws(()=>api.accept(s,fixture()),/Revisi lama/);
 const conflict={...s,payload_hash:'f'.repeat(64)};assert.throws(()=>api.accept(s,conflict),/Identitas revisi/);
});
test('newer revision correcting an older date is accepted by revision rather than cutoff',()=>{
 const p=fixture(1);const raw=snapshot(2,20);raw.cutoff='2026-11-24';raw.daily_usage=raw.daily_usage.filter(d=>d.date<=raw.cutoff);
 assert.equal(api.accept(p,api.validate(raw,'2026-11')).source_revision,2);
});
test('daily projection stores control closing without inventing receipt dates or daily zero flows',()=>{
 const d=api.dailyProjection(fixture());assert.equal(d.length,2);assert.equal(d[0].payload.book_closing,1300);assert.deepEqual(d[0].payload.entries,[]);assert.equal(d[0].payload.opening_nominal,null);assert.equal(d[0].payload.source_hje_id,'UJI-A');
});
test('canonical wins regardless whether legacy daily/report response arrives first or last',()=>{
 const s=fixture(2,20),legacyDaily=[{period:'2026-11',division:'CUKAI 10.325',payload:{book_closing:99999}},{period:'2026-11',division:'GILING',payload:{value:77}},{period:'2026-10',division:'CUKAI 10.325'}];
 const d=api.mergeDaily(legacyDaily,[s]);assert.equal(d.filter(x=>x.period==='2026-11'&&x.division.startsWith('CUKAI')).length,2);assert.equal(d.find(x=>x.division==='GILING').payload.value,77);assert.equal(d.find(x=>x.division==='CUKAI UJI-A').payload.book_closing,1280);assert.ok(d.some(x=>x.period==='2026-10'));
 const old=[{report_key:'05',period:'2026-11',version:'V999'},{report_key:'04',period:'2026-11'}];
 const r=api.mergeReports(old,[s]);assert.equal(r.filter(x=>x.report_key==='05').length,1);assert.equal(r.find(x=>x.report_key==='05').payload.provenance.source_revision,2);assert.ok(r.some(x=>x.report_key==='04'));
 assert.deepEqual(api.mergeDaily(d,[s]),d);assert.deepEqual(api.mergeReports(r,[s]),r);
});
test('print includes immutable source identity and same pool/range filters, escapes data labels',()=>{
 const s=fixture();s.hjes[0].label='<script>bad()</script>';
 const html=api.printHTML(s,{pool:'UJI-A',from:'2026-11-25',to:'2026-11-25'});
 assert.ok(html.includes(s.source_snapshot_id)&&html.includes(s.payload_hash));assert.ok(html.includes('1.300'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>bad()'));assert.ok(!html.includes('Pita Uji B'));assert.ok(!html.includes('2026-11-02'));assert.ok(html.includes('Belum tersedia'));
});
test('transient missing source cannot erase an already applied snapshot',()=>assert.throws(()=>api.accept(fixture(),{ready:false,period:'2026-11'}),/dipertahankan/));
test('Info Harian and report05 derive identical cutoff controls from same canonical revision',()=>{
 const s=fixture(3,30),d=api.dailyProjection(s),r=api.reportProjection(s),info=require('../daily-info-data.js').build({asOf:'2026-11-25',daily:d}).sections.find(x=>x.id==='excise');
 assert.equal(info.rows[0].numeric.keping,r.payload.tables[0].rows[0][6]);assert.equal(info.rows[0].numeric.packPerCarton,null);assert.equal(info.rows[0].numeric.keping,1270);
 assert.equal(d[0].payload.provenance.source_revision,r.payload.provenance.source_revision);
});

test('unknown source usage remains null, with pool identity and day uniqueness enforced',()=>{
 const raw=snapshot();raw.daily_usage[0].quantity=null;
 const s=api.validate(raw,'2026-11');assert.equal(s.daily_usage[0].quantity,null);assert.ok(api.printHTML(s).includes('Belum tersedia'));
 const dup=snapshot();dup.daily_usage.push({...dup.daily_usage[0]});assert.throws(()=>api.validate(dup,'2026-11'),/tidak valid/);
 const mismatch=snapshot();mismatch.daily_usage[0].hje=999;assert.throws(()=>api.validate(mismatch,'2026-11'),/tidak valid/);
});

test('identical revision cannot swap source hash and future usage range is rejected',()=>{
 const s=fixture();assert.throws(()=>api.accept(s,{...s,source_hash:'b'.repeat(64)}),/Identitas revisi/);
 assert.throws(()=>api.selected(s,{from:'2026-11-01',to:'2026-11-26'}),/Rentang/);
});

test('ambiguous numeric HJE usage stays unallocated while pool balances remain separate',()=>{
 const raw=snapshot();raw.daily_usage=[{date:'2026-11-25',hje:10001,source_hje_id:null,quantity:null}];
 const s=api.validate(raw,'2026-11');assert.equal(s.hjes.length,2);assert.equal(api.selected(s).usage.length,1);assert.equal(api.selected(s,{pool:'UJI-A'}).usage.length,0);
 assert.ok(api.printHTML(s).includes('Kelompok belum terpetakan'));assert.equal(api.reportProjection(s).payload.tables[1].rows[0][1],'Kelompok belum terpetakan');
 const unique=snapshot();unique.hjes=[unique.hjes[0]];unique.daily_usage=raw.daily_usage;assert.throws(()=>api.validate(unique,'2026-11'),/tidak valid/);
});
