// PPIC Stage 3: strict Owner-only projection; never exposes private raw sources or executor capabilities.
export const ORIGIN='https://cengkehsigaret99-del.github.io';
const PERIOD=/^20\d\d-(0[1-9]|1[0-2])$/;
const SHA=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const DOC=/^[A-Za-z0-9][A-Za-z0-9._:-]{5,179}$/;
const FACT=/^[a-z][a-z0-9_]{0,79}$/;
const PRIORITIES=new Set(['P1','P2','P3']);
const KINDS=new Set(['OWNER_DECISION','ADMIN_FOLLOWUP','DATA_BLOCKER']);
const GATES=new Set(['BUTUH_VERIFIKASI','PERLU_TINJAUAN_OWNER','TINDAK_LANJUT_DIVISI']);
const CONFIDENCE=new Set(['TINGGI','SEDANG','RENDAH']);
const DIVISIONS=new Set(['BAHAN BAKU','BARANG JADI','CUKAI','DO','GILING','KAS BANK','SDM GILING','SDM VERPACK','TSG','VERPACK']);
const SEVERITIES=new Set(['HIGH','MEDIUM','LOW']);
const STATES=new Set(['WAITING_DATA','REVIEW_REQUIRED']);
const invalid=()=>{throw new Error('Invalid decision evidence');};
const object=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:invalid();
const array=(x,n)=>Array.isArray(x)&&x.length<=n?x:invalid();
const bounded=(x,max=600)=>typeof x==='string'?x.slice(0,max):'';
const dateOnly=(x)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x?x:invalid();
const timestamp=(x)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(x)&&Number.isFinite(Date.parse(x))?x:invalid();
function risk(x) {
 const d=object(x);
 if(!SEVERITIES.has(d.severity)||!bounded(d.code,80))invalid();
 return {code:bounded(d.code,80),severity:d.severity,division:bounded(d.division,90),
  message:bounded(d.message,500),source_cutoff:d.source_cutoff?dateOnly(d.source_cutoff):null,
  report_cutoff:d.report_cutoff?dateOnly(d.report_cutoff):null};
}
function evidence(x) {
 const d=object(x);
 if(!DOC.test(d.document_id||''))invalid();
 const keys=array(d.fact_keys,30);
 if(!keys.length||keys.some(key=>!FACT.test(key)))invalid();
 return {document_id:d.document_id,fact_keys:keys};
}
function decision(x) {
 const d=object(x);
 if(typeof d.id!=='string'||! /^[A-Za-z0-9_:-]{2,100}$/.test(d.id)||!Number.isInteger(d.rank)||d.rank<1||d.rank>10
  ||!PRIORITIES.has(d.priority)||!KINDS.has(d.kind)||!GATES.has(d.gate)||!CONFIDENCE.has(d.confidence)
  ||d.action_state!=='USULAN'||typeof d.requires_owner_approval!=='boolean'||typeof d.missing_evidence_present!=='boolean')invalid();
 const refs=array(d.evidence,10).map(evidence);
 if(!refs.length)invalid();
 const divisions=array(d.divisions,10);
 if(divisions.some(x=>!DIVISIONS.has(x)))invalid();
 const risks=array(d.risks,3).map(risk);
 return {
  id:d.id,rank:d.rank,priority:d.priority,kind:d.kind,title:bounded(d.title,240),recommendation:bounded(d.recommendation,1500),
  reason:bounded(d.reason,1500),consequence:bounded(d.consequence,1200),owner_role:bounded(d.owner_role,160),
  confidence:d.confidence,data_limit:bounded(d.data_limit,1400),action_state:'USULAN',gate:d.gate,
  requires_owner_approval:d.requires_owner_approval,missing_evidence_present:d.missing_evidence_present,
  divisions,risks,evidence:refs
 };
}
function coverage(x){
 const d=object(x);
 if(!DIVISIONS.has(d.division))invalid();
 return {division:d.division,source_cutoff:d.source_cutoff?dateOnly(d.source_cutoff):null,
  report_cutoff:d.report_cutoff?dateOnly(d.report_cutoff):null,report_status:bounded(d.report_status,70)};
}
export function projectStage3(body,period) {
 const r=object(body);
 if(r.ok!==true||r.period!==period||!PERIOD.test(period))invalid();
 if(r.ready===false&&r.latest===null)return {ok:true,period,ready:false,latest:null};
 if(r.ready!==true)invalid();
 const s=object(r.latest);
 if(typeof s.evidence_current!=='boolean'||s.schema_version!=='ppic-stage3-decision-v1'||!UUID.test(s.id||'')||!UUID.test(s.briefing_id||'')
  ||!SHA.test(s.evidence_hash||'')||!STATES.has(s.status)
  ||!Number.isInteger(s.source_count)||s.source_count<1||s.source_count>10
  ||!Number.isInteger(s.data_blockers)||s.data_blockers<0||s.data_blockers>10)invalid();
 const cards=array(s.decisions,10).map(decision);
 if(!cards.length)invalid();
 const focus=array(s.focus_ids,3);
 if(!focus.length||new Set(focus).size!==focus.length||focus.some(id=>!cards.some(c=>c.id===id)))invalid();
 const seen=new Set();for(const c of cards){if(seen.has(c.id))invalid();seen.add(c.id);}
 return {ok:true,period,ready:true,latest:{
  id:s.id,evidence_hash:s.evidence_hash,evidence_current:s.evidence_current,briefing_id:s.briefing_id,analysis_as_of:dateOnly(s.analysis_as_of),
  created_at:timestamp(s.created_at),source_count:s.source_count,data_blockers:s.data_blockers,status:s.status,
  decisions:cards,focus_ids:focus,risk_register:array(s.risk_register,25).map(risk),coverage:array(s.coverage,15).map(coverage)
 }};
}
async function getBody(req){
 if(!req.body)invalid();
 const reader=req.body.getReader();const chunks=[];let size=0;
 try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1024){await reader.cancel();invalid();}chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let i=0;for(const chunk of chunks){bytes.set(chunk,i);i+=chunk.byteLength;}
 let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{invalid();}
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1||!PERIOD.test(body.period||''))invalid();
 return body;
}
const json=(x,status=200,headers={})=>new Response(JSON.stringify(x),{
 status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}
});
export function createStage3Handler({service}={}){
 if(!service)throw Error('Service missing');
 const cors={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
 return async request=>{
  if(request.headers.get('origin')!==ORIGIN)return json({ok:false,error:'Origin tidak diizinkan'},403);
  if(request.method==='OPTIONS')return json({ok:true},200,cors);
  if(request.method!=='POST')return json({ok:false,error:'Metode tidak diizinkan'},405,cors);
  const authorization=request.headers.get('authorization')||'';
  if(!/^Bearer\s+\S{1,8192}$/i.test(authorization))return json({ok:false,error:'Login Owner diperlukan'},401,cors);
  let owner;
  try{const a=await service.auth.getUser(authorization.replace(/^Bearer\s+/i,''));
   if(a.error||!a.data?.user?.id)throw Error('Invalid login');owner=a.data.user.id;
  }catch{return json({ok:false,error:'Sesi Owner tidak dapat diverifikasi'},403,cors);}
  let body;try{body=await getBody(request);}catch{return json({ok:false,error:'Periode tidak valid'},400,cors);}
  try {
   const response=await service.rpc('ppic_stage3_status',{p_owner:owner,p_period:body.period});
   if(response.error||!response.data)throw Error('Unavailable');
   return json(projectStage3(response.data,body.period),200,cors);
  }catch{return json({ok:false,error:'Pusat keputusan belum dapat dibaca'},503,cors);}
 };
}
