import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.57.4";
import JSZip from "npm:jszip@3.10.1";
import { XMLParser } from "npm:fast-xml-parser@5.2.5";
import { validateSdmSheetNames } from "./sdm-upload-validation.mjs";
const ROOT=Deno.env.get("SUPABASE_URL")||"";
const SECRET=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const OWNER="f43fd842-89b5-4f27-a49d-120f0d6742c1";
const BUCKET="ppic-private-sources",MAX=10*1024*1024;
const allowed=new Set(["BAHAN BAKU","GILING","VERPACK","SDM GILING","SDM VERPACK","BARANG JADI","CUKAI","DO","KAS BANK","TSG"]);
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"https://cengkehsigaret99-del.github.io","vary":"Origin","access-control-allow-headers":"authorization, apikey, content-type, x-ppic-filename, x-ppic-division, x-ppic-period, x-ppic-cutoff, x-ppic-version","access-control-allow-methods":"POST,OPTIONS"}});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return json({ok:true});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 if(req.headers.get("origin")!=="https://cengkehsigaret99-del.github.io")return json({error:"Origin not allowed"},403);
 const token=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"")||"";
 if(!token||!ROOT||!SECRET)return json({error:"Authentication unavailable"},401);
 const service=createClient(ROOT,SECRET,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth,error:authError}=await service.auth.getUser(token);
 if(authError||auth.user?.id!==OWNER)return json({error:"Only verified Owner can upload"},403);
 const name=(req.headers.get("x-ppic-filename")||"").trim();
 const division=(req.headers.get("x-ppic-division")||"").trim().toUpperCase();
 const period=req.headers.get("x-ppic-period")||"";
 const cutoff=req.headers.get("x-ppic-cutoff")||"";
 const version=(req.headers.get("x-ppic-version")||"").trim().toUpperCase();
 if(!/^[A-Za-z0-9][A-Za-z0-9._() -]{5,159}\.xlsx$/i.test(name)||!allowed.has(division)||!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(period)||!/^V[0-9]{3,}$/.test(version)||!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)||!Number.isFinite(Date.parse(cutoff+"T00:00:00Z"))||!cutoff.startsWith(period))return json({error:"Invalid file metadata"},400);
 const size=Number(req.headers.get("content-length")||"0");
 if(size>MAX)return json({error:"Excel exceeds 10 MB"},413);
 let bytes:Uint8Array;
 try{bytes=new Uint8Array(await req.arrayBuffer())}catch{return json({error:"Unable to read upload"},400)}
 if(bytes.byteLength<100||bytes.byteLength>MAX||bytes[0]!==0x50||bytes[1]!==0x4b||bytes[2]!==0x03||bytes[3]!==0x04)return json({error:"Expected a valid XLSX ZIP container, maximum 10 MB"},400);
 if(division==='SDM GILING'||division==='SDM VERPACK'){
  try{
   const zip=await JSZip.loadAsync(bytes),entry=zip.file('xl/workbook.xml');
   if(!entry)return json({error:'Struktur workbook XLSX tidak ditemukan.'},422);
   const xml=await entry.async('string');
   if(xml.length>1024*1024)return json({error:'Daftar sheet workbook terlalu besar.'},422);
   const parsed=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_',parseTagValue:false}).parse(xml);
   const sheets=parsed?.workbook?.sheets?.sheet,names=(Array.isArray(sheets)?sheets:sheets?[sheets]:[]).map((x:any)=>String(x['@_name']||''));
   const message=validateSdmSheetNames(names,division);
   if(message)return json({error:message,code:'SDM_DETAIL_SHEETS_REQUIRED'},422);
  }catch{return json({error:'Workbook SDM tidak dapat dibaca. Gunakan XLSX biasa tanpa password.'},422);}
 }
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(x=>x.toString(16).padStart(2,"0")).join("");
 const {data:existing,error:checkError}=await service.schema("ppic_private").from("source_registry").select("id").eq("sha256",hash).limit(1);
 // Private schema may be unavailable through PostgREST. Unique hash is enforced by SQL registry regardless.
 if(!checkError&&existing?.length)return json({duplicate:true,message:"This exact file is already registered. No second upload."},409);
 const safeDiv=division.toLowerCase().replace(/ /g,"_");
 const path=period+"/"+safeDiv+"/"+hash+".xlsx";
 const locator=BUCKET+"/"+path;
 const {error:uploadError}=await service.storage.from(BUCKET).upload(path,bytes,{contentType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",upsert:false,cacheControl:"0"});
 if(uploadError){
  if(uploadError.message.toLowerCase().includes("already exists")||String(uploadError.statusCode)==="409")return json({duplicate:true,message:"File with this checksum already exists in private storage."},409);
  return json({error:"Private storage upload failed",details:uploadError.message},500);
 }
 const documentId="PPIC_"+period.replace("-","")+"_"+safeDiv.toUpperCase()+"_"+hash.slice(0,16);
 const {data,error}=await service.rpc("ppic_register_uploaded_source",{p_document_id:documentId,p_division:division,p_period:period,p_cutoff:cutoff+"T00:00:00+07:00",p_version:version,p_sha256:hash,p_private_locator:locator});
 if(error||data?.duplicate){
  await service.storage.from(BUCKET).remove([path]);
  return json({error:error?.message||"Duplicate document",duplicate:!!data?.duplicate},error?500:409);
 }
 return json({ok:true,document_id:documentId,division,period,cutoff,version,sha256:hash,registration:"OPEN RECON",access:"CONFIDENTIAL",message:"Uploaded to private storage and registered. Data has NOT been parsed or posted into reports."},201);
});
