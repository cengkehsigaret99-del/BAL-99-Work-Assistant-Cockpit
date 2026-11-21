import test from 'node:test';
import assert from 'node:assert/strict';
import {projectDOHealth,createDOHealthHandler,ORIGIN} from '../supabase/functions/ppic-do-sync-health/validation.mjs';
const period='2026-11',owner='11111111-1111-4111-8111-111111111111';
const fixtures=()=>({ok:true,period,ready:true,configured:true,latest:{
 schema_version:'ppic-do-auto-sync-v1',status:'SYNCED_WORKING',cutoff:'2026-11-21',
 published_at:'2026-11-21T11:49:35.736Z',source_version:'V012',report_version:'V015',
 total_sj:24,total_lines:37,total_pack:621995,total_nominal:4474760000,last_sj:334,last_sj_lines:1,
 bj_source_cutoff:'2026-11-18',bj_book_delivery_pack:617995,cross_division_state:'CUTOFF_DIFFERENT',
 official_books_changed:false,is_latest:true,
 checks:['SOURCE_REGISTERED','FACTS_MATCH','FULL_DO_LINES','DAILY_DO_TOTALS','REPORT_DO_09'].map(code=>({code,pass:true,raw_db_credentials:'PRIVATE'})),
 pending:[{code:'BJ_QC_AND_CUTOFF',owner_role:'Admin Barang Jadi / QC',description:'Periksa SJ334 dan QC',personal_name:'PRIVATE'},
  {code:'KAS_INVOICE',owner_role:'Kas',description:'Cocokkan invoice baru'}],
 raw_source_url:'PRIVATE_FILE_URL',customer_bank_account:'PRIVATE_BANK'
}});
function service({denied=false,data=fixtures(),error=null}={}){
 const calls=[];return {calls,auth:{async getUser(token){calls.push(['auth',token]);return denied?{error:{message:'PRIVATE JWT'},data:{user:null}}:{error:null,data:{user:{id:owner}}};}},
 async rpc(name,args){calls.push(['rpc',name,args]);return {data,error};}};
}
function request({origin=ORIGIN,method='POST',token='Bearer synthetic-owner',body={period}}={}){
 return new Request('https://example.invalid/functions/v1/ppic-do-sync-health',{method,
  headers:{...(origin===null?{}:{origin}),...(token===null?{}:{authorization:token}),'content-type':'application/json'},
  ...(['POST','PUT'].includes(method)?{body:typeof body==='string'?body:JSON.stringify(body)}:{})
 });}
test('Working snapshot is immutable and projects only allowed totals',()=>{
 const result=projectDOHealth(fixtures(),period);
 assert.equal(result.latest.status,'SYNCED_WORKING');assert.equal(result.latest.total_sj,24);
 assert.equal(result.latest.total_pack,621995);assert.equal(result.latest.total_nominal,4474760000);
 assert.equal(result.latest.cross_division_state,'CUTOFF_DIFFERENT');
 assert.equal(result.latest.checks.filter(x=>x.pass).length,5);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE|BANK|raw_source_url|customer_bank_account|personal_name/);
});
test('Integrity failing cannot appear as synced',()=>{
 for(const mutate of [
  x=>x.latest.checks[0].pass=false,
  x=>x.latest.official_books_changed=true,
  x=>x.latest.is_latest=false,
  x=>x.latest.source_version='V12',
  x=>x.latest.cross_division_state='DONE',
  x=>x.latest.total_pack=-1
 ]){const f=fixtures();mutate(f);assert.throws(()=>projectDOHealth(f,period));}
});
test('Explicit missing receipt does not claim source automatically published',()=>{
 assert.deepEqual(projectDOHealth({ok:true,period,ready:false,configured:true,latest:null},period),
   {ok:true,period,ready:false,configured:true,latest:null});
});
test('Wrong origin blocked before auth, wrong methods and missing bearer fail closed',async()=>{
 for(const origin of [null,'null',ORIGIN+'/','https://wrong.example']){
  const s=service(),r=await createDOHealthHandler({service:s})(request({origin}));
  assert.equal(r.status,403);assert.deepEqual(s.calls,[]);
 }
 const h=createDOHealthHandler({service:service()});
 assert.equal((await h(request({method:'OPTIONS'}))).status,200);
 assert.equal((await h(request({method:'GET'}))).status,405);
 assert.equal((await h(request({token:null}))).status,401);
 assert.equal((await createDOHealthHandler({service:service({denied:true})})(request())).status,403);
});
test('Body has only one period, never a publish command',async()=>{
 for(const data of ['','not-json','[]','{"period":"2026-13"}',
 '{"period":"2026-11","do_publish":true}',JSON.stringify({period,padding:'x'.repeat(1500)})]){
  const s=service(),response=await createDOHealthHandler({service:s})(request({body:data}));
  assert.equal(response.status,400);assert.equal(s.calls.some(c=>c[0]==='rpc'),false);
 }
});
test('Owner only reads the expected SQL RPC with no-cache response',async()=>{
 const s=service(),r=await createDOHealthHandler({service:s})(request()),d=await r.json();
 assert.equal(r.status,200);assert.equal(d.latest.total_sj,24);
 assert.deepEqual(s.calls[1],['rpc','ppic_do_auto_sync_status',{p_owner:owner,p_period:period}]);
 assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('access-control-allow-origin'),ORIGIN);
});
test('Internal database and authorization errors never leaked',async()=>{
 const s=service({error:{message:'PRIVATE_DB_FAILURE'}}),r=await createDOHealthHandler({service:s})(request());
 assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/PRIVATE_DB_FAILURE/);
});
