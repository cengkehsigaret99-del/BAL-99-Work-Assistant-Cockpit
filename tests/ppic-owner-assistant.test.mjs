import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnerAssistantHandler,ORIGIN} from '../supabase/functions/ppic-owner-assistant/validation.mjs';

const requestId='11111111-1111-4111-8111-111111111111';
const questionId='22222222-2222-4222-8222-222222222222';
const userId='33333333-3333-4333-8333-333333333333';
const period='2026-11';
const evidenceHash='a'.repeat(64);
const reply='Saldo contoh hanya referensi; konfirmasi opname fisik dan status QC sebelum menetapkan pengiriman.';
const status={ok:true,period,health:{source_changed_since_brief:false},latest_brief:{evidence_hash:evidenceHash,as_of:'2026-11-20',payload:{operating_status:'PERLU_PERHATIAN'}},
 evidence_sources:[{document_id:'SYNTHETIC_BJ',division:'BARANG JADI',cutoff:'2026-11-20',version:'V001',facts:[{key:'stock',label:'Saldo sumber uji',value:123,unit:'pack',quality:'REFERENCE',scope:'fixture',source_sheet:'UJI',source_range:'A1',note:'Contoh sintetis'}]}]};
function harness({auth=false,rpcError=false}={}){
 const calls=[];
 const service={calls,auth:{async getUser(token){calls.push({method:'auth',token});return auth?{data:{user:null},error:{message:'private'}}:{data:{user:{id:userId}},error:null};}},
  async rpc(name,args){calls.push({method:'rpc',name,args});
   if(rpcError)return {data:null,error:{message:'private backend error'}};
   if(name==='ppic_robot_question_submit')return {data:{ok:true,id:questionId,state:'QUEUED',period,intent:'ASK'},error:null};
   if(name==='ppic_robot_question_list')return {data:{ok:true,period,questions:[{id:questionId,period,intent:'ASK',question:'Cek stok',state:'ANSWERED',answer:reply,source_refs:[{document_id:'SYNTHETIC_BJ',fact_keys:['stock']}],backend:'GPT_AUTOMATION',created_at:'2026-11-20T12:00:00Z'}]},error:null};
   if(name==='ppic_robot_status')return {data:status,error:null};
   if(name==='ppic_robot_question_complete')return {data:{ok:true,id:questionId,state:'ANSWERED'},error:null};
   throw Error('Unexpected rpc');
  }};
 return service;
}
const ask={mode:'submit',period,intent:'ASK',question:'Berapa stok yang siap kirim?',request_id:requestId};
const req=({body=ask,origin=ORIGIN,authorization='Bearer owner-fixture',method='POST'}={})=>new Request('https://example.invalid/functions/v1/ppic-owner-assistant',{
 method,headers:{...(origin===null?{}:{origin}),...(authorization===null?{}:{authorization}),'content-type':'application/json'},
 ...(['POST','PUT'].includes(method)?{body:typeof body==='string'?body:JSON.stringify(body)}:{})
});
test('Rejects wrong Origin without touching auth or database',async()=>{
 for(const origin of [null,'null','https://attacker.invalid',ORIGIN+'/']){
  const s=harness(),response=await createOwnerAssistantHandler({service:s})(req({origin}));
  assert.equal(response.status,403);assert.deepEqual(s.calls,[]);assert.equal(response.headers.get('access-control-allow-origin'),null);
 }
});
test('Allows only preflight and POST and requires valid bearer Owner',async()=>{
 const s=harness();const h=createOwnerAssistantHandler({service:s});
 assert.equal((await h(req({method:'OPTIONS'}))).status,200);
 assert.equal((await h(req({method:'GET'}))).status,405);
 assert.equal((await h(req({authorization:null}))).status,401);
 const denied=await createOwnerAssistantHandler({service:harness({auth:true})})(req());
 assert.equal(denied.status,403);
});
test('Rejects malformed and oversized payloads before accessing queue',async()=>{
 const bad=[{...ask,intent:'ADMIN_PAYROLL'}, {...ask,request_id:'bad'}, {...ask,question:''},{...ask,question:'x'.repeat(900)}, {...ask,period:'2026-13'},{...ask,password:'bad'},'not-json'];
 for(const body of bad){
  const s=harness(),response=await createOwnerAssistantHandler({service:s})(req({body}));
  assert.equal(response.status,400);
  assert.equal(s.calls.filter(x=>x.method==='rpc').length,0);
 }
});
test('Owner list returns bounded allowlisted history',async()=>{
 const s=harness(),response=await createOwnerAssistantHandler({service:s})(req({body:{mode:'list',period}})),data=await response.json();
 assert.equal(response.status,200);assert.equal(data.questions[0].answer,reply);assert.equal(data.questions[0].backend,'GPT_AUTOMATION');
 assert.equal(data.live_gpt_configured,false);assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal(s.calls[1].name,'ppic_robot_question_list');assert.equal(s.calls[1].args.p_owner,userId);
});
test('Missing API key saves a question and returns queued rather than fake GPT answer',async()=>{
 const s=harness(),response=await createOwnerAssistantHandler({service:s})(req()),data=await response.json();
 assert.equal(response.status,202);assert.equal(data.state,'QUEUED');assert.equal(data.answer,undefined);
 assert.equal(s.calls.filter(x=>x.method==='rpc').length,1);
 assert.match(data.notice,/menunggu|Menunggu/);
});
test('Analysis and sync commands remain queued even when live API key exists',async()=>{
 for(const intent of ['ANALYZE','SYNC_CHECK']){
  const s=harness(),response=await createOwnerAssistantHandler({service:s,openaiKey:'synthetic-not-real-key',fetcher:()=>{throw Error('should not call model')}})(req({body:{...ask,intent}}));
  assert.equal(response.status,202);
  assert.equal(s.calls.filter(x=>x.method==='rpc').length,1);
 }
});
test('Live API answer uses verified context, never client secret, then records source refs',async()=>{
 const s=harness();let payload;
 const fetcher=async(url,opts)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(opts.redirect,'error');
  assert.equal(opts.headers.Authorization,'Bearer synthetic-test-only-key');
  payload=JSON.parse(opts.body);return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:reply}]}]}),{status:200});
 };
 const response=await createOwnerAssistantHandler({service:s,openaiKey:'synthetic-test-only-key',fetcher})(req());
 const data=await response.json();
 assert.equal(response.status,200);assert.equal(data.state,'ANSWERED');assert.equal(data.answer,reply);
 assert.equal(data.source_refs[0].document_id,'SYNTHETIC_BJ');assert.equal(data.source_refs[0].fact_keys[0],'stock');
 assert.equal(payload.store,false);assert.equal(payload.model,'gpt-4.1');
 assert.equal(s.calls.filter(x=>x.name==='ppic_robot_question_complete').length,1);
 assert.doesNotMatch(JSON.stringify(data),/synthetic-test-only-key/);
});
test('Failed model service returns queued with no claim of success',async()=>{
 const s=harness(),h=createOwnerAssistantHandler({service:s,openaiKey:'synthetic',fetcher:async()=>new Response('{}',{status:503})});
 const response=await h(req()),data=await response.json();
 assert.equal(response.status,202);assert.equal(data.state,'QUEUED');assert.equal(data.answer,undefined);
});
test('Database error remains generic; it never returns underlying private details',async()=>{
 const s=harness({rpcError:true}),response=await createOwnerAssistantHandler({service:s})(req());
 assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/private backend error/);
});
