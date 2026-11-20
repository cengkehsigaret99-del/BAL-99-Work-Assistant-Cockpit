import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire,stripTypeScriptTypes} from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  MAX_XLSX_BYTES,OWNER,ORIGIN,validateJob,validateDownloadUrl,readBoundedStream,
  fetchSource,inspectZip,validateWorkbook,sha256,reportState,createImportHandler,createStatusHandler
} from '../supabase/functions/ppic-auto-import/validation.mjs';
import {validateSdmSheetNames} from '../supabase/functions/ppic-owner-upload/sdm-upload-validation.mjs';
import {giling,verpack} from '../supabase/functions/ppic-sdm-rebuild/normalizer.mjs';

// CI can install these pinned dependencies outside the public source checkout.
const require=createRequire(import.meta.url),paths=[process.env.PPIC_AUTO_NODE_MODULES,process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean);
const JSZip=require(require.resolve('jszip',{paths}));
const {XMLParser}=require(require.resolve('fast-xml-parser',{paths}));
const deps={JSZip,XMLParser,validateSdmSheetNames,sdmParsers:{giling,verpack}};
const NOW=new Date('2026-11-20T12:00:00Z'),ID='00000000-0000-4000-8000-000000000001',LEASE='00000000-0000-4000-8000-000000000002',NONCE='a'.repeat(64);
const SAFE_URL='https://sdmntprindiasocentral.oaiusercontent.com/files/00000000-0000-4000-8000-000000000003/raw?test=signed-capability-placeholder';
const xmlEscape=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const cell=(ref,v)=>typeof v==='number'?`<c r="${ref}"><v>${v}</v></c>`:`<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(v)}</t></is></c>`;

async function fixture({division='CUKAI',period='2026-11',version='V002',cutoff='2026-11-20',metadataSheet='PPIC_UPLOAD',extraSheets=[],extraFiles={},extraRows=[],compression='DEFLATE',namespacePrefix=false}={}) {
  const z=new JSZip(),names=[metadataSheet,...extraSheets];
  z.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
  z.file('xl/workbook.xml',`<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n,i)=>`<sheet name="${xmlEscape(n)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`);
  z.file('xl/_rels/workbook.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((n,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}</Relationships>`);
  const rows=[['Kategori unggah',division],['Periode',period],['Versi',version],['Cut-off',cutoff],...extraRows];
  z.file('xl/worksheets/sheet1.xml',`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((r,i)=>`<row r="${i+1}">${cell('A'+(i+1),r[0])}${cell('B'+(i+1),r[1])}</row>`).join('')}</sheetData></worksheet>`);
  for(let i=1;i<names.length;i++)z.file(`xl/worksheets/sheet${i+1}.xml`,'<worksheet><sheetData/></worksheet>');
  for(const [n,v]of Object.entries(extraFiles))z.file(n,v);
  if(namespacePrefix)for(const n of ['xl/workbook.xml',...names.map((_,i)=>`xl/worksheets/sheet${i+1}.xml`)]){
    const content=await z.file(n).async('string');z.file(n,content.replace(/<(\/?)(workbook|sheets|sheet|worksheet|sheetData|row|c|v|is|t)(?=[\s/>])/g,'<$1x:$2').replace('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"','xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'));
  }
  return new Uint8Array(await z.generateAsync({type:'uint8array',compression}));
}
async function jobFor(bytes,patch={}) { return {claimed:true,id:ID,lease_token:LEASE,filename:'TEST_PPIC_CUKAI_V002_CUTOFF_20NOV.xlsx',division:'CUKAI',period:'2026-11',version:'V002',cutoff:'2026-11-20',size_bytes:bytes.length,sha256:await sha256(bytes),download_url:SAFE_URL,...patch}; }
const request=(body={job_id:ID,nonce:NONCE},headers={})=>new Request('https://example.invalid/functions/v1/ppic-auto-import',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});

function mockService(job,{alreadyRegistered=false,metadataMatch=true,claimAllowed=true,uploadError=null,registrationError=null,storedBytes=null,raceOnUpload=false,latest='2026-11-20',processed=false}={}) {
  const calls=[],objects=[],completed=[];let exists=alreadyRegistered;
  const slug=job.division.toLowerCase().replaceAll(' ','_'),document='PPIC_202611_'+job.division.replaceAll(' ','_')+'_'+job.sha256.slice(0,16),locator='ppic-private-sources/'+job.period+'/'+slug+'/'+job.sha256+'.xlsx';
  return {
    calls,objects,completed,
    auth:{getUser:async token=>({data:{user:{id:token==='owner'?OWNER:'unrelated-user',user_metadata:{owner:true}}},error:null})},
    storage:{from:bucket=>({
      upload:async(p,b,o)=>{calls.push(['upload',bucket,p,o]);objects.push(b);if(raceOnUpload)exists=true;return {error:uploadError};},
      download:async p=>{calls.push(['download',p]);return {data:storedBytes?new Blob([storedBytes]):null,error:storedBytes?null:{message:'not found'}};},
      remove:async()=>{throw Error('Immutable source removal is forbidden');}
    })},
    rpc:async(name,args)=>{
      calls.push([name,args]);
      if(name==='ppic_auto_import_claim')return {data:claimAllowed&&args.p_nonce===NONCE?job:{claimed:false},error:null};
      if(name==='ppic_auto_import_source_check')return {data:{exists,matching:metadataMatch,document_id:exists?document:null,private_locator:exists?locator:null,latest_report_cutoff:latest,already_processed:processed},error:null};
      if(name==='ppic_register_uploaded_source'){if(registrationError)return {error:registrationError};exists=true;return {data:{duplicate:false,registered:true},error:null};}
      if(name==='ppic_auto_import_complete'){assert.equal(args.p_lease_token,LEASE);completed.push(args);return {data:{ok:true,status:args.p_status,document_id:args.p_document_id,report_status:args.p_report_status},error:null};}
      if(name==='ppic_auto_import_status')return {data:{config:{enabled:true,automation_id:'synthetic-automation',download_url:SAFE_URL},jobs:[{id:ID,filename:job.filename,division:job.division,status:'IMPORTED',message:'Tersimpan '+SAFE_URL,nonce:NONCE,lease_token:LEASE,download_url:SAFE_URL}],counts:{total:1,imported:1},source_policy:{period:args.p_period,complete:true,excluded_document_ids:[]}},error:null};
      throw Error('Unexpected RPC '+name);
    }
  };
}

test('job metadata validates real dates and protects September LOCKED',async()=>{
  const job=await jobFor(await fixture());assert.equal(validateJob(job,NOW),job);
  for(const patch of [{period:'2026-09',cutoff:'2026-09-30'},{cutoff:'2026-11-31'},{period:'2026-02',cutoff:'2026-02-30'},{cutoff:'2026-12-01'},{version:'V2'},{size_bytes:MAX_XLSX_BYTES+1},{sha256:'abc'},{filename:'../../private.xlsx'}])assert.throws(()=>validateJob({...job,...patch},NOW));
});

test('download URL permits only connector signed-transfer provider and rejects SSRF',()=>{
  assert.equal(validateDownloadUrl(SAFE_URL),SAFE_URL);
  for(const u of ['http://sdmntprindiasocentral.oaiusercontent.com/files/'+ID+'/raw?x=y','https://169.254.169.254/latest/meta-data','https://127.0.0.1/','https://sdmntprindiasocentral.oaiusercontent.com.evil.test/files/'+ID+'/raw?x=y','https://user:pass@sdmntprindiasocentral.oaiusercontent.com/files/'+ID+'/raw?x=y','https://sdmntprindiasocentral.oaiusercontent.com:8443/files/'+ID+'/raw?x=y','https://sdmntprindiasocentral.oaiusercontent.com/other?x=y',SAFE_URL+'#fragment',SAFE_URL.split('?')[0]])assert.throws(()=>validateDownloadUrl(u),{code:'UNTRUSTED_URL'});
});

test('streaming download enforces length and disables redirects',async()=>{
  const bytes=await fixture(),job=await jobFor(bytes);let options;
  assert.deepEqual(await fetchSource(job,async(url,opts)=>{options=opts;return new Response(bytes,{headers:{'content-length':String(bytes.length)}});}),bytes);
  assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');
  await assert.rejects(fetchSource(job,async()=>Response.redirect('https://evil.test/',302)),{code:'DOWNLOAD_FAILED'});
  await assert.rejects(fetchSource(job,async()=>new Response(bytes,{headers:{'content-length':String(bytes.length+1)}})),{code:'SIZE_MISMATCH'});
  await assert.rejects(readBoundedStream(new Response(new Uint8Array(30)).body,20),{code:'SIZE_LIMIT'});
  await assert.rejects(readBoundedStream(new Response(new Uint8Array(10)).body,30,20),{code:'SIZE_MISMATCH'});
});

test('valid XLSX ZIP and PPIC metadata are independently verified',async()=>{
  const bytes=await fixture(),job=await jobFor(bytes),checked=await validateWorkbook(bytes,job,deps);
  assert.ok(inspectZip(bytes).entries.size>=4);assert.equal(checked.metadata.cutoff,'2026-11-20');assert.equal(checked.metadata.division,'CUKAI');
  const mismatch=await fixture({cutoff:'2026-11-18'});await assert.rejects(validateWorkbook(mismatch,job,deps),{code:'METADATA_CONFLICT'});
  const ambiguous=await fixture({extraRows:[['Cut-off','2026-11-18']]});await assert.rejects(validateWorkbook(ambiguous,job,deps),{code:'METADATA_CONFLICT'});
  const other=await fixture({metadataSheet:'SUMMARY'});await assert.rejects(validateWorkbook(other,job,deps),{code:'UPLOAD_METADATA_REQUIRED'});
});

test('prefixed OpenXML namespaces from chat-generated XLSX are read correctly',async()=>{
  const bytes=await fixture({namespacePrefix:true}),result=await validateWorkbook(bytes,await jobFor(bytes),deps);assert.equal(result.metadata.division,'CUKAI');assert.equal(result.metadata.cutoff,'2026-11-20');
});

async function existingReaders(){
  const uploadSource=await fs.readFile(new URL('../supabase/functions/ppic-owner-upload/index.ts',import.meta.url),'utf8');
  const uploadExpression=/const parsed=(new XMLParser\(\{[^\n]+\}\))\.parse\(xml\)/.exec(uploadSource)?.[1];assert.ok(uploadExpression,'Manual uploader parser must remain observable');
  const uploadParser=new Function('XMLParser','return '+uploadExpression)(XMLParser);
  const rebuildSource=await fs.readFile(new URL('../supabase/functions/ppic-sdm-rebuild/index.ts',import.meta.url),'utf8');
  const rebuildExpression=/const parser=(new XMLParser\(\{[^\n]+\}\));/.exec(rebuildSource)?.[1];assert.ok(rebuildExpression);
  const parser=new Function('XMLParser','return '+rebuildExpression)(XMLParser);
  const start=rebuildSource.indexOf('class CompactXlsx {'),end=rebuildSource.indexOf('async function pack(',start);assert.ok(start>=0&&end>start);
  const declaration=stripTypeScriptTypes(rebuildSource.slice(start,end));
  const arr=v=>v===undefined||v===null?[]:Array.isArray(v)?v:[v],text=v=>typeof v==='string'?v:v&&typeof v==='object'?String(v['#text']||''):'';
  const CompactXlsx=new Function('JSZip','parser','arr','text',declaration+'\nreturn CompactXlsx;')(JSZip,parser,arr,text);
  return {uploadParser,CompactXlsx};
}

test('existing manual upload and SDM readers keep unprefixed and prefixed XML compatibility',async()=>{
  const {uploadParser,CompactXlsx}=await existingReaders();
  for(const namespacePrefix of [false,true]){
    const bytes=await fixture({namespacePrefix}),zip=await JSZip.loadAsync(bytes),book=uploadParser.parse(await zip.file('xl/workbook.xml').async('string'));
    assert.equal(book.workbook.sheets.sheet['@_name'],'PPIC_UPLOAD');
    const parsed=await CompactXlsx.open(bytes);assert.equal(parsed.sheets.has('PPIC_UPLOAD'),true);assert.equal((await parsed.rows('PPIC_UPLOAD')).get(1).B,'CUKAI');
  }
});

test('ZIP CRC and decompressed-size bounds reject corruption',async()=>{
  const bytes=await fixture({compression:'STORE'}),corrupt=new Uint8Array(bytes),needle=new TextEncoder().encode('2026-11-20');
  let at=-1;for(let i=0;i<corrupt.length-needle.length;i++)if(needle.every((b,j)=>corrupt[i+j]===b)){at=i;break;}assert.ok(at>=0);corrupt[at+9]=49;
  await assert.rejects(validateWorkbook(corrupt,await jobFor(corrupt),deps),{code:'INVALID_ZIP'});
  const small=new Uint8Array(bytes),view=new DataView(small.buffer);let central=-1;for(let i=0;i<small.length-46;i++)if(view.getUint32(i,true)===0x02014b50&&view.getUint32(i+24,true)>10){central=i;break;}assert.ok(central>=0);view.setUint32(central+24,1,true);
  await assert.rejects(validateWorkbook(small,await jobFor(small),deps),{code:'ZIP_LIMIT'});
});

// Async factory tests are separate from assertion callbacks so all rejections are awaited.
test('macro and external-object ZIP entries are rejected before decompression',async()=>{
  for(const extraFiles of [{'xl/vbaProject.bin':'macro'},{'xl/externalLinks/externalLink1.xml':'external'},{'../outside.xml':'escape'}]){
    const bytes=await fixture({extraFiles});assert.throws(()=>inspectZip(bytes));
  }
});

test('SDM requires detail sheets and an actual source cutoff equal to upload metadata',async()=>{
  const bytes=await fixture({division:'SDM VERPACK'}),job=await jobFor(bytes,{division:'SDM VERPACK'});
  await assert.rejects(validateWorkbook(bytes,job,deps),{code:'SDM_DETAIL_SHEETS_REQUIRED'});
  const detail=await fixture({division:'SDM VERPACK',extraSheets:['INPUT DATA']}),wrongDates={...deps,sdmParsers:{verpack:async()=>({cutoff:'2026-11-19',coverageStart:'2026-11-13',rows:[{}],holds:[]})}};
  await assert.rejects(validateWorkbook(detail,job,wrongDates),{code:'SOURCE_CUTOFF_MISMATCH'});
});

test('worker rejects malformed/expired nonce and browser invocation without touching storage',async()=>{
  const bytes=await fixture(),job=await jobFor(bytes),service=mockService(job,{claimAllowed:false}),handler=createImportHandler({service,now:()=>NOW,workbookDependencies:deps,fetcher:()=>{throw Error('must not fetch');}});
  assert.equal((await handler(request({job_id:ID,nonce:'wrong'}))).status,403);
  assert.equal((await handler(request())).status,403);
  assert.equal((await handler(request(undefined,{origin:ORIGIN}))).status,403);
  assert.equal((await handler(new Request('https://example.invalid/'))).status,405);
  assert.equal(service.objects.length,0);
});

test('worker archives verified bytes and registers immutable hash address',async()=>{
  const bytes=await fixture(),job=await jobFor(bytes),service=mockService(job),handler=createImportHandler({service,now:()=>NOW,workbookDependencies:deps,fetcher:async()=>new Response(bytes)});
  const response=await handler(request()),body=await response.json();assert.equal(response.status,200);assert.equal(body.status,'IMPORTED');assert.equal(body.report_status,'ARCHIVE_ONLY');
  assert.equal(service.objects.length,1);assert.deepEqual(service.objects[0],bytes);assert.equal(service.completed[0].p_status,'IMPORTED');
  const registration=service.calls.find(x=>x[0]==='ppic_register_uploaded_source')[1];assert.equal(registration.p_private_locator,`ppic-private-sources/2026-11/cukai/${job.sha256}.xlsx`);
  assert.equal(service.calls.find(x=>x[0]==='upload')[3].upsert,false);
});

test('existing identical bytes skip download; mismatched metadata fails without transfer',async()=>{
  const bytes=await fixture(),job=await jobFor(bytes);
  for(const matching of [true,false]){
    const service=mockService(job,{alreadyRegistered:true,metadataMatch:matching}),handler=createImportHandler({service,now:()=>NOW,workbookDependencies:deps,fetcher:()=>{throw Error('must not download');}}),r=await handler(request()),b=await r.json();
    assert.equal(b.status,matching?'DUPLICATE':undefined);if(!matching)assert.equal(b.code,'SOURCE_METADATA_CONFLICT');assert.equal(service.objects.length,0);
  }
});

test('wrong file hash never reaches private storage and does not leak source URL',async()=>{
  const bytes=await fixture(),job=await jobFor(bytes,{sha256:'0'.repeat(64)}),service=mockService(job),handler=createImportHandler({service,now:()=>NOW,workbookDependencies:deps,fetcher:async()=>new Response(bytes)}),r=await handler(request()),b=await r.json();
  assert.equal(b.code,'HASH_MISMATCH');assert.equal(service.objects.length,0);assert.equal(service.completed[0].p_status,'FAILED');assert.ok(!JSON.stringify(b).includes('oaiusercontent'));
});

test('storage collision is recovered only with exact bytes and never removes a registered object',async()=>{
  const bytes=await fixture(),job=await jobFor(bytes);
  for(const raceOnUpload of [true,false]){
    const service=mockService(job,{uploadError:{statusCode:409,message:'already exists'},storedBytes:bytes,raceOnUpload}),handler=createImportHandler({service,now:()=>NOW,workbookDependencies:deps,fetcher:async()=>new Response(bytes)}),r=await handler(request()),b=await r.json();
    assert.equal(b.ok,true);assert.equal(b.status,raceOnUpload?'DUPLICATE':'IMPORTED');
  }
  const service=mockService(job,{uploadError:{statusCode:409,message:'already exists'},storedBytes:new Uint8Array(bytes.length)}),handler=createImportHandler({service,now:()=>NOW,workbookDependencies:deps,fetcher:async()=>new Response(bytes)}),b=await (await handler(request())).json();assert.equal(b.code,'STORAGE_CONFLICT');
});

test('registration failure leaves immutable object intact for retry',async()=>{
  const bytes=await fixture(),job=await jobFor(bytes),service=mockService(job,{registrationError:{message:'database unreachable '+SAFE_URL}}),handler=createImportHandler({service,now:()=>NOW,workbookDependencies:deps,fetcher:async()=>new Response(bytes)}),b=await(await handler(request())).json();
  assert.equal(b.code,'REGISTRATION_PENDING');assert.equal(service.objects.length,1);assert.ok(!JSON.stringify(b).includes(SAFE_URL));assert.equal(service.completed[0].p_status,'FAILED');
});

test('report eligibility never promotes an older SDM cutoff',()=>{
  assert.equal(reportState({division:'SDM VERPACK',cutoff:'2026-11-19'},{latest_report_cutoff:'2026-11-20'}),'SUPERSEDED');
  assert.equal(reportState({division:'SDM VERPACK',cutoff:'2026-11-20'},{latest_report_cutoff:'2026-11-20'}),'REVIEW_REQUIRED');
  assert.equal(reportState({division:'SDM GILING',cutoff:'2026-11-19'},{latest_report_cutoff:'2026-11-20',already_processed:true}),'PROCESSED');
  assert.equal(reportState({division:'GILING',cutoff:'2026-11-20'},{latest_report_cutoff:'2026-11-19'}),'ARCHIVE_ONLY');
});

test('status requires exact Owner and Origin, and strips private capabilities',async()=>{
  const service=mockService(await jobFor(await fixture())),handler=createStatusHandler({service});
  assert.equal((await handler(new Request('https://example.invalid/'))).status,403);
  assert.equal((await handler(new Request('https://example.invalid/',{headers:{origin:ORIGIN}}))).status,401);
  assert.equal((await handler(new Request('https://example.invalid/',{headers:{origin:ORIGIN,authorization:'Bearer other'}}))).status,403);
  const response=await handler(new Request('https://example.invalid/',{headers:{origin:ORIGIN,authorization:'Bearer owner'}})),body=await response.json();
  assert.equal(body.ok,true);assert.equal(body.config.cadence,'HOURLY');assert.equal(body.config.timezone,'Asia/Jakarta');assert.equal(body.jobs.length,1);assert.deepEqual(body.counts,{total:1,queued:0,processing:0,imported:1,duplicate:0,failed:0});
  const text=JSON.stringify(body);for(const forbidden of [NONCE,LEASE,SAFE_URL,'download_url','lease_token'])assert.ok(!text.includes(forbidden));
  assert.equal(body.counts.imported,1);assert.equal(body.source_policy.complete,true);
  const periodResponse=await handler(new Request('https://example.invalid/?period=2026-11',{headers:{origin:ORIGIN,authorization:'Bearer owner'}}));assert.equal((await periodResponse.json()).source_policy.period,'2026-11');
});

test('status source policy covers all 200 catalog entries and fails closed on missing or mismatched policy',async()=>{
  const service=mockService(await jobFor(await fixture())),baseRpc=service.rpc;
  const ids=Array.from({length:200},(_,i)=>'PPIC_CATALOG_DOCUMENT_'+String(i).padStart(3,'0'));
  let policy={period:'2026-11',complete:true,excluded_document_ids:ids};
  service.rpc=async(name,args)=>{const result=await baseRpc(name,args);if(name==='ppic_auto_import_status')result.data.source_policy=policy;return result;};
  const handler=createStatusHandler({service}),statusRequest=()=>new Request('https://example.invalid/?period=2026-11',{headers:{origin:ORIGIN,authorization:'Bearer owner'}});
  const result=await (await handler(statusRequest())).json();assert.equal(result.source_policy.excluded_document_ids.length,200);assert.equal(result.source_policy.excluded_document_ids[199],ids[199]);
  for(const invalid of [undefined,{complete:false,period:'2026-11',excluded_document_ids:ids},{complete:true,period:'2026-12',excluded_document_ids:ids},{complete:true,period:'2026-11',excluded_document_ids:[...ids,'EXCESS_DOCUMENT']}]){policy=invalid;assert.equal((await handler(statusRequest())).status,503);}
  const wrongType=new Request('https://example.invalid/',{method:'POST',headers:{origin:ORIGIN,authorization:'Bearer owner','content-type':'application/json'},body:JSON.stringify({period:['2026-11']})});assert.equal((await handler(wrongType)).status,400);
});

if(process.env.PPIC_AUTO_LOCAL_DIR)test('local finalized XLSX outputs pass the production parser and cutoff checks',async()=>{
  const files=(await fs.readdir(process.env.PPIC_AUTO_LOCAL_DIR)).filter(n=>n.endsWith('.xlsx'));assert.equal(files.length,8);
  const categories=[['PITA_CUKAI','CUKAI'],['BARANG_JADI','BARANG JADI'],['SDM_VERPACK','SDM VERPACK'],['VERPACK','VERPACK'],['BAHAN_BAKU','BAHAN BAKU'],['KAS_BANK','KAS BANK'],['GILING','GILING'],['TSG','TSG']];
  const {uploadParser,CompactXlsx}=await existingReaders();
  for(const filename of files){
    const division=categories.find(([needle])=>filename.includes('_'+needle+'_'))?.[1],version=/_V(\d{3,})_/.exec(filename)?.[0].slice(1,-1),day=/_CUTOFF_(\d{2})NOV_/.exec(filename)?.[1],cutoff='2026-11-'+day,bytes=new Uint8Array(await fs.readFile(path.join(process.env.PPIC_AUTO_LOCAL_DIR,filename)));
    const job=await jobFor(bytes,{filename,division,version,cutoff});validateJob(job,NOW);const r=await validateWorkbook(bytes,job,deps);assert.equal(r.metadata.cutoff,cutoff);assert.equal(r.metadata.division,division);
    const zip=await JSZip.loadAsync(bytes),book=uploadParser.parse(await zip.file('xl/workbook.xml').async('string')),sheetEntries=Array.isArray(book.workbook.sheets.sheet)?book.workbook.sheets.sheet:[book.workbook.sheets.sheet];assert.ok(sheetEntries.length>0);assert.equal(validateSdmSheetNames(sheetEntries.map(x=>x['@_name']),division),null);
    const parsed=await CompactXlsx.open(bytes);assert.equal(parsed.sheets.size,sheetEntries.length);assert.ok((await parsed.rows(parsed.sheets.has('PPIC_UPLOAD')?'PPIC_UPLOAD':'PETUNJUK_PPIC')).size>0);
    if(division==='SDM VERPACK'){const detail=await verpack(parsed,{document_id:'SYNTHETIC_VALIDATION_ID',cutoff},job.period);assert.equal(detail.cutoff,cutoff);assert.ok(detail.rows.length>0);assert.ok(detail.rows.every(r=>Number.isFinite(r.qty)&&Number.isFinite(r.wage)));}
  }
});
