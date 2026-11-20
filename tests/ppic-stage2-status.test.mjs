import test from 'node:test';
import assert from 'node:assert/strict';
import {projectStage2,createStage2Handler,ORIGIN} from '../supabase/functions/ppic-stage2-status/validation.mjs';

const owner='11111111-1111-4111-8111-111111111111';
const sid='22222222-2222-4222-8222-222222222222';
const period='2026-11';
const hash='a'.repeat(64);
const fixture=()=>({ok:true,period,ready:true,latest:{id:sid,schema_version:'ppic-stage2-review-v1',status:'BLOCKED',evidence_hash:hash,
 source_count:10,archived_source_count:7,created_at:'2026-11-21T00:31:20+00:00',
 coverage:[{division:'GILING',source_cutoff:'2026-11-20',report_cutoff:'2026-11-17',has_facts:true,source_version:'V011',report_version:'V001',report_status:'OPEN RECON',selection_status:'READY'}],
 checks:[{code:'BJ_BOOK_MUTATION',state:'PASS',division:'BARANG JADI',computed:338125,reported:338125,unit:'pack',
  message:'Buku cocok, fisik tidak terverifikasi.',private_secret:'HIDDEN'}],
 warnings:[{code:'METADATA_CONFLICT',severity:'HIGH',division:'SDM GILING',message:'Konflik tanggal, perlu pembuktian.'}],
 indicators:{'BARANG JADI':[{key:'book_closing_pack',label:'Saldo buku',value:338125,quality:'SOURCE',unit:'pack',document_id:'SYNTHETIC_ID',source_sheet:'A',source_range:'C1'},
 {key:'worker_private',label:'Data individu',value:'private person',quality:'SOURCE',document_id:'SYNTHETIC_ID'}]},
 source_manifest:[{division:'GILING',private_locator:'never expose'}],extra_token:'never expose'
}});
function service(options={}){
 const calls=[];return {calls,
 auth:{async getUser(token){calls.push(['auth',token]);if(options.denied)return{data:{user:null},error:{message:'PRIVATE_TOKEN'}};return{data:{user:{id:owner}},error:null};}},
 async rpc(name,args){calls.push(['rpc',name,args]);return{data:options.data??fixture(),error:options.rpcError??null};}};
}
const req=({origin=ORIGIN,method='POST',auth='Bearer synthetic-token',body={period}}={})=>new Request('https://example.invalid/functions/v1/ppic-stage2-status',
 {method,headers:{...(origin===null?{}:{origin}),...(auth===null?{}:{authorization:auth}),'content-type':'application/json'},
 ...(['POST','PUT'].includes(method)?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
test('Source-backed metrics are projected with provenance; no private file locator or unexpected values',()=>{
 const r=projectStage2(fixture(),period);
 assert.equal(r.ok,true);assert.equal(r.latest.source_count,10);assert.equal(r.latest.archived_source_count,7);
 assert.equal(r.latest.indicators['BARANG JADI'][0].value,338125);
 assert.equal(r.latest.indicators['BARANG JADI'].length,1);
 assert.equal(r.latest.checks[0].computed,338125);
 assert.doesNotMatch(JSON.stringify(r),/private_locator|HIDDEN|never expose|private person|extra_token/);
});
test('Only Owner with exact Origin and bearer can request read-only snapshot',async()=>{
 for(const origin of [null,'null','https://attacker.invalid',ORIGIN+'/']){
  const s=service(),r=await createStage2Handler({service:s})(req({origin}));
  assert.equal(r.status,403);assert.deepEqual(s.calls,[]);
 }
 const s=service();
 assert.equal((await createStage2Handler({service:s})(req({method:'OPTIONS'}))).status,200);
 assert.equal((await createStage2Handler({service:s})(req({method:'GET'}))).status,405);
 assert.equal((await createStage2Handler({service:s})(req({auth:null}))).status,401);
 assert.equal((await createStage2Handler({service:service({denied:true})})(req())).status,403);
});
test('Expected period and strict request shape are enforced',async()=>{
 for(const bad of ['{}','[]','{"period":"2026-13"}','{"period":"2026-11","role":"owner"}',JSON.stringify({period,padding:'x'.repeat(2000)}),'no-json']){
  const s=service(),r=await createStage2Handler({service:s})(req({body:bad}));
  assert.equal(r.status,400);
  assert.equal(s.calls.some(x=>x[0]==='rpc'),false);
 }
});
test('Only authorised service RPC is called and status has no-store',async()=>{
 const s=service(),r=await createStage2Handler({service:s})(req()),data=await r.json();
 assert.equal(r.status,200);assert.equal(data.latest.status,'BLOCKED');
 assert.deepEqual(s.calls[1],['rpc','ppic_stage2_status',{p_owner:owner,p_period:period}]);
 assert.equal(r.headers.get('cache-control'),'no-store');
 assert.equal(r.headers.get('access-control-allow-origin'),ORIGIN);
});
test('Missing snapshot is not reported as successful reconciliation',()=>{
 const x=projectStage2({ok:true,period,ready:false,latest:null},period);
 assert.equal(x.ready,false);assert.equal(x.latest,null);
});
test('Malformed or unsupported data fails closed and does not reveal raw backend errors',async()=>{
 const bad=fixture();bad.latest.checks[0].state='APPROVED';
 assert.throws(()=>projectStage2(bad,period));
 const s=service({rpcError:{message:'private raw connection failure'}}),r=await createStage2Handler({service:s})(req());
 assert.equal(r.status,503);
 assert.doesNotMatch(await r.text(),/private raw connection failure/);
});
test('No component permits transactional change',async()=>{
 const s=service(),r=await createStage2Handler({service:s})(req({body:{period,mode:'execute'}}));
 assert.equal(r.status,400);assert.deepEqual(s.calls.map(x=>x[0]),['auth']);
});
