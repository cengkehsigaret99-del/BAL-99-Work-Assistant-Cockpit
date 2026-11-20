import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.57.4";
import JSZip from "npm:jszip@3.10.1";
import { XMLParser } from "npm:fast-xml-parser@5.2.5";

import {giling,verpack,combineParts,encodeRows,payrollMetadata,summarizeRows} from "./normalizer.mjs";

const ROOT=Deno.env.get("SUPABASE_URL")||"";
const SECRET=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const OWNER="f43fd842-89b5-4f27-a49d-120f0d6742c1";
const ORIGIN="https://cengkehsigaret99-del.github.io";
const BUCKET="ppic-private-sources";
const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:"@_",parseTagValue:false,trimValues:false,removeNSPrefix:true});
const arr=(v:any):any[]=>v===undefined||v===null?[]:Array.isArray(v)?v:[v];
const text=(v:any):string=>typeof v==="string"?v:(v&&typeof v==="object"?String(v["#text"]||""):"");
const num=(v:any):number=>{const n=Number(v);return Number.isFinite(n)?n:0};
const dateSerial=(v:any):string=>{
 const n=Number(v);
 if(!Number.isFinite(n)||n<1||n>100000)return "";
 return new Date(Date.UTC(1899,11,30)+Math.floor(n)*86400000).toISOString().slice(0,10);
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{
 "content-type":"application/json; charset=utf-8","cache-control":"no-store",
 "access-control-allow-origin":ORIGIN,"access-control-allow-methods":"POST,OPTIONS",
 "access-control-allow-headers":"authorization,apikey,content-type","vary":"Origin"
}});

class CompactXlsx {
 zip:JSZip;
 shared:string[]=[];
 sheets=new Map<string,string>();
 constructor(zip:JSZip){this.zip=zip}
 static async open(bytes:Uint8Array):Promise<CompactXlsx>{
  const zip=await JSZip.loadAsync(bytes,{checkCRC32:true});
  const doc=new CompactXlsx(zip);
  const wb=await doc.xml("xl/workbook.xml");
  const rel=await doc.xml("xl/_rels/workbook.xml.rels");
  const links=new Map(arr(rel.Relationships?.Relationship).map((e:any)=>[e["@_Id"],e["@_Target"]]));
  for(const item of arr(wb.workbook?.sheets?.sheet)){
   const target=links.get(item["@_id"]??item["@_r:id"]);
   if(!target)continue;
   const file=String(target).startsWith("/")?String(target).slice(1):
     String(target).startsWith("xl/")?String(target):"xl/"+String(target);
   doc.sheets.set(item["@_name"],file);
  }
  if(zip.file("xl/sharedStrings.xml")){
   const ss=await doc.xml("xl/sharedStrings.xml");
   doc.shared=arr(ss.sst?.si).map((si:any)=>
      si?.t!==undefined?text(si.t):arr(si?.r).map((r:any)=>text(r.t)).join(""));
  }
  return doc;
 }
 async xml(path:string):Promise<any>{
  const entry=this.zip.file(path);
  if(!entry)throw Error("Bagian Excel tidak ditemukan: "+path);
  if(entry._data && entry._data.uncompressedSize>15*1024*1024)throw Error("Sheet Excel melebihi batas pembacaan.");
  return parser.parse(await entry.async("string"));
 }
 async rows(name:string):Promise<Map<number,Record<string,any>>>{
  const path=this.sheets.get(name);
  if(!path)throw Error("Sheet wajib tidak ditemukan: "+name);
  const xml=await this.xml(path);
  const rows=new Map<number,Record<string,any>>();
  for(const r of arr(xml.worksheet?.sheetData?.row)){
   const rn=Number(r["@_r"]);
   if(!Number.isInteger(rn))continue;
   const cells:Record<string,any>={};
   for(const c of arr(r.c)){
    const ref=String(c["@_r"]||""),match=/^[A-Z]+/.exec(ref);
    if(!match)continue;
    const type=c["@_t"],raw=c.v&&typeof c.v==="object"?text(c.v):c.v;
    if(type==="e")continue;
    let value:any=raw;
    if(type==="s")value=this.shared[Number(raw)]??"";
    else if(type==="inlineStr")value=c.is?.t!==undefined?text(c.is.t):arr(c.is?.r).map((r:any)=>text(r.t)).join("");
    else if(type==="b")value=raw==="1";
    else if(raw!==undefined&&raw!==null&&String(raw).trim()!==""){
      const n=Number(raw);value=Number.isFinite(n)?n:String(raw);
    }
    if(value!==undefined&&value!==null)cells[match[0]]=value;
   }
   rows.set(rn,cells);
  }
  return rows;
 }
}
async function pack(payload:any):Promise<string>{
 const stream=new Blob([new TextEncoder().encode(JSON.stringify(payload))]).stream().pipeThrough(new CompressionStream('deflate'));
 const bytes=new Uint8Array(await new Response(stream).arrayBuffer());let str='';
 for(let i=0;i<bytes.length;i+=8192)str+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(str);
}
async function unpack(payload:any):Promise<any>{
 if(!payload)return null;if(payload.codec!=='zlib-base64'||typeof payload.data!=='string')throw Error('Format snapshot sebelumnya tidak didukung.');
 const bytes=Uint8Array.from(atob(payload.data),(c:string)=>c.charCodeAt(0));
 return JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).text());
}
const hashBytes=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
const logical=(division:string)=>/GILING$/.test(division)?'GILING':/VERPACK$/.test(division)?'VERPACK':'';
const sourceOrder=(a:any,b:any)=>String(b.cutoff).localeCompare(String(a.cutoff))||(Number(String(b.version).slice(1))-Number(String(a.version).slice(1)))||String(b.ingested_at).localeCompare(String(a.ingested_at));
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return json({ok:true});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 if(req.headers.get('origin')!==ORIGIN)return json({error:'Origin not allowed'},403);
 if(!ROOT||!SECRET)return json({error:'Server config unavailable'},503);
 const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'';
 if(!token)return json({error:'Login Owner diperlukan'},401);
 const service=createClient(ROOT,SECRET,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth,error:authError}=await service.auth.getUser(token);
 if(authError||auth.user?.id!==OWNER)return json({error:'Only verified Owner can rebuild SDM'},403);
 try{
  const request=await req.json().catch(()=>({})),period=String(request?.period||'2026-11');
  if(period!=='2026-11')return json({error:'Saat ini impor SDM didukung untuk November 2026'},422);
  const {data:context,error:contextError}=await service.rpc('ppic_sdm_rebuild_context',{p_period:period});
  if(contextError)throw Error('Manifest SDM: '+contextError.message);
  const candidates=Array.isArray(context?.candidates)?context.candidates:[],previous=await unpack(context?.previous?.payload);
  const considered:any[]=[],parts:any[]=[];
  for(const div of ['GILING','VERPACK']){
   const options=candidates.filter((x:any)=>logical(x.division)===div).sort(sourceOrder);let selected:any=null;
   for(const src of options){
    if(selected){considered.push({documentId:src.document_id,division:src.division,cutoff:src.cutoff,sha256:src.sha256,decision:'NOT_SELECTED',reason:'Sumber detail yang lebih baru/sesuai telah dipilih.'});continue;}
    try{
     const locator=String(src.private_locator||'');
     if(!locator.startsWith(BUCKET+'/')||!/^[a-f0-9]{64}$/.test(String(src.sha256||'')))throw Error('Sumber belum tersedia sebagai XLSX di arsip privat PPIC.');
     const path=locator.slice(BUCKET.length+1);
     if(!path.startsWith(period+'/')||!path.endsWith('/'+src.sha256+'.xlsx'))throw Error('Path arsip tidak sesuai checksum.');
     const {data:blob,error}=await service.storage.from(BUCKET).download(path);
     if(error||!blob)throw Error('File sumber tidak dapat dibaca dari arsip privat.');
     const bytes=new Uint8Array(await blob.arrayBuffer());
     if(bytes.length>10*1024*1024||bytes.length<100)throw Error('Ukuran XLSX tidak sesuai.');
     if(await hashBytes(bytes)!==src.sha256)throw Error('Checksum sumber tidak cocok.');
     const xlsx=await CompactXlsx.open(bytes);selected=div==='GILING'?await giling(xlsx,src,period):await verpack(xlsx,src,period);
     considered.push({documentId:src.document_id,division:src.division,cutoff:src.cutoff,sha256:src.sha256,decision:'ACCEPTED',reason:'Rincian pekerja dan kontrol sumber terbaca.'});
    }catch(e){considered.push({documentId:src.document_id,division:src.division,cutoff:src.cutoff,sha256:src.sha256,decision:'REJECTED',reason:e instanceof Error?e.message:'Format sumber tidak didukung.'});}
   }
   if(!selected)return json({error:'Rincian '+div+' belum tersedia. Unggah workbook detail yang sesuai; rekap ringkas tidak dapat menghasilkan slip per pekerja.',consideredSources:considered},422);
   const previousCutoff=previous?.meta?.payroll?.sourceCutoffByDivision?.[div]||previous?.meta?.sourceCutoffByDivision?.[div]||context?.previous?.cutoff;
   if(previousCutoff&&selected.cutoff<previousCutoff)return json({error:'Sumber detail '+div+' yang dapat dibaca baru sampai '+selected.cutoff+'. Laporan '+previousCutoff+' tetap dipertahankan. Unggah workbook detail terbaru untuk memperbarui laporan.',consideredSources:considered,preservedVersion:context.previous.version},422);
   parts.push(selected);
  }
  const rows=combineParts(parts,previous),payroll=payrollMetadata(parts,previous?.meta?.payroll||{}),cutoff=parts.map(p=>p.cutoff).sort().at(-1);
  const acceptedSources=parts.map(p=>({documentId:p.source.document_id,division:p.div,sourceDivision:p.source.division,storage:'PPIC_PRIVATE_STORAGE',sha256:p.source.sha256,cutoff:p.cutoff,coverageStart:p.coverageStart}));
  const documentIds=[...new Set([...(context?.previous?.source_document_ids||[]),...parts.map(p=>p.source.document_id)])];
  const externalSourceRefs=(previous?.meta?.externalSourceRefs||[]).map((r:any)=>{const archived=acceptedSources.find(s=>s.sha256===r.sha256);return archived?{...r,notArchivedInPPIC:false,ppicDocumentId:archived.documentId}:r;});
  const summaries:any={};for(const div of ['GILING','VERPACK']){const summary=summarizeRows(rows.filter(r=>r.div===div)),holds=payroll.holds.filter((r:any)=>r.div===div);summaries['SDM '+div]={...summary,qty:summary.qty+holds.reduce((s:number,r:any)=>s+(r.qty||0),0),wage:summary.wage+holds.reduce((s:number,r:any)=>s+(r.wage||0),0),heldWage:holds.reduce((s:number,r:any)=>s+(r.wage||0),0)};}
  const buildSignature=await hashBytes(new TextEncoder().encode(JSON.stringify({parserVersion:3,sources:acceptedSources.map(s=>[s.documentId,s.sha256,s.coverageStart,s.cutoff])})));
  const meta={period,cutoff,documentIds,summaries,validation:'WORKING / OPEN RECON',attendanceVerified:false,bonusIncluded:false,payroll,acceptedSources,consideredSources:considered,externalSourceRefs,parserVersion:3,buildSignature,sourceSegments:[...(previous?.meta?.sourceSegments||[]).filter((s:any)=>!parts.some(p=>p.div===s.division&&s.from>=p.coverageStart)),...parts.map(p=>({division:p.div,from:p.coverageStart,through:p.cutoff,documentId:p.source.document_id}))]};
  const decoded=encodeRows(rows,meta),compressed=await pack(decoded);
  const {data:publication,error:publishError}=await service.rpc('ppic_sdm_publish_snapshot_append',{p_period:period,p_cutoff:cutoff,p_payload:{codec:'zlib-base64',data:compressed,meta},p_document_ids:documentIds,p_accepted_ids:parts.map(p=>p.source.document_id),p_previous_created_at:context?.previous?.created_at||null});
  if(publishError)throw Error('Penyimpanan laporan privat: '+publishError.message);
  return json({ok:true,period,version:publication.version,cutoff,workers:decoded.w.length,rows:decoded.r.length,summaries,publication,acceptedSources,consideredSources:considered,registration:'WORKING / OPEN RECON'});
 }catch(e){return json({error:e instanceof Error?e.message:'Proses Excel SDM gagal'},500);}
});
