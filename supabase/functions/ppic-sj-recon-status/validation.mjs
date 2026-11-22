// BAL PPIC: only the authenticated Owner can read prevalidated cross-book audit snapshots.
export const ORIGIN="https://cengkehsigaret99-del.github.io";
const RE_PERIOD=/^20\d{2}-(0[1-9]|1[0-2])$/,SHA=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const CODES=new Set(["DO_BJ_LINES_MATCH","SJ334_IDENTICAL_BOOK","BJ_BOOK_ROLLFORWARD","CASH_23_SJ_WORKING_MATCH","CASH_PAYMENT_SJ334_ALLOCATION","PPIC_ACTIVE_BJ_CUTOFF"]);
const STATES=new Set(["PASS","OPEN_RECON","STALE_SOURCE","NOT_COMPARABLE","FAIL"]);
const RISKS=new Set(["SJ334_POD_MISSING","SJ334_INVOICE_ALLOCATION_MISSING","BJ_LIVE_18NOV_LAGS_WORKBOOK","BJ_NEGATIVE_SKU","A_JI_PENAMPUNG_NOT_BANK_BAL"]);
const err=()=>{throw Error("Invalid cross-book reconciliation");};
const object=x=>x&&typeof x==="object"&&!Array.isArray(x)?x:err();
const array=(x,n)=>Array.isArray(x)&&x.length<=n?x:err();
const string=(v,n=420)=>typeof v==="string"?v.slice(0,n):"";
const integer=(n,max=1e15)=>Number.isSafeInteger(n)&&n>=0&&n<=max?n:err();
const dt=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+"T00:00:00Z"))?x:err();
const time=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))?x:err();
const optionalNumber=x=>x===null?null:integer(x);
function checks(values){
 const data=array(values,20);if(!data.length)err();
 return data.map(v=>{
  const x=object(v);if(!CODES.has(x.code)||!STATES.has(x.state))err();
  return{code:x.code,state:x.state,matched:x.matched===undefined?null:optionalNumber(x.matched),
   checked:x.checked===undefined?null:optionalNumber(x.checked),
   quantity_delta:x.quantity_delta===undefined?null:x.quantity_delta,
   payment_allocated:x.payment_allocated===undefined?null:x.payment_allocated,
   settlement_confirmed:x.settlement_confirmed===true};
 });
}
function exceptions(values){
 return array(values,20).map(v=>{
  const x=object(v);if(!RISKS.has(x.code)||!["HIGH","MEDIUM","LOW"].includes(x.severity))err();
  return{code:x.code,severity:x.severity,division:string(x.division,80),description:string(x.description,400),responsible:string(x.responsible,110)};
 });
}
export function projectCrossBook(payload,period){
 const b=object(payload);if(b.ok!==true||b.period!==period||!RE_PERIOD.test(period))err();
 if(b.ready===false&&b.latest===null)return{ok:true,period,ready:false,latest:null};
 if(b.ready!==true)err();
 const d=object(b.latest);if(d.schema_version!=="ppic-sj-crossbook-v1"||!UUID.test(d.id||"")
   ||d.status!=="BOOK_MATCHED_CASH_OPEN"||d.write_scope!=="ANALYTICS_ONLY"||
   d.official_inventory_updated!==false||d.finance_settlement_confirmed!==false||
   typeof d.do_active_evidence_matches!=="boolean"||typeof d.bj_book_is_current_in_ppic!=="boolean")err();
 const summary=object(d.summary),cash=object(d.cash_context),sources=object(d.source_provenance);
 for(const key of ["do_sha256","bj_sha256","kas_sha256","audit_sha256"])if(!SHA.test(sources[key]||""))err();
 if(integer(summary.do_bj_total_lines_checked)!==37||integer(summary.do_bj_lines_matched)!==37
   ||summary.do_bj_qty_difference_pack!==0||integer(summary.do_total_pack)!==621995
   ||integer(summary.bj_total_delivery_pack)!==621995)err();
 const docChecks=checks(d.checks);
 if(!docChecks.some(x=>x.code==="DO_BJ_LINES_MATCH"&&x.state==="PASS")||
    !docChecks.some(x=>x.code==="CASH_PAYMENT_SJ334_ALLOCATION"&&x.state==="OPEN_RECON"))err();
 return{ok:true,period,ready:true,latest:{
   id:d.id,status:d.status,created_at:time(d.created_at),cutoff:dt(d.cutoff),sj_no:integer(d.sj_no,1e8),
   do_active_evidence_matches:d.do_active_evidence_matches,bj_book_is_current_in_ppic:d.bj_book_is_current_in_ppic,
   bj_active_cutoff:d.bj_active_cutoff?dt(d.bj_active_cutoff):null,
   cash_active_cutoff:d.cash_active_cutoff?dt(d.cash_active_cutoff):null,
   summary:{
     customer:string(summary.customer,110),sku:string(summary.sku,30),date:dt(summary.date),
     pack:integer(summary.pack),cartons:integer(summary.cartons),working_price_per_pack:integer(summary.working_price_per_pack),
     working_nominal_rp:integer(summary.working_nominal_rp),
     do_bj_lines_matched:integer(summary.do_bj_lines_matched),
     do_bj_total_lines_checked:integer(summary.do_bj_total_lines_checked),
     do_bj_qty_difference_pack:summary.do_bj_qty_difference_pack,
     do_total_sj:integer(summary.do_total_sj),do_total_pack:integer(summary.do_total_pack),
     bj_book_closing_pack:integer(summary.bj_book_closing_pack),
     all_do_working_nominal_rp:integer(summary.all_do_working_nominal_rp),
     cash_v16_do_reference_nominal_rp:integer(summary.cash_v16_do_reference_nominal_rp),
     team_aji_working_do_to_sj334_rp:integer(summary.team_aji_working_do_to_sj334_rp),
     team_aji_working_do_prior_sj311_333_rp:integer(summary.team_aji_working_do_prior_sj311_333_rp)
   },
   cash_context:{
     sj334_explicit_allocation_rp:cash.sj334_explicit_allocation_rp===null?null:integer(cash.sj334_explicit_allocation_rp),
     sj334_payment_status:string(cash.sj334_payment_status,80),
     team_aji_transfer_evidence_rp:integer(cash.team_aji_transfer_evidence_rp),
     transfer_scope:string(cash.transfer_scope,120)
   },
   checks:docChecks,exceptions:exceptions(d.exceptions),
   source_provenance:{do_sha256:sources.do_sha256,bj_sha256:sources.bj_sha256,kas_sha256:sources.kas_sha256},
   finance_settlement_confirmed:false,official_inventory_updated:false
 }};
}
async function parseBody(req){
 if(!req.body)err();const reader=req.body.getReader(),parts=[];let size=0;
 try{for(;;){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1024){await reader.cancel();err();}parts.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let index=0;for(const part of parts){bytes.set(part,index);index+=part.byteLength;}
 let parsed;try{parsed=JSON.parse(new TextDecoder().decode(bytes));}catch{err();}
 if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)||Object.keys(parsed).length!==1||!RE_PERIOD.test(parsed.period||""))err();
 return parsed;
}
const json=(v,status=200,extra={})=>new Response(JSON.stringify(v),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff",...extra}});
export function createCrossBookHandler({service}={}){
 if(!service)throw Error("Missing database service");
 const cors={"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};
 return async req=>{
  if(req.headers.get("origin")!==ORIGIN)return json({ok:false,error:"Origin tidak diizinkan"},403);
  if(req.method==="OPTIONS")return json({ok:true},200,cors);
  if(req.method!=="POST")return json({ok:false,error:"Metode tidak diizinkan"},405,cors);
  const auth=req.headers.get("authorization")||"";
  if(!/^Bearer\s+\S{1,8192}$/i.test(auth))return json({ok:false,error:"Sesi Owner diperlukan"},401,cors);
  let owner;
  try{const result=await service.auth.getUser(auth.replace(/^Bearer\s+/i,""));if(result.error||!result.data?.user?.id)throw Error("invalid owner");owner=result.data.user.id;}
  catch{return json({ok:false,error:"Sesi Owner tidak terverifikasi"},403,cors);}
  let body;try{body=await parseBody(req);}catch{return json({ok:false,error:"Periode tidak valid"},400,cors);}
  try{
   const r=await service.rpc("ppic_sj_crossbook_reconciliation",{p_owner:owner,p_period:body.period});
   if(r.error||!r.data)throw Error("unavailable");
   return json(projectCrossBook(r.data,body.period),200,cors);
  }catch{return json({ok:false,error:"Rekonsiliasi DO–Barang Jadi–Kas belum dapat dibaca"},503,cors);}
 };
}
