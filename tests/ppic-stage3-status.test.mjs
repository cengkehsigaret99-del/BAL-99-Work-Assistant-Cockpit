import test from 'node:test';
import assert from 'node:assert/strict';
import {createStage3Handler,projectStage3,ORIGIN} from '../supabase/functions/ppic-stage3-status/validation.mjs';

const period='2026-11';
const owner='11111111-1111-4111-8111-111111111111';
const briefing='22222222-2222-4222-8222-222222222222';
const snapshot='33333333-3333-4333-8333-333333333333';
const fact={document_id:'SYNTHETIC_SOURCE',fact_keys:['sample_stock','unknown_phys']};
const card={id:'supply_check',rank:1,priority:'P1',kind:'OWNER_DECISION',title:'Periksa bukti fisik',
 recommendation:'Jangan alokasikan stok yang belum terverifikasi.',reason:'Saldo buku berbeda dari bukti lokasi.',
 consequence:'Mengurangi risiko janji pengiriman gagal.',owner_role:'Owner / PPIC',confidence:'SEDANG',
 data_limit:'Perlu opname fisik.',action_state:'USULAN',gate:'BUTUH_VERIFIKASI',
 requires_owner_approval:true,missing_evidence_present:true,divisions:['BARANG JADI'],
 risks:[{code:'BJ_NEGATIVE_BOOK',severity:'HIGH',division:'BARANG JADI',message:'Buku perlu pemeriksaan'}],evidence:[fact]};
const fixture=()=>({ok:true,ready:true,period,latest:{
 id:snapshot,schema_version:'ppic-stage3-decision-v1',evidence_hash:'a'.repeat(64),evidence_current:true,briefing_id:briefing,
 analysis_as_of:'2026-11-20',created_at:'2026-11-21T02:50:00Z',source_count:10,data_blockers:1,status:'WAITING_DATA',
 decisions:[structuredClone(card)],focus_ids:['supply_check'],risk_register:[{code:'BJ_NEGATIVE_BOOK',severity:'HIGH',division:'BARANG JADI',message:'Buku perlu diperiksa'}],
 coverage:[{division:'BARANG JADI',source_cutoff:'2026-11-18',report_cutoff:'2026-11-18',report_status:'OPEN RECON'}],
 raw_token:'SHOULD_NOT_LEAK',source_manifest:[{private_locator:'hidden'}]
}});
function service({deny=false,rpcError=null,data=fixture()}={}){
 const calls=[];
 return {calls,auth:{async getUser(token){calls.push(['auth',token]);return deny?{error:{message:'private'},data:{user:null}}:{error:null,data:{user:{id:owner}}};}},
 async rpc(name,args){calls.push(['rpc',name,args]);return {data,error:rpcError};}};
}
const req=({origin=ORIGIN,method='POST',authorization='Bearer test-owner',body={period}}={})=>new Request('https://example.invalid/functions/v1/ppic-stage3-status',{
 method,headers:{...(origin===null?{}:{origin}),...(authorization===null?{}:{authorization}),'content-type':'application/json'},
 ...(['POST','PUT'].includes(method)?{body:typeof body==='string'?body:JSON.stringify(body)}:{})
});
test('projected decision is source-backed, no private locators or arbitrary payload',()=>{
 const x=projectStage3(fixture(),period);
 assert.equal(x.ready,true);assert.equal(x.latest.evidence_current,true);
 assert.equal(x.latest.decisions[0].evidence[0].document_id,'SYNTHETIC_SOURCE');
 assert.equal(x.latest.decisions[0].action_state,'USULAN');assert.equal(x.latest.focus_ids.length,1);
 assert.doesNotMatch(JSON.stringify(x),/raw_token|SHOULD_NOT_LEAK|private_locator|hidden/);
});
test('rejects invalid priority, action, evidence, focus, and stale data shape',()=>{
 const changes=[
  x=>x.latest.decisions[0].action_state='APPROVED',
  x=>x.latest.decisions[0].priority='P0',
  x=>x.latest.decisions[0].evidence[0].fact_keys=['invalid key'],
  x=>x.latest.focus_ids=['nonexistent'],
  x=>x.latest.status='EXECUTED',
  x=>x.latest.evidence_current=null,
  x=>x.latest.decisions[0].gate='AUTO_PAY'
 ];
 for(const mutate of changes){const x=fixture();mutate(x);assert.throws(()=>projectStage3(x,period));}
});
test('reports stale or missing results explicitly and never pretends to approve action',()=>{
 const x=fixture();x.latest.evidence_current=false;
 assert.equal(projectStage3(x,period).latest.evidence_current,false);
 assert.deepEqual(projectStage3({ok:true,period,ready:false,latest:null},period),{ok:true,period,ready:false,latest:null});
});
test('wrong Origin fails before auth, malformed method and token denied',async()=>{
 for(const origin of [null,'null',ORIGIN+'/','https://attacker.example']){
  const s=service();const res=await createStage3Handler({service:s})(req({origin}));
  assert.equal(res.status,403);assert.deepEqual(s.calls,[]);
 }
 const h=createStage3Handler({service:service()});
 assert.equal((await h(req({method:'OPTIONS'}))).status,200);
 assert.equal((await h(req({method:'GET'}))).status,405);
 assert.equal((await h(req({authorization:null}))).status,401);
 assert.equal((await createStage3Handler({service:service({deny:true})})(req())).status,403);
});
test('strict request shape and bounded body rejected',async()=>{
 for(const body of ['{}','bad','[]', '{"period":"2026-13"}',
   '{"period":"2026-11","execute":true}',JSON.stringify({period,padding:'x'.repeat(1600)})]){
  const s=service();const response=await createStage3Handler({service:s})(req({body}));
  assert.equal(response.status,400);assert.equal(s.calls.filter(x=>x[0]==='rpc').length,0);
 }
});
test('owner session calls only the approved read RPC',async()=>{
 const s=service(),res=await createStage3Handler({service:s})(req()),x=await res.json();
 assert.equal(res.status,200);assert.equal(x.latest.status,'WAITING_DATA');
 assert.deepEqual(s.calls[1],['rpc','ppic_stage3_status',{p_owner:owner,p_period:period}]);
 assert.equal(res.headers.get('cache-control'),'no-store');
});
test('RPC failure is redacted and fail closed',async()=>{
 const s=service({rpcError:{message:'private SQL secret details'}}),res=await createStage3Handler({service:s})(req());
 assert.equal(res.status,503);assert.doesNotMatch(await res.text(),/private SQL secret details/);
});
