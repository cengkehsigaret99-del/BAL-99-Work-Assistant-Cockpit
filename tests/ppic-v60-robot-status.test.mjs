import test from 'node:test';
import assert from 'node:assert/strict';
import {createRobotStatusHandler,projectRobotStatus,OWNER,ORIGIN} from '../supabase/functions/ppic-robot-status/validation.mjs';

const period='2026-11',id='11111111-1111-4111-8111-111111111111',doc='SYNTHETIC_ROBOT_SOURCE',now='2026-11-20T12:00:00+00:00';
const fact={key:'stock_negative',label:'Saldo uji sintetis',value:-7,unit:'pack',scope:'SYNTHETIC',source_sheet:'TEST',source_range:'A1',quality:'SOURCE',note:'Contoh bukan data pabrik.'};
const ref={document_id:doc,fact_keys:['stock_negative']};
const fixture=()=>({
  ok:true,period,config:{enabled:true,cadence:'HOURLY',timezone:'Asia/Jakarta',automation_id:'Automation_synthetic_fixture',last_check_at:now,last_success_at:now,last_message:'Pemeriksaan selesai.',last_error:null},
  health:{state:'HEALTHY',message:'Status layanan terpantau.',source_changed_since_brief:false,has_unextracted_sources:false},
  latest_brief:{id,period,as_of:'2026-11-20',evidence_hash:'a'.repeat(64),created_at:now,payload:{
    schema_version:'ppic-robot-brief-v1',headline:'Pemeriksaan contoh',summary:'Saldo contoh membutuhkan pemeriksaan sumber.',operating_status:'PERLU_PERHATIAN',as_of:'2026-11-20',
    decisions:[{id:'TEST_1',priority:'P1',title:'Periksa contoh',recommendation:'Cocokkan catatan contoh.',reason:'Saldo contoh negatif.',consequence:'Kesimpulan belum final.',kind:'ADMIN_FOLLOWUP',owner_role:'Admin contoh',evidence:[ref],confidence:'TINGGI',data_limit:'Sumber sintetis.',action_state:'USULAN'}],
    watchlist:[{division:'BARANG JADI',status:'PERLU_PERHATIAN',summary:'Pemeriksaan contoh.',evidence:[ref]}],work_completed:[],pending_data:[],limitations:['Hanya data sintetis.']
  }},
  history:[],coverage:[{division:'BARANG JADI',source_document_id:doc,source_version:'V001',source_cutoff:'2026-11-19',reconciliation_status:'OPEN RECON',has_facts:true,selection_status:'READY',report_cutoff:'2026-11-18',report_version:'V001',report_status:'OPEN RECON'}],
  evidence_sources:[{document_id:doc,division:'BARANG JADI',version:'V001',cutoff:'2026-11-19',status:'OPEN RECON',facts:[fact,{...fact,key:'unknown_stock',value:null,quality:'MISSING'}],issues:[]}],
  runs:[{id,kind:'MAINTENANCE',status:'SUCCESS',message:'Canary sintetis lulus.',details:{tests_passed:3,tests_failed:0,check_name:'SYNTHETIC'},created_at:now}],
  counts:{sources_with_facts:1,pending_fact_sources:0,decisions:1,owner_decisions:0},import_counts:{total:1,queued:0,processing:0,imported:1,duplicate:0,failed:0}
});
function service(options={}) {
  const calls=[];
  return {calls,auth:{async getUser(token){calls.push({auth:token});if(options.authThrows)throw Error('secret raw error');return {data:{user:{id:options.user??OWNER}},error:options.authError??null};}},
    async rpc(name,args){calls.push({name,args});if(options.rpcThrows)throw Error('secret rpc error');return {data:options.data??fixture(),error:options.rpcError??null};}};
}
function request({origin=ORIGIN,method='POST',body=JSON.stringify({period}),auth='Bearer synthetic-owner-token',url='https://example.invalid/functions/v1/ppic-robot-status',headers={}}={}) {
  return new Request(url,{method,headers:{...(origin===null?{}:{origin}),...(auth===null?{}:{authorization:auth}),'content-type':'application/json',...headers},...(['POST','PUT','PATCH'].includes(method)?{body}:{})});
}

test('verified Owner receives the allowlisted status and separate source/report dates',async()=>{
 const s=service(),response=await createRobotStatusHandler({service:s})(request()),body=await response.json();
 assert.equal(response.status,200);assert.equal(body.ok,true);assert.equal(body.coverage[0].source_cutoff,'2026-11-19');assert.equal(body.coverage[0].report_cutoff,'2026-11-18');
 assert.equal(body.evidence_sources[0].facts[0].value,-7);assert.equal(body.evidence_sources[0].facts[1].value,null);
 assert.deepEqual(s.calls[1],{name:'ppic_robot_status',args:{p_period:period}});
 assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('access-control-allow-origin'),ORIGIN);
});
test('exact Origin is required before any authentication or database call',async()=>{
 for(const origin of [null,'null',ORIGIN+'/',ORIGIN+'.evil.invalid','http://cengkehsigaret99-del.github.io']){
  const s=service(),response=await createRobotStatusHandler({service:s})(request({origin}));assert.equal(response.status,403);assert.deepEqual(s.calls,[]);assert.equal(response.headers.get('access-control-allow-origin'),null);
 }
});
test('preflight is read-only and only POST is offered',async()=>{
 const s=service(),response=await createRobotStatusHandler({service:s})(request({method:'OPTIONS',auth:null}));assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-methods'),'POST,OPTIONS');assert.deepEqual(s.calls,[]);
 for(const method of ['GET','DELETE','PUT'])assert.equal((await createRobotStatusHandler({service:s})(request({method}))).status,405);
});
test('missing or malformed bearer fails before calling Supabase',async()=>{
 for(const auth of [null,'','synthetic-owner-token','Basic abc','Bearer a b']){const s=service();assert.equal((await createRobotStatusHandler({service:s})(request({auth}))).status,401);assert.deepEqual(s.calls,[]);}
});
test('non-Owner and auth errors cannot query the status RPC',async()=>{
 for(const options of [{user:'22222222-2222-4222-8222-222222222222'},{authError:{message:'raw secret'}}]){
  const s=service(options),response=await createRobotStatusHandler({service:s})(request());assert.equal(response.status,403);assert.equal(s.calls.length,1);assert.doesNotMatch(await response.text(),/raw secret/);
 }
 const s=service({authThrows:true});assert.equal((await createRobotStatusHandler({service:s})(request())).status,503);assert.equal(s.calls.length,1);
});
test('invalid, missing, mismatched and oversized periods are rejected',async()=>{
 for(const body of ['{}','[]','null','{"period":"2026-13"}','{"period":202611}','{"period":"2026-11","extra":1}','{bad',JSON.stringify({period,padding:'x'.repeat(2200)})]){
  const s=service(),response=await createRobotStatusHandler({service:s})(request({body}));assert.equal(response.status,400);assert.equal(s.calls.length,1);
 }
 for(const url of ['https://example.invalid/status?period=2026-10','https://example.invalid/status?token=bad']){
  const s=service();assert.equal((await createRobotStatusHandler({service:s})(request({url}))).status,400);assert.equal(s.calls.length,1);
 }
});
test('raw RPC errors and malformed status data fail closed without leaking errors',async()=>{
 for(const options of [{rpcError:{message:'download_url=private raw error'}},{rpcThrows:true},{data:{ok:true,period:'2026-10'}}]){
  const response=await createRobotStatusHandler({service:service(options)})(request());assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/private raw|download_url|secret rpc/);
 }
});
test('projection omits private locators, payload hashes, secrets and unexpected keys at every level',()=>{
 const data=fixture();data.download_url='https://private.invalid/?sig=hidden';data.config.secret='hidden';data.evidence_sources[0].private_locator='private/path';
 data.evidence_sources[0].facts[0].secret='hidden';data.latest_brief.payload.secret='hidden';data.latest_brief.payload.decisions[0].secret='hidden';
 data.runs[0].details.nonce='hidden';data.runs[0].message='See https://private.invalid/?sig=hidden Bearer synthetic-hidden';
 const result=JSON.stringify(projectRobotStatus(data,period));assert.doesNotMatch(result,/private\.invalid|sig=|private_locator|download_url|nonce|synthetic-hidden|"secret"/);assert.match(result,/alamat disembunyikan/);
});
test('current coverage may differ from saved evidence without losing old provenance',()=>{
 const data=fixture();data.health.source_changed_since_brief=true;data.coverage[0].source_document_id='SYNTHETIC_NEW_SOURCE';data.coverage[0].source_cutoff='2026-11-20';data.coverage[0].has_facts=false;data.coverage[0].selection_status='MISSING_FACTS';
 const result=projectRobotStatus(data,period);assert.equal(result.health.source_changed_since_brief,true);assert.equal(result.latest_brief.payload.decisions[0].evidence[0].document_id,doc);assert.equal(result.evidence_sources[0].document_id,doc);
});
test('dangling fact/document references and non-proposal action states are rejected',()=>{
 for(const mutate of [d=>d.latest_brief.payload.decisions[0].evidence[0].document_id='UNKNOWN_DOCUMENT',d=>d.latest_brief.payload.decisions[0].evidence[0].fact_keys=['missing_key'],d=>d.latest_brief.payload.decisions[0].action_state='EXECUTED']){
  const data=structuredClone(fixture());mutate(data);assert.throws(()=>projectRobotStatus(data,period));
 }
});
test('invalid facts cannot become numeric zero or approved facts',()=>{
 for(const value of [true,{},Infinity,Number.MAX_SAFE_INTEGER+1]){const data=structuredClone(fixture());data.evidence_sources[0].facts[0].value=value;assert.throws(()=>projectRobotStatus(data,period));}
 const data=structuredClone(fixture());data.evidence_sources[0].facts[1].value=0;assert.throws(()=>projectRobotStatus(data,period));
});
test('bounded lists and missing canary evidence cannot be silently promoted to success',()=>{
 const data=fixture();data.runs[0].status='UNVERIFIED';assert.throws(()=>projectRobotStatus(data,period));
 const huge=fixture();huge.latest_brief.payload.decisions=Array(11).fill(huge.latest_brief.payload.decisions[0]);assert.throws(()=>projectRobotStatus(huge,period));
});
test('unconfigured robot with no briefing remains explicit and usable',()=>{
 const data=fixture();data.config.enabled=false;data.config.automation_id=null;data.config.last_check_at=null;data.config.last_success_at=null;data.health.state='DISABLED';data.latest_brief=null;data.evidence_sources=[];data.counts.decisions=0;
 const result=projectRobotStatus(data,period);assert.equal(result.latest_brief,null);assert.equal(result.config.enabled,false);assert.equal(result.health.state,'DISABLED');
});
