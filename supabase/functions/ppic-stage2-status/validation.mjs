// PPIC Stage 2: source-backed analytical review read endpoint.
export const ORIGIN='https://cengkehsigaret99-del.github.io';
const PERIOD=/^20\d\d-(0[1-9]|1[0-2])$/;
const SHA=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const DIV=new Set(['BAHAN BAKU','BARANG JADI','CUKAI','DO','GILING','KAS BANK','SDM GILING','SDM VERPACK','TSG','VERPACK']);
const STATES=new Set(['OPEN_RECON','BLOCKED']);
const CHECKS=new Set(['PASS','FAIL','INSUFFICIENT','DATE_MISMATCH','NOT_COMPARABLE']);
const severities=new Set(['HIGH','MEDIUM','LOW']);
const quality=new Set(['SOURCE','REFERENCE','ESTIMATE','MISSING']);
const keys=new Set(['cumulative_output_batang','cumulative_output_pack','book_closing_pack','book_delivery_pack','delivered_pack','book_closing_kg','book_closing_keping','not_arrived_keping','material_op_07_closing','sku_c_025_book_pack','indicative_balance']);
const isObj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const error=()=>{throw Error('Bad Stage 2 projection');};
const obj=x=>isObj(x)?x:error();
const arr=(x,max)=>Array.isArray(x)&&x.length<=max?x:error();
const str=(x,max=300)=>typeof x==='string'?x.slice(0,max):'';
const safeDate=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x?x:null;
const finite=x=>typeof x==='number'&&Number.isFinite(x)&&Number.isSafeInteger(Math.floor(Math.abs(x)))?x:null;
const dateTime=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(x)&&Number.isFinite(Date.parse(x))?x:null;
function pickIndicator(r){
 const f=obj(r);
 if(!keys.has(f.key)||!quality.has(f.quality))return null;
 const value=f.quality==='MISSING'?null:finite(f.value);
 if(f.value!==null&&value===null&&f.quality!=='MISSING')return null;
 return {key:f.key,label:str(f.label,150),value,unit:str(f.unit,30),quality:f.quality,
  document_id:str(f.document_id,150),source_sheet:str(f.source_sheet,80),source_range:str(f.source_range,50)};
}
export function projectStage2(body,period){
 const b=obj(body);
 if(b.ok!==true||b.period!==period||!PERIOD.test(period))error();
 if(b.ready===false&&b.latest===null)return {ok:true,period,ready:false,latest:null};
 if(b.ready!==true)error();
 const s=obj(b.latest);
 if(s.schema_version!=='ppic-stage2-review-v1'||!UUID.test(s.id||'')||!SHA.test(s.evidence_hash||'')||!STATES.has(s.status))error();
 if(!Number.isInteger(s.source_count)||s.source_count<1||s.source_count>10
   ||!Number.isInteger(s.archived_source_count)||s.archived_source_count<0||s.archived_source_count>s.source_count)error();
 const checks=arr(s.checks,20).map(x=>{const c=obj(x);if(!CHECKS.has(c.state)||!str(c.code,80))error();
  return {code:str(c.code,80),state:c.state,division:str(c.division,90),message:str(c.message,500),computed:finite(c.computed),reported:finite(c.reported),do_pack:finite(c.do_pack),bj_pack:finite(c.bj_pack),unit:str(c.unit,30)};});
 const warnings=arr(s.warnings,40).map(x=>{const w=obj(x);if(!severities.has(w.severity)||!str(w.code,80))error();
  return {code:str(w.code,80),severity:w.severity,division:str(w.division,90),message:str(w.message,550),
    source_cutoff:w.source_cutoff?safeDate(w.source_cutoff):null,report_cutoff:w.report_cutoff?safeDate(w.report_cutoff):null};});
 const coverage=arr(s.coverage,15).map(x=>{const c=obj(x);if(!DIV.has(c.division))error();
  return {division:c.division,source_cutoff:c.source_cutoff?safeDate(c.source_cutoff):null,report_cutoff:c.report_cutoff?safeDate(c.report_cutoff):null,
   source_version:str(c.source_version,20),report_version:str(c.report_version,20),report_status:str(c.report_status,60),
   has_facts:c.has_facts===true,selection_status:str(c.selection_status,35)};});
 const indicators={};for(const division of DIV){const val=s.indicators?.[division];if(!Array.isArray(val))continue;
  indicators[division]=arr(val,20).map(pickIndicator).filter(Boolean);
 }
 return {ok:true,period,ready:true,latest:{
  id:s.id,evidence_hash:s.evidence_hash,status:s.status,source_count:s.source_count,archived_source_count:s.archived_source_count,
  created_at:dateTime(s.created_at),coverage,checks,warnings,indicators
 }};
}
async function boundedBody(req){
 if(!req.body)error();const reader=req.body.getReader();let size=0;const parts=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1024){await reader.cancel();error();}parts.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.byteLength;}
 const raw=new TextDecoder().decode(bytes);let v;try{v=JSON.parse(raw);}catch{error();}
 if(!isObj(v)||Object.keys(v).length!==1||!PERIOD.test(v.period||''))error();
 return v;
}
const asJSON=(data,status=200,headers={})=>new Response(JSON.stringify(data),{
 status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}
});
export function createStage2Handler({service}={}){
 if(!service)throw Error('Missing service');
 const cors={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
 return async req=>{
  if(req.headers.get('origin')!==ORIGIN)return asJSON({ok:false,error:'Origin tidak diizinkan'},403);
  if(req.method==='OPTIONS')return asJSON({ok:true},200,cors);
  if(req.method!=='POST')return asJSON({ok:false,error:'Metode tidak diizinkan'},405,cors);
  const auth=req.headers.get('authorization')||'';
  if(!/^Bearer\s+\S{1,8192}$/.test(auth))return asJSON({ok:false,error:'Login Owner diperlukan'},401,cors);
  let user;try{
   const a=await service.auth.getUser(auth.replace(/^Bearer\s+/,''));
   if(a.error||!a.data?.user?.id)throw Error('Unauthorized');user=a.data.user;
  }catch{return asJSON({ok:false,error:'Sesi Owner tidak dapat diverifikasi'},403,cors);}
  let body;try{body=await boundedBody(req);}catch{return asJSON({ok:false,error:'Periode tidak valid'},400,cors);}
  try{
   const r=await service.rpc('ppic_stage2_status',{p_owner:user.id,p_period:body.period});
   if(r.error||!r.data)throw Error('Source unavailable');
   return asJSON(projectStage2(r.data,body.period),200,cors);
  }catch{return asJSON({ok:false,error:'Rekonsiliasi Tahap 2 belum tersedia'},503,cors);}
 };
}
