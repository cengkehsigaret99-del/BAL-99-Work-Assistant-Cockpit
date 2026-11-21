// Private PPIC cross-source freshness watch: never returns raw SKT forms or personnel records.
export const ORIGIN='https://cengkehsigaret99-del.github.io';
const PERIOD=/^20\d\d-(0[1-9]|1[0-2])$/,SHA=/^[a-f0-9]{64}$/,REV=/^BAL-MIRROR-[a-f0-9]{64}$/;
const SKT=new Set(['giling','tsg','verpack','barang_jadi','sdm_giling','sdm_verpack','bb_po','bb_receipt','bb_usage','surat_jalan','customer_orders','cukai_pita']);
const PPIC=new Set(['BAHAN BAKU','BARANG JADI','CUKAI','DO','GILING','KAS BANK','SDM GILING','SDM VERPACK','TSG','VERPACK']);
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:(()=>{throw Error('Invalid status');})();
const arr=(x,n)=>Array.isArray(x)&&x.length<=n?x:(()=>{throw Error('Invalid list');})();
const invalid=()=>{throw Error('Invalid watch data');};
const bounded=(x,n=80)=>typeof x==='string'?x.slice(0,n):'';
const int=(x,max)=>Number.isInteger(x)&&x>=0&&x<=max?x:invalid();
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x?x:invalid();
const timestamp=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(x)&&Number.isFinite(Date.parse(x))?x:invalid();
const maybeDate=x=>x===null?null:date(x);
const maybeTime=x=>x===null?null:timestamp(x);
const status=x=>typeof x==='string'&&/^[A-Z_]{3,45}$/.test(x)?x:invalid();
function row(x){
 const r=obj(x);
 if(!SKT.has(r.division)||typeof r.source_complete!=='boolean')invalid();
 return {
  division:r.division,status:status(r.status),report_date:maybeDate(r.report_date),
  last_saved_at:maybeTime(r.last_saved_at),
  document_count:int(r.document_count,10000),transaction_count:int(r.transaction_count,100000),
  document_state:r.document_state===null?null:status(r.document_state),
  document_version:r.document_version===null?null:int(r.document_version,10000),source_complete:r.source_complete
 };
}
function coverage(x){
 const c=obj(x);if(!PPIC.has(c.division))invalid();
 return {
  division:c.division,source_cutoff:maybeDate(c.source_cutoff??null),report_cutoff:maybeDate(c.report_cutoff??null),
  report_status:bounded(c.report_status,60),selection_status:bounded(c.selection_status,40),
  source_version:bounded(c.source_version,25),report_version:bounded(c.report_version,25),
  has_facts:c.has_facts===true
 };
}
function counts(x){
 const m=obj(x),keys=['daily_reports','sj_documents','bb_documents','co_orders','co_realizations','co_allocations','bb_master_entries','total_documents'];const res={};
 for(const k of keys)res[k]=int(m[k],10000000);
 return res;
}
export function projectSKTWatch(data,period){
 const v=obj(data);if(v.ok!==true||v.period!==period||!PERIOD.test(period))invalid();
 if(v.ready===false&&v.latest===null)return {ok:true,period,ready:false,latest:null};
 if(v.ready!==true)invalid();
 const s=obj(v.latest);
 if(s.schema_version!=='ppic-skt-freshness-v1'||!REV.test(s.revision||'')||!SHA.test(s.ppic_evidence_hash||''))invalid();
 const receipts=arr(s.status_receipts,3).map(r=>{
  const item=obj(r),rows=arr(item.rows,15).map(row);
  if(new Set(rows.map(v=>v.division)).size!==rows.length)invalid();
  return {business_date:date(item.business_date),checked_at:timestamp(item.checked_at),rows};
 });
 const c=arr(s.ppic_coverage,15).map(coverage);
 return {ok:true,ready:true,period,latest:{
  revision:s.revision,captured_at:timestamp(s.captured_at),counts:counts(s.counts),
  status_receipts:receipts,ppic_coverage:c,ppic_evidence_hash:s.ppic_evidence_hash
 }};
}
async function readBody(req){
 if(!req.body)invalid();const chunks=[];const reader=req.body.getReader();let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1024){await reader.cancel();invalid();}chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let i=0;for(const part of chunks){bytes.set(part,i);i+=part.byteLength;}
 let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{invalid();}
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1||!PERIOD.test(body.period||''))invalid();
 return body;
}
function json(o,code=200,headers={}){return new Response(JSON.stringify(o),{status:code,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});}
export function createSKTWatchHandler({service}={}){
 if(!service)throw Error('Missing database service');
 const cors={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
 return async req=>{
  if(req.headers.get('origin')!==ORIGIN)return json({ok:false,error:'Origin tidak diizinkan'},403);
  if(req.method==='OPTIONS')return json({ok:true},200,cors);
  if(req.method!=='POST')return json({ok:false,error:'Metode tidak diizinkan'},405,cors);
  const a=req.headers.get('authorization')||'';
  if(!/^Bearer\s+\S{1,8192}$/i.test(a))return json({ok:false,error:'Login Owner diperlukan'},401,cors);
  let owner;try{const user=await service.auth.getUser(a.replace(/^Bearer\s+/i,''));if(user.error||!user.data?.user?.id)throw Error('Auth');owner=user.data.user.id;}
  catch{return json({ok:false,error:'Sesi Owner tidak valid'},403,cors);}
  let input;try{input=await readBody(req);}catch{return json({ok:false,error:'Periode tidak valid'},400,cors);}
  try{
   const r=await service.rpc('ppic_skt_freshness_status',{p_owner:owner,p_period:input.period});
   if(r.error||!r.data)throw Error('Unavailable');
   return json(projectSKTWatch(r.data,input.period),200,cors);
  }catch{return json({ok:false,error:'Status perbandingan SKT dan PPIC belum tersedia'},503,cors);}
 };
}
