import test from 'node:test';
import assert from 'node:assert/strict';
import {projectSKTWatch,createSKTWatchHandler,ORIGIN} from '../supabase/functions/ppic-skt-watch-status/validation.mjs';

const period='2026-11',owner='11111111-1111-4111-8111-111111111111',revision='BAL-MIRROR-'+'a'.repeat(64);
function fixture(){
 return {ok:true,period,ready:true,latest:{schema_version:'ppic-skt-freshness-v1',revision,
 captured_at:'2026-11-21T02:13:44Z',ppic_evidence_hash:'b'.repeat(64),
 counts:{daily_reports:68,sj_documents:23,bb_documents:53,co_orders:7,co_realizations:0,co_allocations:0,bb_master_entries:2,total_documents:151},
 status_receipts:[
  {business_date:'2026-11-21',checked_at:'2026-11-21T02:13:44Z',rows:[
   {division:'tsg',status:'BELUM_LENGKAP',report_date:'2026-11-21',last_saved_at:'2026-11-21T01:18:27Z',document_count:1,transaction_count:0,document_state:'DRAF',document_version:2,source_complete:true},
   {division:'giling',status:'JADWAL_BELUM_DIATUR',report_date:'2026-11-20',last_saved_at:'2026-11-20T12:54:48Z',document_count:0,transaction_count:0,document_state:null,document_version:null,source_complete:true}
  ]},
  {business_date:'2026-11-20',checked_at:'2026-11-20T20:03:04Z',rows:[
   {division:'giling',status:'SUDAH_INPUT',report_date:'2026-11-20',last_saved_at:'2026-11-20T12:54:48Z',document_count:1,transaction_count:1,document_state:'DISETUJUI',document_version:6,source_complete:true},
   {division:'tsg',status:'SUDAH_INPUT',report_date:'2026-11-20',last_saved_at:'2026-11-20T07:37:15Z',document_count:1,transaction_count:2,document_state:'DIAJUKAN',document_version:2,source_complete:true}
  ]}
 ],ppic_coverage:[
  {division:'GILING',source_cutoff:'2026-11-20',report_cutoff:'2026-11-17',report_status:'OPEN RECON',selection_status:'READY',source_version:'V011',report_version:'V001',has_facts:true},
  {division:'TSG',source_cutoff:'2026-11-18',report_cutoff:null,report_status:null,selection_status:'READY',source_version:'V010',report_version:null,has_facts:true}
 ],private_url:'https://private.invalid/?sig=SECRET',admin_notes:'SECRET_PERSON'}};
}
function service({denied=false,data=fixture(),rpcError=null}={}){
 const calls=[];
 return {calls,auth:{async getUser(token){calls.push(['auth',token]);return denied?{data:{user:null},error:{message:'secret'}}:{data:{user:{id:owner}},error:null};}},
 async rpc(name,args){calls.push(['rpc',name,args]);return {data,error:rpcError};}};
}
function req({origin=ORIGIN,method='POST',authorization='Bearer synthetic-token',body={period}}={}){
 return new Request('https://example.invalid/functions/v1/ppic-skt-watch-status',{method,
  headers:{...(origin===null?{}:{origin}),...(authorization===null?{}:{authorization}),'content-type':'application/json'},
  ...(['POST','PUT'].includes(method)?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
}
test('Owner can read only source date, status and counts; private refs/PII stay hidden',()=>{
 const x=projectSKTWatch(fixture(),period);
 assert.equal(x.ready,true);assert.equal(x.latest.counts.total_documents,151);
 assert.equal(x.latest.status_receipts[0].rows[0].document_state,'DRAF');
 assert.equal(x.latest.ppic_coverage[1].report_cutoff,null);
 assert.doesNotMatch(JSON.stringify(x),/SECRET|private_url|admin_notes|private\.invalid/);
});
test('Projection is strict and cannot promote invalid statuses or future schema',()=>{
 const bad=fixture();bad.latest.status_receipts[0].rows[0].status='APPROVE_THIS!';
 assert.throws(()=>projectSKTWatch(bad,period));
 const wrong=fixture();wrong.latest.schema_version='SKT_FORM_FULL_EXPORT';
 assert.throws(()=>projectSKTWatch(wrong,period));
 const dup=fixture();dup.latest.status_receipts[0].rows.push(dup.latest.status_receipts[0].rows[0]);
 assert.throws(()=>projectSKTWatch(dup,period));
});
test('Missing status receipts do not fabricate a production holiday or zero transactions',()=>{
 const x=fixture();x.latest.status_receipts=[];
 assert.equal(projectSKTWatch(x,period).latest.status_receipts.length,0);
 const none=projectSKTWatch({ok:true,ready:false,period,latest:null},period);
 assert.equal(none.ready,false);
});
test('Origin and Owner bearer strictly enforced; no side-effect RPC',async()=>{
 for(const origin of [null,'null','https://attacker.invalid',ORIGIN+'/']){
  const s=service(),r=await createSKTWatchHandler({service:s})(req({origin}));
  assert.equal(r.status,403);assert.deepEqual(s.calls,[]);
 }
 const s=service(),h=createSKTWatchHandler({service:s});
 assert.equal((await h(req({method:'OPTIONS'}))).status,200);
 assert.equal((await h(req({method:'GET'}))).status,405);
 assert.equal((await h(req({authorization:null}))).status,401);
 assert.equal((await createSKTWatchHandler({service:service({denied:true})})(req())).status,403);
});
test('Rejects malformed JSON, unexpected commands and oversized bodies',async()=>{
 for(const body of ['no-json','{}','[]','{"period":"2026-00"}',
 '{"period":"2026-11","execute":true}',JSON.stringify({period,padding:'a'.repeat(1700)})]){
  const s=service(),r=await createSKTWatchHandler({service:s})(req({body}));
  assert.equal(r.status,400);
  assert.equal(s.calls.filter(c=>c[0]==='rpc').length,0);
 }
});
test('Owner read invokes only service-role read RPC and no caching',async()=>{
 const s=service(),r=await createSKTWatchHandler({service:s})(req()),d=await r.json();
 assert.equal(r.status,200);assert.equal(d.latest.status_receipts.length,2);
 assert.deepEqual(s.calls[1],['rpc','ppic_skt_freshness_status',{p_owner:owner,p_period:period}]);
 assert.equal(r.headers.get('Cache-Control'),'no-store');
 assert.equal(r.headers.get('Access-Control-Allow-Origin'),ORIGIN);
});
test('Backend errors fail closed without propagating private error messages',async()=>{
 const s=service({rpcError:{message:'Bearer secret password'}}),r=await createSKTWatchHandler({service:s})(req());
 assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/secret password/);
});
