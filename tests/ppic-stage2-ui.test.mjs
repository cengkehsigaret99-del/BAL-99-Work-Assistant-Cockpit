import test from 'node:test';
import assert from 'node:assert/strict';
import stage2 from '../ppic-stage2-ui.js';
const {buildModel}=stage2;
const period='2026-11';
const base=()=>({ok:true,period,ready:true,latest:{
 id:'11111111-1111-4111-8111-111111111111',status:'BLOCKED',created_at:'2026-11-21T01:05:00Z',
 source_count:10,archived_source_count:7,evidence_hash:'a'.repeat(64),
 checks:[{code:'BJ_BOOK_MUTATION',state:'PASS',reported:338125,computed:338125,unit:'pack'}],
 warnings:[{severity:'HIGH',division:'SDM GILING',message:'Konflik data asli'}],
 coverage:[{division:'GILING',source_cutoff:'2026-11-20',report_cutoff:'2026-11-17'}],indicators:{}
 }});
test('renders source-backed Stage 2 snapshot with blocked status and separate source dates',()=>{
 const r=buildModel(base(),period);
 assert.equal(r.status,'BLOCKED');assert.equal(r.source_count,10);assert.equal(r.archived_source_count,7);
 assert.equal(r.checks[0].reported,338125);
 assert.equal(r.coverage[0].source_cutoff,'2026-11-20');assert.equal(r.coverage[0].report_cutoff,'2026-11-17');
});
test('does not treat missing snapshot as reconciled',()=>{
 assert.deepEqual(buildModel({ok:true,period,ready:false,latest:null},period),{ready:false,period});
});
test('period mismatches and unknown statuses fail closed',()=>{
 assert.throws(()=>buildModel(base(),'2026-10'));
 const broken=base();broken.latest.status='APPROVED';assert.throws(()=>buildModel(broken,period));
});
