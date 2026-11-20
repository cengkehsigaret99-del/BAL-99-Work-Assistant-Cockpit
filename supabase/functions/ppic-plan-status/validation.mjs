// BAL PPIC evidence-gated production plan: Owner-only, read-only projection.
export const ORIGIN='https://cengkehsigaret99-del.github.io';
const PER=/^20\d\d-(0[1-9]|1[0-2])$/,UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,SHA=/^[a-f0-9]{64}$/;
const DOC=/^[A-Za-z0-9][A-Za-z0-9._:-]{5,179}$/;
const STATES=new Set(['HOLD_DATA','PROPOSALS_READY']);
const GATE_STATES=new Set(['MISSING_PROOF','PARTIAL_PROOF','METADATA_CONFLICT','VERIFIED']);
const LINES=new Set(['HOLD','PROPOSAL_ONLY']);
const PRIORITY=new Set(['P1','P2','P3']);
const Q=new Set(['SOURCE','MISSING','ESTIMATE','REFERENCE']);
const DIV=new Set(['DO','BARANG JADI','GILING','VERPACK','CUKAI','BAHAN BAKU','TSG','SDM GILING','SDM VERPACK','KAS BANK','DO / Customer','Barang Jadi / QC','Giling / Verpack','Bahan Baku / Purchasing','SDM / Finance','Cukai']);
const invalid=()=>{throw Error('Invalid planning result');};
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:invalid();
const arr=(x,n)=>Array.isArray(x)&&x.length<=n?x:invalid();
const str=(x,n=1000)=>typeof x==='string'?x.slice(0,n):'';
const numeric=x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=Number.MAX_SAFE_INTEGER?x:null;
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x?x:invalid();
const datetime=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))?x:invalid();
function source(x){
 const f=obj(x);
 if(!DOC.test(f.document_id||'')||!Q.has(f.quality)||!str(f.key,90))invalid();
 const value=typeof f.value==='string'?str(f.value,140):numeric(f.value);
 return{division:str(f.division,50),document_id:f.document_id,key:str(f.key,90),quality:f.quality,
  value,unit:str(f.unit,30),cutoff:f.cutoff?date(f.cutoff):null};
}
function gate(x){
 const g=obj(x);
 if(!GATE_STATES.has(g.state)||!str(g.code,80)||!str(g.label,100))invalid();
 return {code:str(g.code,80),label:str(g.label,100),state:g.state,
  message:str(g.message,520),owner_role:str(g.owner_role,180),
  observed_forms:typeof g.observed_forms==='number'?numeric(g.observed_forms):null,
  basis:str(g.basis,120)};
}
function action(x){
 const a=obj(x);
 if(!PRIORITY.has(a.priority)||a.release_state!=='USULAN'||!str(a.task,1200))invalid();
 return {priority:a.priority,division:str(a.division,100),task:str(a.task,1200),release_state:'USULAN'};
}
function line(x){
 const a=obj(x);
 if(!/^c_[0-9]{3}$/.test(a.sku||'')||!LINES.has(a.state)||a.owner_approval_required!==true)invalid();
 const missing=arr(a.missing,8).map(s=>str(s,70));
 const firm=numeric(a.firm_order_pack),available=numeric(a.available_pack),
  ship=numeric(a.proposed_ship_pack),make=numeric(a.proposed_make_pack);
 if(a.state==='HOLD'&&(ship!==null||make!==null))invalid();
 if(a.state==='PROPOSAL_ONLY'&&(firm===null||available===null||ship===null||make===null||missing.length>0||ship<0||make<0))invalid();
 return {sku:a.sku,state:a.state,missing,firm_order_pack:firm,available_pack:available,
  proposed_ship_pack:ship,proposed_make_pack:make,unit:'pack',planning_cutoff:a.planning_cutoff?date(a.planning_cutoff):null,
  owner_approval_required:true,source_document_id:DOC.test(a.source_document_id||'')?a.source_document_id:null};
}
function counts(x){
 if(x===null)return null;
 const a=obj(x),fields=['daily_reports','sj_documents','bb_documents','co_orders','co_realizations','co_allocations','bb_master_entries','total_documents'];
 const o={};for(const k of fields)if(Number.isInteger(a[k])&&a[k]>=0&&a[k]<=1e7)o[k]=a[k];else invalid();
 return o;
}
export function projectPlan(body,period){
 const b=obj(body);if(b.ok!==true||b.period!==period||!PER.test(period))invalid();
 if(b.ready===false&&b.latest===null)return {ok:true,period,ready:false,latest:null};
 if(b.ready!==true)invalid();
 const s=obj(b.latest);
 if(s.schema_version!=='ppic-production-plan-v1'||!UUID.test(s.id||'')||!SHA.test(s.evidence_hash||'')
 ||typeof s.evidence_current!=='boolean'||!STATES.has(s.state)||typeof s.skt_observed!=='boolean')invalid();
 const gates=arr(s.gates,12).map(gate),proposals=arr(s.proposal_lines,40).map(line),actions=arr(s.next_actions,12).map(action),
  sources=arr(s.source_facts,15).map(source);
 if(s.state==='PROPOSALS_READY'&&!proposals.some(x=>x.state==='PROPOSAL_ONLY'))invalid();
 const skt=counts(s.skt_counts);
 if(s.skt_observed&&skt===null)invalid();
 return {ok:true,period,ready:true,latest:{
  id:s.id,evidence_hash:s.evidence_hash,evidence_current:s.evidence_current,
  state:s.state,analysis_as_of:date(s.analysis_as_of),created_at:datetime(s.created_at),
  skt_observed:s.skt_observed,skt_captured_at:s.skt_captured_at?datetime(s.skt_captured_at):null,
  skt_counts:skt,source_facts:sources,gates,proposal_lines:proposals,next_actions:actions
 }};
}
async function body(req){
 if(!req.body)invalid();const chunks=[];const reader=req.body.getReader();let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1024){await reader.cancel();invalid();}chunks.push(value);}}
 finally{reader.releaseLock();}
 const buf=new Uint8Array(size);let i=0;for(const chunk of chunks){buf.set(chunk,i);i+=chunk.byteLength;}
 let x;try{x=JSON.parse(new TextDecoder().decode(buf));}catch{invalid();}
 if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).length!==1||!PER.test(x.period||''))invalid();
 return x;
}
function json(x,status=200,headers={}){return new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});}
export function createPlanHandler({service}={}){
 if(!service)throw Error('Missing service');
 const cors={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
 return async req=>{
  if(req.headers.get('origin')!==ORIGIN)return json({ok:false,error:'Origin tidak diizinkan'},403);
  if(req.method==='OPTIONS')return json({ok:true},200,cors);
  if(req.method!=='POST')return json({ok:false,error:'Metode tidak diizinkan'},405,cors);
  const auth=req.headers.get('authorization')||'';
  if(!/^Bearer\s+\S{1,8192}$/i.test(auth))return json({ok:false,error:'Login Owner diperlukan'},401,cors);
  let owner;
  try{const result=await service.auth.getUser(auth.replace(/^Bearer\s+/i,''));if(result.error||!result.data?.user?.id)throw Error('Auth failed');owner=result.data.user.id;}
  catch{return json({ok:false,error:'Sesi Owner tidak dapat diverifikasi'},403,cors);}
  let input;try{input=await body(req);}catch{return json({ok:false,error:'Periode tidak valid'},400,cors);}
  try{
   const r=await service.rpc('ppic_plan_status',{p_owner:owner,p_period:input.period});
   if(r.error||!r.data)throw Error('Unavailable');
   return json(projectPlan(r.data,input.period),200,cors);
  }catch{return json({ok:false,error:'Rencana kerja PPIC belum dapat dibaca'},503,cors);}
 };
}
