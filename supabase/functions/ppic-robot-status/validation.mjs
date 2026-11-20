// Owner-only read projection. Keep this module network-free for synthetic tests.
export const OWNER = 'f43fd842-89b5-4f27-a49d-120f0d6742c1';
export const ORIGIN = 'https://cengkehsigaret99-del.github.io';
const DIVISIONS = new Set(['BAHAN BAKU','BARANG JADI','CUKAI','DO','GILING','KAS BANK','SDM GILING','SDM VERPACK','TSG','VERPACK']);
const OPERATING = new Set(['PERLU_PERHATIAN','TERKENDALI','DATA_BELUM_CUKUP']);
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const DOCUMENT = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,127}$/;
const KEY = /^[a-z][a-z0-9_]{0,79}$/;
const invalid = () => { throw new Error('Invalid private status projection'); };
const object = v => v && typeof v === 'object' && !Array.isArray(v) ? v : invalid();
const list = (v,limit) => Array.isArray(v) && v.length <= limit ? v : invalid();
const option = (v,allowed) => allowed.has(v) ? v : invalid();
const match = (v,regex) => typeof v === 'string' && regex.test(v) ? v : invalid();
const count = v => Number.isSafeInteger(v) && v >= 0 ? v : invalid();
const boolean = v => typeof v === 'boolean' ? v : invalid();
export const safeText = (value,limit=1200) => {
  if(typeof value !== 'string') return invalid();
  return value.replace(/https?:\/\/\S+/gi,'[alamat disembunyikan]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+|sk-[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gi,'[rahasia disembunyikan]')
    .replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,limit);
};
const text = (v,limit=1200,required=true) => {
  const value=safeText(v,limit); if(required && !value.trim())invalid(); return value;
};
const nullableText = (v,limit=1200) => v == null ? null : text(v,limit,false);
const date = v => {
  match(v,/^\d{4}-\d{2}-\d{2}$/);
  const n=Date.parse(v+'T00:00:00Z');
  return Number.isFinite(n) && new Date(n).toISOString().slice(0,10)===v ? v : invalid();
};
const nullableDate = v => v == null ? null : date(v);
const timestamp = v => v == null ? null : typeof v === 'string' && v.length<=40 && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v)) ? v : invalid();
const version = v => v == null ? null : match(v,/^V\d{3,}$/);
const document = v => v == null ? null : match(v,DOCUMENT);
const unitText = v => text(v,240,false);

function evidence(value) {
  const seen=new Set();
  return list(value,20).map(raw=>{
    const x=object(raw),id=match(x.document_id,DOCUMENT);
    if(seen.has(id))invalid();seen.add(id);
    return {document_id:id,fact_keys:list(x.fact_keys,50).map(k=>match(k,KEY))};
  });
}
function payload(value) {
  const x=object(value);
  if(x.schema_version!=='ppic-robot-brief-v1')invalid();
  return {
    schema_version:'ppic-robot-brief-v1',headline:text(x.headline,240),summary:text(x.summary,3000),
    operating_status:option(x.operating_status,OPERATING),as_of:date(x.as_of),
    decisions:list(x.decisions,10).map(raw=>{
      const d=object(raw);if(d.action_state!=='USULAN')invalid();
      const refs=evidence(d.evidence);if(!refs.length)invalid();
      return {id:match(d.id,/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/),priority:option(d.priority,new Set(['P1','P2','P3'])),
        title:text(d.title,240),recommendation:text(d.recommendation,2000),reason:text(d.reason,2000),consequence:text(d.consequence,2000),
        kind:option(d.kind,new Set(['OWNER_DECISION','ADMIN_FOLLOWUP','DATA_BLOCKER'])),owner_role:text(d.owner_role,240),evidence:refs,
        confidence:option(d.confidence,new Set(['TINGGI','SEDANG','RENDAH'])),data_limit:text(d.data_limit,2000),action_state:'USULAN'};
    }),
    watchlist:list(x.watchlist,20).map(raw=>{const w=object(raw);return {division:option(w.division,DIVISIONS),status:option(w.status,OPERATING),summary:text(w.summary,2000),evidence:evidence(w.evidence)};}),
    work_completed:list(x.work_completed,20).map(raw=>{const w=object(raw);return {title:text(w.title,240),detail:text(w.detail,2000),evidence:evidence(w.evidence)};}),
    pending_data:list(x.pending_data,20).map(raw=>{const w=object(raw);return {division:option(w.division,DIVISIONS),item:text(w.item,1000),why_needed:text(w.why_needed,2000),owner_role:text(w.owner_role,240),evidence:evidence(w.evidence)};}),
    limitations:list(x.limitations,20).map(v=>text(v,1200))
  };
}
function facts(value) {
  const seen=new Set();
  return list(value,500).map(raw=>{
    const f=object(raw),key=match(f.key,KEY);if(seen.has(key))invalid();seen.add(key);
    let value=f.value;
    if(value!==null && typeof value!=='string' && typeof value!=='number')invalid();
    if(typeof value==='number' && (!Number.isFinite(value) || Math.abs(value)>Number.MAX_SAFE_INTEGER))invalid();
    if(typeof value==='string')value=text(value,500,false);
    const quality=option(f.quality,new Set(['SOURCE','ESTIMATE','REFERENCE','MISSING']));
    if(quality==='MISSING' && value!==null)invalid();
    return {key,label:text(f.label,240),value,unit:unitText(f.unit),scope:unitText(f.scope),source_sheet:text(f.source_sheet,120,false),
      source_range:text(f.source_range,120,false),quality,note:text(f.note,1200,false)};
  });
}
function details(value) {
  const input=object(value),result={};
  for(const k of ['period','evidence_hash','brief_id','commit_sha','check_name','code','run_id','automation_id','release','result'])
    if(input[k]!==undefined)result[k]=text(input[k],240);
  for(const k of ['source_count','fact_count','tests_passed','tests_failed'])if(input[k]!==undefined)result[k]=count(input[k]);
  if(input.repaired!==undefined)result.repaired=boolean(input.repaired);
  return result;
}

export function projectRobotStatus(value,period) {
  const x=object(value);if(x.ok!==true || x.period!==period)invalid();
  const c=object(x.config),h=object(x.health),n=object(x.counts),imports=object(x.import_counts);
  let latest=null;
  if(x.latest_brief!==null) {
    const b=object(x.latest_brief),p=payload(b.payload);
    if(b.period!==period || p.as_of!==b.as_of)invalid();
    latest={id:match(b.id,UUID),period,as_of:date(b.as_of),evidence_hash:match(b.evidence_hash,/^[a-f0-9]{64}$/),payload:p,created_at:timestamp(b.created_at)};
  }
  const import_counts={};for(const key of ['total','queued','processing','imported','duplicate','failed'])import_counts[key]=count(imports[key]);
  const evidence_sources=list(x.evidence_sources,10).map(raw=>{
    const s=object(raw),sourceFacts=facts(s.facts),keys=new Set(sourceFacts.map(f=>f.key));
    const issues=list(s.issues??[],50).map(raw=>{
      const i=object(raw),fact_keys=list(i.fact_keys,50).map(k=>match(k,KEY));if(fact_keys.some(k=>!keys.has(k)))invalid();
      return {code:match(i.code,/^[A-Z][A-Z0-9_]{0,79}$/),severity:option(i.severity,new Set(['HIGH','MEDIUM','LOW'])),title:text(i.title,240),
        detail:text(i.detail,2000),fact_keys,source_sheet:text(i.source_sheet,120,false),source_range:text(i.source_range,120,false)};
    });
    return {document_id:match(s.document_id,DOCUMENT),division:option(s.division,DIVISIONS),version:version(s.version),cutoff:date(s.cutoff),
      status:text(s.status,80),facts:sourceFacts,issues};
  });
  const allowedEvidence=new Map(evidence_sources.map(s=>[s.document_id,new Set(s.facts.map(f=>f.key))]));
  if(latest)for(const section of ['decisions','watchlist','work_completed','pending_data'])for(const row of latest.payload[section])for(const ref of row.evidence)
    if(!allowedEvidence.has(ref.document_id)||ref.fact_keys.some(k=>!allowedEvidence.get(ref.document_id).has(k)))invalid();
  return {
    ok:true,period,
    config:{enabled:boolean(c.enabled),cadence:c.cadence==='HOURLY'?'HOURLY':invalid(),timezone:c.timezone==='Asia/Jakarta'?'Asia/Jakarta':invalid(),
      automation_id:c.automation_id==null?null:match(c.automation_id,/^Automation_[A-Za-z0-9_-]{8,100}$/),
      last_check_at:timestamp(c.last_check_at),last_success_at:timestamp(c.last_success_at),last_message:nullableText(c.last_message,1000),last_error:nullableText(c.last_error,1000)},
    health:{state:option(h.state,new Set(['HEALTHY','WAITING','STALE','ERROR','DISABLED'])),message:text(h.message,1200),
      source_changed_since_brief:boolean(h.source_changed_since_brief),has_unextracted_sources:boolean(h.has_unextracted_sources)},
    latest_brief:latest,
    history:list(x.history,10).map(raw=>{const b=object(raw);if(b.period!==period)invalid();return {id:match(b.id,UUID),period,as_of:date(b.as_of),created_at:timestamp(b.created_at),headline:text(b.headline,240)};}),
    coverage:list(x.coverage,10).map(raw=>{const s=object(raw);return {division:option(s.division,DIVISIONS),source_document_id:document(s.source_document_id),
      source_version:version(s.source_version),source_cutoff:nullableDate(s.source_cutoff),reconciliation_status:nullableText(s.reconciliation_status,80),
      has_facts:boolean(s.has_facts),selection_status:option(s.selection_status,new Set(['READY','MISSING_FACTS','NO_SOURCE','SUPERSEDED'])),
      report_cutoff:nullableDate(s.report_cutoff),report_version:version(s.report_version),report_status:nullableText(s.report_status,80)};}),
    evidence_sources,
    runs:list(x.runs,20).map(raw=>{const r=object(raw);return {id:match(r.id,UUID),kind:option(r.kind,new Set(['CHECK','ANALYSIS','MAINTENANCE'])),
      status:option(r.status,new Set(['RUNNING','SUCCESS','NO_CHANGE','WAITING','FAILED','BLOCKED'])),message:text(r.message,1000),details:details(r.details),created_at:timestamp(r.created_at)};}),
    counts:{sources_with_facts:count(n.sources_with_facts),pending_fact_sources:count(n.pending_fact_sources),decisions:count(n.decisions),owner_decisions:count(n.owner_decisions)},
    import_counts
  };
}

async function boundedJson(request) {
  if(!request.body)invalid();
  const reader=request.body.getReader(),chunks=[];let size=0;
  try {
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2048){await reader.cancel();invalid();}chunks.push(value);}
  } finally {reader.releaseLock();}
  const all=new Uint8Array(size);let at=0;for(const chunk of chunks){all.set(chunk,at);at+=chunk.byteLength;}
  return JSON.parse(new TextDecoder().decode(all));
}
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}});

export function createRobotStatusHandler({service}) {
  const cors={'access-control-allow-origin':ORIGIN,'access-control-allow-headers':'authorization, apikey, content-type','access-control-allow-methods':'POST,OPTIONS','vary':'Origin'};
  return async request=>{
    if(request.headers.get('origin')!==ORIGIN)return json({ok:false,error:'Origin not allowed'},403);
    if(request.method==='OPTIONS')return json({ok:true},200,cors);
    if(request.method!=='POST')return json({ok:false,error:'Method not allowed'},405,cors);
    const authorization=request.headers.get('authorization')||'';
    if(!/^Bearer\s+[^\s]{1,8192}$/i.test(authorization))return json({ok:false,error:'Login Owner diperlukan'},401,cors);
    let auth;try{auth=await service.auth.getUser(authorization.replace(/^Bearer\s+/i,''));}catch{return json({ok:false,error:'Pemeriksaan login belum tersedia'},503,cors);}
    if(auth.error||auth.data?.user?.id!==OWNER)return json({ok:false,error:'Hanya Owner terverifikasi yang dapat membaca Robot Manajer'},403,cors);
    let period;
    try {
      const body=object(await boundedJson(request)),url=new URL(request.url);
      if(Object.keys(body).some(k=>k!=='period')||[...url.searchParams.keys()].some(k=>k!=='period'))invalid();
      period=match(body.period,PERIOD);
      if(url.searchParams.has('period')&&url.searchParams.get('period')!==period)invalid();
    }catch{return json({ok:false,error:'Periode atau permintaan tidak valid'},400,cors);}
    try {
      const result=await service.rpc('ppic_robot_status',{p_period:period});
      if(result.error||!result.data)throw new Error('Unavailable');
      return json(projectRobotStatus(result.data,period),200,cors);
    }catch{return json({ok:false,error:'Status Robot Manajer belum tersedia; coba kembali setelah pemeriksaan layanan'},503,cors);}
  };
}
