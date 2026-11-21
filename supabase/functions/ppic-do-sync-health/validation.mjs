// BAL PPIC - Owner-only read-only DO auto-publish health status projection.
export const ORIGIN='https://cengkehsigaret99-del.github.io';
const PERIOD=/^20\d\d-(0[1-9]|1[0-2])$/;
const VERSION=/^V[0-9]{3,6}$/;
const STATES=new Set(['SYNCED_WORKING','INTEGRITY_CHECK_FAILED']);
const CROSS=new Set(['BJ_SOURCE_MISSING','CUTOFF_DIFFERENT','BJ_BOOK_DELIVERY_MISSING','BOOK_MATCH_SAME_DATE','BOOK_DIFFERENCE_SAME_DATE']);
const CODES=new Set(['SOURCE_REGISTERED','FACTS_MATCH','FULL_DO_LINES','DAILY_DO_TOTALS','REPORT_DO_09']);
const PENDING=new Set(['BJ_QC_AND_CUTOFF','KAS_INVOICE','CASH_AND_STOCK_NOT_POSTED']);
const wrong=()=>{throw Error('Invalid DO sync status');};
const object=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:wrong();
const array=(x,n)=>Array.isArray(x)&&x.length<=n?x:wrong();
const short=(x,n=220)=>typeof x==='string'?x.slice(0,n):'';
const integer=(x,max=1e15)=>Number.isSafeInteger(x)&&x>=0&&x<=max?x:wrong();
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x?x:wrong();
const time=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(x)&&Number.isFinite(Date.parse(x))?x:wrong();
export function projectDOHealth(payload,period){
 const b=object(payload);
 if(b.ok!==true||b.period!==period||!PERIOD.test(period)||typeof b.configured!=='boolean')wrong();
 if(b.ready===false&&b.latest===null)return{ok:true,ready:false,period,configured:b.configured,latest:null};
 if(b.ready!==true)wrong();
 const s=object(b.latest);
 if(s.schema_version!=='ppic-do-auto-sync-v1'||!STATES.has(s.status)||!CROSS.has(s.cross_division_state)||
    s.is_latest!==true&&s.is_latest!==false||s.official_books_changed!==false||
    !VERSION.test(s.report_version||'')||!VERSION.test(s.source_version||''))wrong();
 const checks=array(s.checks,7).map(c=>{const x=object(c);if(!CODES.has(x.code)||typeof x.pass!=='boolean')wrong();return {code:x.code,pass:x.pass};});
 if(checks.length!==5||new Set(checks.map(x=>x.code)).size!==5)wrong();
 if(s.status==='SYNCED_WORKING'&&(!s.is_latest||checks.some(x=>!x.pass)))wrong();
 const pending=array(s.pending,6).map(x=>{const k=object(x);if(!PENDING.has(k.code))wrong();
   return{code:k.code,owner_role:short(k.owner_role,120),description:short(k.description,420)};});
 return{ok:true,ready:true,period,configured:b.configured,latest:{
  status:s.status,report_version:s.report_version,source_version:s.source_version,
  cutoff:date(s.cutoff),published_at:time(s.published_at),
  total_sj:integer(s.total_sj,100000),total_lines:integer(s.total_lines,100000),
  total_pack:integer(s.total_pack),total_nominal:integer(s.total_nominal),
  last_sj:s.last_sj===null?null:integer(s.last_sj,1e8),
  last_sj_lines:s.last_sj_lines===null?null:integer(s.last_sj_lines,10000),
  bj_source_cutoff:s.bj_source_cutoff===null?null:date(s.bj_source_cutoff),
  bj_book_delivery_pack:s.bj_book_delivery_pack===null?null:integer(s.bj_book_delivery_pack),
  cross_division_state:s.cross_division_state,official_books_changed:false,
  is_latest:s.is_latest,checks,pending
 }};
}
async function body(req){
 if(!req.body)wrong();const reader=req.body.getReader(),parts=[];let size=0;
 try{for(;;){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1024){await reader.cancel();wrong();}parts.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let idx=0;for(const part of parts){bytes.set(part,idx);idx+=part.byteLength;}
 let obj;try{obj=JSON.parse(new TextDecoder().decode(bytes));}catch{wrong();}
 if(!obj||typeof obj!=='object'||Array.isArray(obj)||Object.keys(obj).length!==1||!PERIOD.test(obj.period||''))wrong();
 return obj;
}
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
export function createDOHealthHandler({service}={}){
 if(!service)throw Error('Missing service');
 const cors={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
 return async request=>{
  if(request.headers.get('origin')!==ORIGIN)return json({ok:false,error:'Origin tidak diizinkan'},403);
  if(request.method==='OPTIONS')return json({ok:true},200,cors);
  if(request.method!=='POST')return json({ok:false,error:'Metode tidak diizinkan'},405,cors);
  const header=request.headers.get('authorization')||'';
  if(!/^Bearer\s+\S{1,8192}$/i.test(header))return json({ok:false,error:'Login Owner diperlukan'},401,cors);
  let user;
  try{const auth=await service.auth.getUser(header.replace(/^Bearer\s+/i,''));if(auth.error||!auth.data?.user?.id)throw Error('No authenticated user');user=auth.data.user.id;}
  catch{return json({ok:false,error:'Sesi Owner tidak dapat diverifikasi'},403,cors);}
  let input;try{input=await body(request);}catch{return json({ok:false,error:'Periode tidak valid'},400,cors);}
  try{const result=await service.rpc('ppic_do_auto_sync_status',{p_owner:user,p_period:input.period});
    if(result.error||!result.data)throw Error('Unavailable');
    return json(projectDOHealth(result.data,input.period),200,cors);
  }catch{return json({ok:false,error:'Status sinkronisasi DO belum tersedia'},503,cors);}
 };
}
