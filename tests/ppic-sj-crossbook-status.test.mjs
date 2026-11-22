import test from 'node:test';
import assert from 'node:assert/strict';
import {projectCrossBook,createCrossBookHandler,ORIGIN} from '../supabase/functions/ppic-sj-recon-status/validation.mjs';
const period='2026-11', owner='11111111-1111-4111-8111-111111111111';
const UUID='22222222-2222-4222-8222-222222222222';
const fixture=()=>({ok:true,period,ready:true,latest:{
 schema_version:'ppic-sj-crossbook-v1',id:UUID,sj_no:334,cutoff:'2026-11-21',created_at:'2026-11-22T13:58:42.285Z',
 status:'BOOK_MATCHED_CASH_OPEN',write_scope:'ANALYTICS_ONLY',
 do_active_evidence_matches:true,bj_book_is_current_in_ppic:false,bj_active_cutoff:'2026-11-18',cash_active_cutoff:'2026-11-20',
 summary:{customer:'TRI SUKMA AJI',sku:'C-036',date:'2026-11-21',pack:4000,cartons:5,working_price_per_pack:8500,
 working_nominal_rp:34000000,do_bj_lines_matched:37,do_bj_total_lines_checked:37,do_bj_qty_difference_pack:0,
 do_total_sj:24,do_total_pack:621995,bj_total_delivery_pack:621995,bj_book_closing_pack:410125,
 all_do_working_nominal_rp:4474760000,cash_v16_do_reference_nominal_rp:4440760000,
 team_aji_working_do_to_sj334_rp:221900000,team_aji_working_do_prior_sj311_333_rp:187900000},
 cash_context:{sj334_explicit_allocation_rp:null,sj334_payment_status:'BELUM_TERVERIFIKASI',
 team_aji_transfer_evidence_rp:108000000,transfer_scope:'REKENING_PENAMPUNG_BUKAN_OTOMATIS_BCA_BAL',raw_payee_bank:'PRIVATE'},
 checks:[{code:'DO_BJ_LINES_MATCH',state:'PASS',checked:37,matched:37,quantity_delta:0},
 {code:'SJ334_IDENTICAL_BOOK',state:'PASS'},
 {code:'BJ_BOOK_ROLLFORWARD',state:'PASS'},
 {code:'CASH_23_SJ_WORKING_MATCH',state:'PASS'},
 {code:'CASH_PAYMENT_SJ334_ALLOCATION',state:'OPEN_RECON',payment_allocated:null,settlement_confirmed:false},
 {code:'PPIC_ACTIVE_BJ_CUTOFF',state:'STALE_SOURCE'}],
 exceptions:[{code:'SJ334_INVOICE_ALLOCATION_MISSING',division:'KAS BANK',severity:'HIGH',description:'SJ334 belum dialokasikan di Kas V16',responsible:'Finance',private_account:'PRIVATE_ACCOUNT'}],
 source_provenance:{do_sha256:'a'.repeat(64),bj_sha256:'b'.repeat(64),kas_sha256:'c'.repeat(64),audit_sha256:'d'.repeat(64),raw_private_locator:'PRIVATE'},
 official_inventory_updated:false,finance_settlement_confirmed:false,private_payload:'PRIVATE'
}});
function service({denied=false,error=null,data=fixture()}={}){
 const calls=[];return{calls,auth:{async getUser(token){calls.push(['auth',token]);return denied?{error:{message:'private'},data:{user:null}}:{error:null,data:{user:{id:owner}}};}},
 async rpc(name,args){calls.push(['rpc',name,args]);return{error,data};}};
}
const req=({origin=ORIGIN,method='POST',auth='Bearer test-owner',body={period}}={})=>new Request('https://invalid.test',{method,headers:{...(origin===null?{}:{origin}),...(auth===null?{}:{authorization:auth}),'content-type':'application/json'},
 ...(['POST','PUT'].includes(method)?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
test('Owner projection shows matched DO/BJ, cash open and hides private payload',()=>{
 const x=projectCrossBook(fixture(),period);
 assert.equal(x.latest.summary.do_bj_lines_matched,37);assert.equal(x.latest.summary.do_bj_qty_difference_pack,0);
 assert.equal(x.latest.summary.working_nominal_rp,34000000);
 assert.equal(x.latest.cash_context.sj334_explicit_allocation_rp,null);
 assert.equal(x.latest.bj_book_is_current_in_ppic,false);
 assert.doesNotMatch(JSON.stringify(x),/PRIVATE|raw_private_locator|private_account|raw_payee_bank/);
});
test('Cannot present completed settlement or inventory posting as audited status',()=>{
 const variants=[
  x=>x.latest.finance_settlement_confirmed=true,
  x=>x.latest.official_inventory_updated=true,
  x=>x.latest.summary.do_bj_lines_matched=36,
  x=>x.latest.summary.bj_total_delivery_pack=621994,
  x=>x.latest.status='FINANCE_SETTLED',
  x=>x.latest.checks[0].code='INVOKE_PAYMENT'
 ];
 for(const bad of variants){const d=fixture();bad(d);assert.throws(()=>projectCrossBook(d,period));}
});
test('No saved snapshot returns an explicit empty status',()=>{
 assert.deepEqual(projectCrossBook({ok:true,ready:false,latest:null,period},period),{ok:true,ready:false,latest:null,period});
});
test('Blocks origins, methods and bearer violations before DB call',async()=>{
 for(const origin of [null,'null',ORIGIN+'/','https://attacker.invalid']){
  const s=service();const response=await createCrossBookHandler({service:s})(req({origin}));assert.equal(response.status,403);assert.deepEqual(s.calls,[]);
 }
 const h=createCrossBookHandler({service:service()});
 assert.equal((await h(req({method:'OPTIONS'}))).status,200);
 assert.equal((await h(req({method:'GET'}))).status,405);
 assert.equal((await h(req({auth:null}))).status,401);
 assert.equal((await createCrossBookHandler({service:service({denied:true})})(req())).status,403);
});
test('Rejects extra instructions and oversized bodies without a write call',async()=>{
 for(const body of ['{}','not-json','[]','{"period":"2026-13"}',
  '{"period":"2026-11","post_stock":true}',JSON.stringify({period,x:'x'.repeat(1400)})]){
  const s=service();const r=await createCrossBookHandler({service:s})(req({body}));
  assert.equal(r.status,400);assert.equal(s.calls.filter(x=>x[0]==='rpc').length,0);
 }
});
test('Owner request only invokes authorized read RPC',async()=>{
 const s=service(),r=await createCrossBookHandler({service:s})(req()),data=await r.json();
 assert.equal(r.status,200);assert.equal(data.latest.status,'BOOK_MATCHED_CASH_OPEN');
 assert.deepEqual(s.calls[1],['rpc','ppic_sj_crossbook_reconciliation',{p_owner:owner,p_period:period}]);
 assert.equal(r.headers.get('cache-control'),'no-store');
});
test('RPC errors fail closed without exposing private data',async()=>{
 const s=service({error:{message:'PRIVATE_BANK_SECRET'}}),r=await createCrossBookHandler({service:s})(req());
 assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/PRIVATE_BANK_SECRET/);
});
