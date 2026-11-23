// BAL PPIC private cross-division operational intelligence status.
export const ORIGIN='https://cengkehsigaret99-del.github.io';
const PERIOD=/^20\d{2}-(0[1-9]|1[0-2])$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SHA=/^[a-f0-9]{64}$/;
const STATES=new Set(['ACTIVE_WORKING','CANDIDATE_OPEN_RECON','SOURCE_VERIFIED_OPEN_RECON',
 'SKT_DIAJUKAN','SKT_TERCATAT','LAST_WORKING','METADATA_CONFLICT','BANK_MATCH_OPEN','OPEN_RECON','SOURCE_MISSING']);
const BASIS=new Set(['ACTIVE_REPORT','ORIGINAL_XLSX','DERIVED_WORKBOOK','WEB_SKT_FORM','GOOGLE_SHEET','CONNECTED_ROBOT']);
const QUAL=new Set(['SOURCE','REFERENCE','ESTIMATE','MISSING']);
const PRIO=new Set(['P1','P2','P3']);
const err=()=>{throw Error('Invalid daily PPIC status');};
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:err();
const arr=(x,max)=>Array.isArray(x)&&x.length<=max?x:err();
const txt=(x,max=240)=>typeof x==='string'?x.slice(0,max):'';
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x?x:err();
const maybeDate=x=>x==null?null:date(x);
const dateTime=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))?x:err();
const num=x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=Number.MAX_SAFE_INTEGER?x:null;
function metric(x){
 const m=obj(x);if(!QUAL.has(m.quality)||typeof m.label!=='string'||!m.label||m.label.length>160)err();
 return{label:txt(m.label,160),value:typeof m.value==='string'?txt(m.value,120):num(m.value),
  unit:txt(m.unit,40),quality:m.quality};
}
function source(x){
 const s=obj(x);
 if(!STATES.has(s.source_status)||!BASIS.has(s.basis)||!s.division||typeof s.division!=='string'
  ||!Array.isArray(s.metrics)||s.metrics.length>15)err();
 return{division:txt(s.division,40),source_status:s.source_status,basis:s.basis,
  source_label:txt(s.source_label,240),book_cutoff:maybeDate(s.book_cutoff),
  active_cutoff:maybeDate(s.active_cutoff),note:txt(s.note,800),
  source_binary_verified:s.source_binary_verified===true,
  skt_form_status:s.skt_form_status?txt(s.skt_form_status,35):null,
  skt_form_version:Number.isInteger(s.skt_form_version)?s.skt_form_version:null,
  metrics:s.metrics.map(metric)};
}
function risk(x){
 const e=obj(x);if(!PRIO.has(e.priority)||!e.code||!e.title||typeof e.code!=='string')err();
 return{priority:e.priority,code:txt(e.code,90),division:txt(e.division,40),title:txt(e.title,600)};
}
function action(x){
 const e=obj(x);if(!PRIO.has(e.priority)||typeof e.action!=='string'||!e.action)err();
 return{priority:e.priority,owner:txt(e.owner,120),action:txt(e.action,700)};
}
export function projectDaily(data,period){
 const b=obj(data);if(b.ok!==true||b.period!==period||!PERIOD.test(period))err();
 if(b.ready===false&&b.latest===null)return{ok:true,period,ready:false,latest:null};
 if(b.ready!==true)err();
 const s=obj(b.latest);
 if(s.schema_version!=='ppic-daily-intelligence-v1'||s.write_scope!=='READ_ONLY_WORKING_REFERENCES'||
  s.state!=='WORKING_OPEN_RECON'||s.posting_done!==false||!UUID.test(s.id||'')||
  !SHA.test(s.source_fingerprint||'')||
  typeof s.skt_revision_current!=='boolean'||typeof s.ppic_evidence_current!=='boolean')err();
 const sources=arr(s.source_rows,16).map(source);
 if(new Set(sources.map(x=>x.division)).size!==sources.length)err();
 return{ok:true,ready:true,period,latest:{
  id:s.id,as_of:date(s.as_of),state:s.state,created_at:dateTime(s.created_at),
  source_fingerprint:s.source_fingerprint,
  skt_revision_current:s.skt_revision_current,ppic_evidence_current:s.ppic_evidence_current,
  source_rows:sources,kpi_rows:arr(s.kpi_rows,16).map(metric),
  exceptions:arr(s.exceptions,30).map(risk),next_actions:arr(s.next_actions,20).map(action),
  posting_done:false}};
}
async function body(req){
 if(!req.body)err();const chunks=[],reader=req.body.getReader();let size=0;
 try{for(;;){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1024){await reader.cancel();err();}chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let i=0;for(const x of chunks){bytes.set(x,i);i+=x.byteLength;}
 let parsed;try{parsed=JSON.parse(new TextDecoder().decode(bytes));}catch{err();}
 if(!parsed||Array.isArray(parsed)||typeof parsed!=='object'||Object.keys(parsed).length!==1||!PERIOD.test(parsed.period||''))err();
 return parsed;
}
function json(x,status=200,headers={}){return new Response(JSON.stringify(x),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});}
export function createDailyHandler({service}={}){
 if(!service)throw Error('Missing database service');
 const cors={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
 return async req=>{
  if(req.headers.get('origin')!==ORIGIN)return json({ok:false,error:'Origin tidak diizinkan'},403);
  if(req.method==='OPTIONS')return json({ok:true},200,cors);
  if(req.method!=='POST')return json({ok:false,error:'Metode tidak diizinkan'},405,cors);
  const bearer=req.headers.get('authorization')||'';
  if(!/^Bearer\s+\S{1,8192}$/i.test(bearer))return json({ok:false,error:'Sesi Owner diperlukan'},401,cors);
  let owner;
  try{const a=await service.auth.getUser(bearer.replace(/^Bearer\s+/i,''));if(a.error||!a.data?.user?.id)throw Error('invalid owner');owner=a.data.user.id;}
  catch{return json({ok:false,error:'Sesi Owner tidak terverifikasi'},403,cors);}
  let input;try{input=await body(req);}catch{return json({ok:false,error:'Periode tidak valid'},400,cors);}
  try{const r=await service.rpc('ppic_daily_intelligence_status',{p_owner:owner,p_period:input.period});
   if(r.error||!r.data)throw Error('unavailable');
   return json(projectDaily(r.data,input.period),200,cors);
  }catch{return json({ok:false,error:'Snapshot operasional belum dapat dibaca'},503,cors);}
 };
}
