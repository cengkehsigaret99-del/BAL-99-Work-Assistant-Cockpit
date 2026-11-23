import test from 'node:test';
import assert from 'node:assert/strict';
import {projectDaily,createDailyHandler,ORIGIN} from '../supabase/functions/ppic-daily-intelligence/validation.mjs';
const period='2026-11',owner='11111111-1111-4111-8111-111111111111';
const fixture=()=>({ok:true,period,ready:true,latest:{
 schema_version:'ppic-daily-intelligence-v1',id:'22222222-2222-4222-8222-222222222222',
 as_of:'2026-11-23',created_at:'2026-11-23T15:10:00Z',
 state:'WORKING_OPEN_RECON',write_scope:'READ_ONLY_WORKING_REFERENCES',source_fingerprint:'a'.repeat(64),
 skt_revision_current:true,ppic_evidence_current:true,posting_done:false,
 source_rows:[{division:'BARANG JADI',source_status:'CANDIDATE_OPEN_RECON',basis:'ORIGINAL_XLSX',
  book_cutoff:'2026-11-23',active_cutoff:'2026-11-18',
  source_label:'Sumber asli BJ 23 Nov',note:'Tidak otomatis siap kirim',source_binary_verified:true,
  source_digest:'SECRET_SHA',library_file_id:'SECRET_ID',
  metrics:[{label:'Saldo buku kandidat',value:481125,unit:'pack',quality:'REFERENCE'}]},
 {division:'CUKAI',source_status:'CANDIDATE_OPEN_RECON',basis:'ORIGINAL_XLSX',book_cutoff:'2026-11-23',active_cutoff:'2026-11-20',
  source_label:'Sumber pita 23 Nov',note:'Belum diposting ke robot Cukai',source_binary_verified:true,
  metrics:[{label:'Buku pita kandidat',value:650145,unit:'keping',quality:'REFERENCE'}]},
 {division:'WEB SKT',source_status:'SKT_TERCATAT',basis:'WEB_SKT_FORM',book_cutoff:'2026-11-23',active_cutoff:null,
  source_label:'Mirror 159 formulir',note:'Bukan backup lengkap',metrics:[{label:'Formulir',value:159,unit:'form',quality:'SOURCE'}]}],
 kpi_rows:[{label:'BJ kandidat',value:481125,unit:'pack',quality:'REFERENCE'}],
 exceptions:[{priority:'P1',code:'BJ_SOURCE_NOT_POSTED',division:'BARANG JADI',title:'QC belum diuji',secret_email:'SECRET'}],
 next_actions:[{priority:'P1',owner:'Gudang',action:'Periksa bukti penerimaan'}],
 raw_invoice_url:'SECRET_PRIVATE_URL'
}});
function svc({denied=false,error=null,data=fixture()}={}){
 const calls=[];return{calls,auth:{async getUser(token){calls.push(['auth',token]);return denied?{data:{user:null},error:{message:'BAD_SECRET'}}:{data:{user:{id:owner}},error:null};}},
 async rpc(name,args){calls.push(['rpc',name,args]);return{data,error};}};
}
const req=({origin=ORIGIN,method='POST',auth='Bearer synthetic-owner',body={period}}={})=>new Request('https://example.invalid/api',{method,
 headers:{...(origin===null?{}:{origin}),...(auth===null?{}:{authorization:auth}),'content-type':'application/json'},
 ...(['POST','PUT'].includes(method)?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
test('Owner projection distinguishes actual active from candidate and removes private locators',()=>{
 const x=projectDaily(fixture(),period);assert.equal(x.ready,true);
 assert.equal(x.latest.source_rows.length,3);assert.equal(x.latest.source_rows[0].source_status,'CANDIDATE_OPEN_RECON');
 assert.equal(x.latest.source_rows[0].active_cutoff,'2026-11-18');
 assert.equal(x.latest.source_rows[2].metrics[0].value,159);
 assert.doesNotMatch(JSON.stringify(x),/SECRET|library_file_id|raw_invoice_url|source_digest/);
});
test('Cannot present a candidate as posting or fake source quality',()=>{
 const changes=[x=>x.latest.posting_done=true,
 x=>x.latest.write_scope='AUTO_POSTED',x=>x.latest.state='CLOSING_FINAL',
 x=>x.latest.source_rows[0].source_status='LUNAS',
 x=>x.latest.source_rows[0].metrics[0].quality='CONFIRMED_REVENUE',
 x=>x.latest.source_rows.push(x.latest.source_rows[0])];
 for(const fn of changes){const x=fixture();fn(x);assert.throws(()=>projectDaily(x,period));}
});
test('Empty data remains unknown and no zero balance is inferred',()=>{
 assert.deepEqual(projectDaily({ok:true,period,ready:false,latest:null},period),{ok:true,period,ready:false,latest:null});
});
test('Wrong origins, auth and methods are blocked before database call',async()=>{
 for(const origin of [null,'null',ORIGIN+'/','https://attacker.invalid']){
  const s=svc();const r=await createDailyHandler({service:s})(req({origin}));
  assert.equal(r.status,403);assert.deepEqual(s.calls,[]);
 }
 const h=createDailyHandler({service:svc()});
 assert.equal((await h(req({method:'OPTIONS'}))).status,200);
 assert.equal((await h(req({method:'GET'}))).status,405);
 assert.equal((await h(req({auth:null}))).status,401);
 assert.equal((await createDailyHandler({service:svc({denied:true})})(req())).status,403);
});
test('No arbitrary write or malformed period is permitted',async()=>{
 for(const input of ['not-json','{}','[]','{"period":"2026-13"}',
  '{"period":"2026-11","publish":true}',JSON.stringify({period,padding:'x'.repeat(1600)})]){
  const s=svc(),r=await createDailyHandler({service:s})(req({body:input}));
  assert.equal(r.status,400);
  assert.equal(s.calls.filter(x=>x[0]==='rpc').length,0);
 }
});
test('Authenticated request invokes only read-only status RPC and no cache',async()=>{
 const s=svc(),r=await createDailyHandler({service:s})(req()),data=await r.json();
 assert.equal(r.status,200);assert.equal(data.latest.source_rows.length,3);
 assert.deepEqual(s.calls[1],['rpc','ppic_daily_intelligence_status',{p_owner:owner,p_period:period}]);
 assert.equal(r.headers.get('cache-control'),'no-store');
});
test('Private database error never exposed',async()=>{
 const s=svc({error:{message:'SECRET_DATABASE_PASSWORD'}}),r=await createDailyHandler({service:s})(req());
 assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/SECRET_DATABASE_PASSWORD/);
});
