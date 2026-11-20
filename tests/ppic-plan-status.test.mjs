import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlanHandler,projectPlan,ORIGIN} from '../supabase/functions/ppic-plan-status/validation.mjs';

const id='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222',period='2026-11',doc='PPIC_SYNTHETIC_SOURCE';
const fixture=()=>({ok:true,ready:true,period,latest:{
 id,schema_version:'ppic-production-plan-v1',state:'HOLD_DATA',evidence_hash:'a'.repeat(64),
 evidence_current:true,analysis_as_of:'2026-11-20',created_at:'2026-11-21T01:00:00Z',
 skt_observed:true,skt_captured_at:'2026-11-20T20:12:00Z',
 skt_revision:'BAL-MIRROR-'+'a'.repeat(64),skt_counts:{daily_reports:67,sj_documents:23,bb_documents:53,co_orders:7,co_realizations:0,co_allocations:0,bb_master_entries:2,total_documents:150},
 gates:[{code:'FIRM_ORDER_LINES',label:'Pesanan firm per SKU',state:'MISSING_PROOF',message:'Belum ada bukti firm.',owner_role:'DO',observed_forms:7,basis:'SKT_CURRENT_FORM_COUNT_NOT_FIRM_ORDERS'}],
 source_facts:[{key:'ready_for_delivery_pack',value:null,quality:'MISSING',division:'BARANG JADI',document_id:doc,unit:'pack',cutoff:'2026-11-18'}],
 proposal_lines:[],next_actions:[{priority:'P1',division:'DO / Customer',task:'Konfirmasi pesanan firm per SKU.',release_state:'USULAN'}],
 private_download_url:'https://sensitive.invalid/?sig=SECRET',private_worker:'SECRET_WORKER'
}});
function service({denied=false,data=fixture(),error=null}={}){
 const calls=[];return {calls,auth:{async getUser(token){calls.push(['auth',token]);return denied?{data:{user:null},error:{message:'SECRET_AUTH_ERROR'}}:{data:{user:{id:owner}},error:null};}},
 async rpc(name,args){calls.push(['rpc',name,args]);return{data,error};}};
}
const req=({origin=ORIGIN,method='POST',auth='Bearer owner-synthetic-token',body={period}}={})=>new Request('https://example.invalid/functions/v1/ppic-plan-status',{
 method,headers:{...(origin===null?{}:{origin}),...(auth===null?{}:{authorization:auth}),'content-type':'application/json'},
 ...(['POST','PUT'].includes(method)?{body:typeof body==='string'?body:JSON.stringify(body)}:{})
});
test('valid Owner reads bounded readiness without private fields',()=>{
 const x=projectPlan(fixture(),period);
 assert.equal(x.ready,true);assert.equal(x.latest.state,'HOLD_DATA');
 assert.equal(x.latest.skt_counts.co_orders,7);assert.equal(x.latest.proposal_lines.length,0);
 assert.equal(x.latest.source_facts[0].value,null);
 assert.equal(x.latest.gates[0].state,'MISSING_PROOF');
 assert.doesNotMatch(JSON.stringify(x),/SECRET|private_worker|private_download_url|sensitive.invalid/);
});
test('absence of firm orders or verified stock is not silently converted to zero-ready shipment',()=>{
 const x=projectPlan(fixture(),period);
 assert.equal(x.latest.proposal_lines.length,0);
 assert.notEqual(x.latest.state,'PROPOSALS_READY');
 assert.equal(x.latest.source_facts[0].quality,'MISSING');
});
test('invalid proposal cannot be marked as completed or executed',()=>{
 const bad=fixture();bad.latest.proposal_lines=[{sku:'c_033',state:'HOLD',missing:['QC'],proposed_ship_pack:1000,
  proposed_make_pack:1,owner_approval_required:true}];
 assert.throws(()=>projectPlan(bad,period));
 const bad2=fixture();bad2.latest.state='PROPOSALS_READY';
 assert.throws(()=>projectPlan(bad2,period));
 const bad3=fixture();bad3.latest.next_actions[0].release_state='AUTO_EXECUTED';
 assert.throws(()=>projectPlan(bad3,period));
});
test('valid numeric proposals are explicitly provisional, not operational actions',()=>{
 const x=fixture();
 x.latest.state='PROPOSALS_READY';x.latest.proposal_lines=[{sku:'c_033',state:'PROPOSAL_ONLY',missing:[],firm_order_pack:2000,
   available_pack:1000,proposed_ship_pack:1000,proposed_make_pack:1000,unit:'pack',planning_cutoff:'2026-11-20',owner_approval_required:true,
   source_document_id:doc}];
 const projected=projectPlan(x,period).latest.proposal_lines[0];
 assert.equal(projected.state,'PROPOSAL_ONLY');assert.equal(projected.owner_approval_required,true);
 assert.equal(projected.proposed_make_pack,1000);
});
test('wrong origin is refused before database auth; only POST and Owner bearer permitted',async()=>{
 for(const origin of [null,'null',ORIGIN+'/', 'https://attacker.invalid']){
  const s=service(),r=await createPlanHandler({service:s})(req({origin}));
  assert.equal(r.status,403);assert.deepEqual(s.calls,[]);
 }
 const h=createPlanHandler({service:service()});
 assert.equal((await h(req({method:'OPTIONS'}))).status,200);
 assert.equal((await h(req({method:'GET'}))).status,405);
 assert.equal((await h(req({auth:null}))).status,401);
 assert.equal((await createPlanHandler({service:service({denied:true})})(req())).status,403);
});
test('invalid period, extra command and large JSON are rejected',async()=>{
 for(const body of ['{}','[]','not json','{"period":"2026-13"}',
  '{"period":"2026-11","execute":true}',JSON.stringify({period,padding:'x'.repeat(2200)})]){
  const s=service(),r=await createPlanHandler({service:s})(req({body}));
  assert.equal(r.status,400);assert.equal(s.calls.filter(c=>c[0]==='rpc').length,0);
 }
});
test('Owner session can only call approved read-only status RPC',async()=>{
 const s=service(),r=await createPlanHandler({service:s})(req()),d=await r.json();
 assert.equal(r.status,200);assert.equal(d.latest.state,'HOLD_DATA');
 assert.deepEqual(s.calls[1],['rpc','ppic_plan_status',{p_owner:owner,p_period:period}]);
 assert.equal(r.headers.get('Cache-Control'),'no-store');
 assert.equal(r.headers.get('Access-Control-Allow-Origin'),ORIGIN);
});
test('stale or missing source status explicit; backend errors redacted',async()=>{
 const stale=fixture();stale.latest.evidence_current=false;
 assert.equal(projectPlan(stale,period).latest.evidence_current,false);
 assert.deepEqual(projectPlan({ok:true,period,ready:false,latest:null},period),{ok:true,period,ready:false,latest:null});
 const s=service({error:{message:'SECRET_DATABASE_FAILURE'}}),res=await createPlanHandler({service:s})(req());
 assert.equal(res.status,503);assert.doesNotMatch(await res.text(),/SECRET_DATABASE_FAILURE/);
});
