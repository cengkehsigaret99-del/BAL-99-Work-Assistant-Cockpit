// Private automatic ingestion. No credentials, signed source URLs or personal fixtures belong here.
export const MAX_XLSX_BYTES = 10 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 1000;
export const MAX_ZIP_EXPANDED = 64 * 1024 * 1024;
export const MAX_ZIP_ENTRY = 16 * 1024 * 1024;
export const BUCKET = 'ppic-private-sources';
export const OWNER = 'f43fd842-89b5-4f27-a49d-120f0d6742c1';
export const ORIGIN = 'https://cengkehsigaret99-del.github.io';
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const DIVISIONS = new Set(['BAHAN BAKU','GILING','VERPACK','SDM GILING','SDM VERPACK','BARANG JADI','CUKAI','DO','KAS BANK','TSG']);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const array = value => value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
const xmlText = value => typeof value === 'string' || typeof value === 'number' ? String(value) : value && typeof value === 'object' ? String(value['#text'] ?? '') : '';

export class ImportError extends Error {
  constructor(code, message) { super(message); this.name = 'ImportError'; this.code = code; }
}
const fail = (code, message) => { throw new ImportError(code, message); };
export const isDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0,10) === value;

export function validateJob(job, now = new Date()) {
  if (!job || !uuid.test(String(job.id || '')) || !uuid.test(String(job.lease_token || ''))) fail('INVALID_JOB', 'Identitas pekerjaan impor tidak valid.');
  if (!/^[A-Za-z0-9][A-Za-z0-9._() -]{5,159}\.xlsx$/i.test(String(job.filename || '')) || !DIVISIONS.has(job.division)) fail('INVALID_METADATA', 'Nama atau kategori file tidak sesuai kontrak PPIC.');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(job.period || '')) || !/^V\d{3,9}$/.test(String(job.version || '')) || !isDate(job.cutoff) || !job.cutoff.startsWith(job.period + '-')) fail('INVALID_METADATA', 'Periode, versi atau cut-off file tidak valid.');
  if (job.period <= '2026-09') fail('LOCKED_PERIOD', 'Periode September 2026 dan sebelumnya tidak menerima impor otomatis.');
  const tomorrowJakarta = new Date(now.getTime() + (24 + 7) * 60 * 60 * 1000).toISOString().slice(0,10);
  if (job.cutoff > tomorrowJakarta) fail('FUTURE_CUTOFF', 'Cut-off sumber melampaui tanggal yang diperbolehkan.');
  if (!/^[a-f0-9]{64}$/.test(String(job.sha256 || '')) || !Number.isInteger(job.size_bytes) || job.size_bytes < 100 || job.size_bytes > MAX_XLSX_BYTES) fail('INVALID_FILE_IDENTITY', 'Checksum atau ukuran file tidak valid.');
  return job;
}

export function validateDownloadUrl(value) {
  if (typeof value !== 'string' || value.length < 40 || value.length > 8192) fail('UNTRUSTED_URL', 'Alamat unduh sumber tidak diizinkan.');
  let url; try { url = new URL(value); } catch { fail('UNTRUSTED_URL', 'Alamat unduh sumber tidak diizinkan.'); }
  // Only the signed transfer provider returned by the official Drive connector.
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || !/^sdmntpr[a-z0-9-]+\.oaiusercontent\.com$/.test(url.hostname) || !/^\/files\/[a-f0-9-]{36}\/raw$/.test(url.pathname) || !uuid.test(url.pathname.split('/')[2]) || !url.search) fail('UNTRUSTED_URL', 'Alamat unduh sumber tidak diizinkan.');
  return url.href;
}

export async function readBoundedStream(stream, maximum, expected = null) {
  if (!stream) fail('EMPTY_RESPONSE', 'Isi file sumber tidak tersedia.');
  const reader = stream.getReader(), chunks = []; let length = 0;
  try {
    while (true) {
      const {done,value} = await reader.read(); if (done) break;
      if (!(value instanceof Uint8Array)) fail('INVALID_RESPONSE', 'Isi unduhan tidak valid.');
      length += value.byteLength;
      if (length > maximum || expected !== null && length > expected) { await reader.cancel(); fail('SIZE_LIMIT', 'Ukuran unduhan melampaui batas atau ukuran sumber.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (expected !== null && length !== expected) fail('SIZE_MISMATCH', 'Ukuran unduhan berbeda dari sumber yang didaftarkan.');
  const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; } return bytes;
}

export async function fetchSource(job, fetcher = fetch) {
  const url = validateDownloadUrl(job.download_url), controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    let response;
    try { response = await fetcher(url, {method:'GET',redirect:'error',credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal,headers:{accept:XLSX_MIME + ', application/octet-stream'}}); }
    catch { fail('DOWNLOAD_FAILED', 'Unduhan sumber gagal atau alamat sementara telah kedaluwarsa.'); }
    if (!response.ok || response.status !== 200 || response.redirected) fail('DOWNLOAD_FAILED', 'Unduhan sumber gagal atau alamat sementara telah kedaluwarsa.');
    const declared = response.headers.get('content-length');
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) !== job.size_bytes)) fail('SIZE_MISMATCH', 'Ukuran unduhan berbeda dari sumber yang didaftarkan.');
    return await readBoundedStream(response.body, MAX_XLSX_BYTES, job.size_bytes);
  } catch (error) { if (error instanceof ImportError) throw error; fail('DOWNLOAD_FAILED', 'Unduhan sumber gagal atau alamat sementara telah kedaluwarsa.'); }
  finally { clearTimeout(timeout); }
}

export async function sha256(bytes) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join(''); }

// Validate the central directory before any decompression. ZIP64, encryption and path traversal are not accepted.
export function inspectZip(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 100 || bytes.byteLength > MAX_XLSX_BYTES) fail('INVALID_XLSX', 'File harus berupa XLSX biasa dengan ukuran paling besar 10 MiB.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), u16 = p=>view.getUint16(p,true), u32 = p=>view.getUint32(p,true);
  if (u32(0) !== 0x04034b50) fail('INVALID_XLSX', 'File bukan wadah ZIP XLSX yang didukung.');
  let end = -1; for (let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--) if (u32(p)===0x06054b50 && p+22+u16(p+20)===bytes.length) { end=p; break; }
  if (end<0 || u16(end+4)!==0 || u16(end+6)!==0 || u16(end+8)!==u16(end+10)) fail('INVALID_ZIP', 'Struktur arsip XLSX tidak lengkap.');
  const count=u16(end+10), size=u32(end+12), start=u32(end+16);
  if (!count || count>MAX_ZIP_ENTRIES || size===0xffffffff || start===0xffffffff || start+size!==end) fail('ZIP_LIMIT', 'Struktur atau jumlah bagian XLSX melampaui batas.');
  const entries=new Map(); let cursor=start, expanded=0;
  for(let i=0;i<count;i++) {
    if(cursor+46>end || u32(cursor)!==0x02014b50) fail('INVALID_ZIP','Daftar bagian XLSX tidak valid.');
    const flags=u16(cursor+8), method=u16(cursor+10), compressed=u32(cursor+20), unpacked=u32(cursor+24), nl=u16(cursor+28), el=u16(cursor+30), cl=u16(cursor+32), local=u32(cursor+42), next=cursor+46+nl+el+cl;
    if(next>end || flags&1 || ![0,8].includes(method) || compressed===0xffffffff || unpacked===0xffffffff || local===0xffffffff) fail('INVALID_ZIP','Arsip terenkripsi atau format ZIP tidak didukung.');
    const name=new TextDecoder().decode(bytes.subarray(cursor+46,cursor+46+nl));
    if(!name || name.includes('\\') || name.includes('\0') || name.startsWith('/') || name.split('/').some(x=>x==='.'||x==='..') || entries.has(name)) fail('UNSAFE_ZIP_PATH','Nama bagian XLSX tidak aman atau berulang.');
    if(/(?:^|\/)vbaProject\.bin$/i.test(name) || /^xl\/(?:externalLinks|embeddings)\//i.test(name)) fail('ACTIVE_CONTENT','File otomatis harus tanpa makro, tautan workbook eksternal atau objek tertanam.');
    expanded+=unpacked; if(unpacked>MAX_ZIP_ENTRY || expanded>MAX_ZIP_EXPANDED) fail('ZIP_LIMIT','Ukuran isi XLSX melampaui batas pembacaan.');
    if(local+30>start || u32(local)!==0x04034b50 || (u16(local+6)&1)) fail('INVALID_ZIP','Header bagian XLSX tidak valid.');
    const localNameLength=u16(local+26), localExtraLength=u16(local+28), dataStart=local+30+localNameLength+localExtraLength;
    if(dataStart+compressed>start || new TextDecoder().decode(bytes.subarray(local+30,local+30+localNameLength))!==name) fail('INVALID_ZIP','Alamat bagian XLSX tidak sesuai direktori.');
    entries.set(name,{name,compressed,unpacked,crc:u32(cursor+16),directory:name.endsWith('/')}); cursor=next;
  }
  if(cursor!==end || !entries.has('[Content_Types].xml') || !entries.has('xl/workbook.xml') || !entries.has('xl/_rels/workbook.xml.rels')) fail('INVALID_XLSX','Bagian workbook XLSX wajib tidak ditemukan.');
  return {entries,expanded};
}

const crcTable = new Uint32Array(256); for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crcTable[n]=c>>>0;}
async function readZipEntry(zip, info, collect=false) {
  if(info.directory)return new Uint8Array();
  const entry=zip.file(info.name); if(!entry)fail('INVALID_ZIP','Bagian XLSX tidak dapat dibaca.');
  return await new Promise((resolve,reject)=>{
    let seen=0,crc=0xffffffff,settled=false;const chunks=[],stream=entry.internalStream('uint8array');
    const abort=(error)=>{if(settled)return;settled=true;stream.pause();reject(error instanceof ImportError?error:new ImportError('INVALID_ZIP','Isi bagian XLSX rusak.'));};
    stream.on('data',chunk=>{if(settled)return;seen+=chunk.length;if(seen>info.unpacked || seen>MAX_ZIP_ENTRY)return abort(new ImportError('ZIP_LIMIT','Ukuran isi XLSX berbeda dari direktori.'));for(const b of chunk)crc=crcTable[(crc^b)&0xff]^(crc>>>8);if(collect)chunks.push(chunk);});
    stream.on('error',abort);
    stream.on('end',()=>{if(settled)return;if(seen!==info.unpacked || ((crc^0xffffffff)>>>0)!==info.crc)return abort(new ImportError('INVALID_ZIP','Checksum bagian XLSX tidak sesuai.'));settled=true;const output=new Uint8Array(collect?seen:0);let at=0;for(const c of chunks){output.set(c,at);at+=c.length;}resolve(output);});
    stream.resume();
  });
}

const normalizeLabel = value => String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g,' ');
function excelDate(value,date1904=false) {
  if(typeof value==='string' && isDate(value.slice(0,10)))return value.slice(0,10);
  if(typeof value!=='number'||!Number.isFinite(value)||value<1||value>100000)return '';
  return new Date(Date.UTC(date1904?1904:1899,date1904?0:11,date1904?1:30)+Math.floor(value)*86400000).toISOString().slice(0,10);
}

export async function validateWorkbook(bytes, job, {JSZip,XMLParser,validateSdmSheetNames,sdmParsers}={}) {
  const structure=inspectZip(bytes);
  let zip;try{zip=await JSZip.loadAsync(bytes,{checkCRC32:false});}catch{fail('INVALID_ZIP','Arsip XLSX tidak dapat dibuka.');}
  // Bounded streaming CRC checks also stop dishonest decompressed-size headers.
  for(const info of structure.entries.values())await readZipEntry(zip,info,false);
  const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_',parseTagValue:false,trimValues:false,processEntities:false,removeNSPrefix:true});
  const parsed=new Map();
  async function xml(path,limit=MAX_ZIP_ENTRY) {
    if(parsed.has(path))return parsed.get(path);
    const info=structure.entries.get(path);if(!info||info.unpacked>limit)fail('XML_LIMIT','Bagian XML workbook tidak tersedia atau terlalu besar.');
    const text=new TextDecoder().decode(await readZipEntry(zip,info,true));if(/<!\s*(?:DOCTYPE|ENTITY)/i.test(text))fail('UNSAFE_XML','Deklarasi eksternal XML tidak diizinkan.');
    let value;try{value=parser.parse(text);}catch{fail('INVALID_XML','XML workbook tidak dapat dibaca.');}parsed.set(path,value);return value;
  }
  const book=await xml('xl/workbook.xml',1024*1024),rels=await xml('xl/_rels/workbook.xml.rels',1024*1024);
  const relationships=new Map(array(rels.Relationships?.Relationship).map(r=>[r['@_Id'],r]));
  const sheets=new Map();
  for(const sheet of array(book.workbook?.sheets?.sheet)) {
    const name=String(sheet['@_name']??''),rel=relationships.get(sheet['@_id']??sheet['@_r:id']);
    if(!name||sheets.has(name)||!rel||String(rel['@_TargetMode']||'').toLowerCase()==='external')fail('INVALID_WORKBOOK','Daftar sheet workbook tidak valid.');
    let target=String(rel['@_Target']||'');target=target.startsWith('/')?target.slice(1):target.startsWith('xl/')?target:'xl/'+target;
    if(target.split('/').some(x=>x==='..'||x==='.')||!structure.entries.has(target))fail('INVALID_WORKBOOK','Target sheet workbook tidak sesuai.');
    sheets.set(name,target);
  }
  if(!sheets.size)fail('INVALID_WORKBOOK','Workbook tidak memuat sheet.');
  const sdmError=validateSdmSheetNames?.([...sheets.keys()],job.division);if(sdmError)fail('SDM_DETAIL_SHEETS_REQUIRED',sdmError);
  let shared=[];if(structure.entries.has('xl/sharedStrings.xml')){const ss=await xml('xl/sharedStrings.xml',4*1024*1024);shared=array(ss.sst?.si).map(si=>si?.t!==undefined?xmlText(si.t):array(si?.r).map(r=>xmlText(r.t)).join(''));}
  const rowCache=new Map();
  async function rows(name) {
    if(rowCache.has(name))return rowCache.get(name);
    if(!sheets.has(name))fail('INVALID_WORKBOOK','Sheet wajib tidak ditemukan.');
    const value=await xml(sheets.get(name)),result=new Map();
    for(const row of array(value.worksheet?.sheetData?.row)){
      const rn=Number(row['@_r']);if(!Number.isInteger(rn)||rn<1)continue;const cells={};
      for(const cell of array(row.c)){
        const col=/^[A-Z]+/.exec(String(cell['@_r']||''))?.[0];if(!col)continue;const type=cell['@_t'],raw=cell.v&&typeof cell.v==='object'?xmlText(cell.v):cell.v;
        let v=raw;if(type==='e')fail('FORMULA_ERROR','Workbook memuat kesalahan hasil rumus.');
        if(type==='s'){if(!Number.isInteger(Number(raw))||shared[Number(raw)]===undefined)fail('INVALID_WORKBOOK','Indeks teks workbook tidak valid.');v=shared[Number(raw)];}
        else if(type==='inlineStr')v=cell.is?.t!==undefined?xmlText(cell.is.t):array(cell.is?.r).map(r=>xmlText(r.t)).join('');
        else if(type==='b')v=raw==='1';
        else if(raw!==undefined&&raw!==null&&String(raw).trim()!==''){const n=Number(raw);v=Number.isFinite(n)?n:String(raw);}
        if(v!==undefined&&v!==null)cells[col]=v;
      }
      result.set(rn,cells);
    }
    rowCache.set(name,result);return result;
  }
  const name=sheets.has('PPIC_UPLOAD')?'PPIC_UPLOAD':sheets.has('PETUNJUK_PPIC')?'PETUNJUK_PPIC':null;
  if(!name)fail('UPLOAD_METADATA_REQUIRED','Workbook otomatis harus memuat PPIC_UPLOAD atau PETUNJUK_PPIC.');
  const metadata={};const wanted={division:new Set(['kategori unggah','kategori upload','divisi']),period:new Set(['periode']),version:new Set(['versi','versi unggah','versi upload']),cutoff:new Set(['cut off','cutoff','cut off unggah','cut off upload','cutoff transaksi','cut off buku utama'])};
  const date1904=String(book.workbook?.workbookPr?.['@_date1904']||'').toLowerCase();
  for(const [rn,cells]of await rows(name)){
    if(rn>50)continue;const entries=Object.entries(cells).sort((a,b)=>a[0].length-b[0].length||a[0].localeCompare(b[0]));
    for(let i=0;i<entries.length-1;i++)for(const [key,labels]of Object.entries(wanted))if(labels.has(normalizeLabel(entries[i][1]))){
      const v=key==='cutoff'?excelDate(entries[i+1][1],date1904==='true'||date1904==='1'):String(entries[i+1][1]).trim();
      if(metadata[key]!==undefined && metadata[key]!==v)fail('METADATA_CONFLICT','Metadata unggahan dalam workbook saling berbeda.');metadata[key]=v;
    }
  }
  for(const key of ['division','period','version','cutoff'])if(metadata[key]!==job[key])fail('METADATA_CONFLICT','Kategori, periode, versi atau cut-off workbook berbeda dari register.');
  const file={sheets,rows};let detail=null;
  if(job.division.startsWith('SDM ')){
    const parserFn=job.division==='SDM GILING'?sdmParsers?.giling:sdmParsers?.verpack;
    if(!parserFn)fail('SDM_VALIDATION_UNAVAILABLE','Pemeriksa rincian SDM tidak tersedia.');
    let part;try{part=await parserFn(file,{document_id:'AUTO_VALIDATION',cutoff:job.cutoff},job.period);}catch{fail('SDM_DETAILS_INVALID','Rincian SDM belum cocok dengan kontrol sumber.');}
    if(part.cutoff!==job.cutoff)fail('SOURCE_CUTOFF_MISMATCH','Cut-off rincian SDM berbeda dari metadata unggahan.');
    detail={coverage_start:part.coverageStart,cutoff:part.cutoff,rows:part.rows.length,held_rows:part.holds.length};
  }
  return {sheet_names:[...sheets.keys()],metadata,detail,zip_entries:structure.entries.size,expanded_bytes:structure.expanded};
}

export function reportState(job, source) {
  if(source?.already_processed===true)return 'PROCESSED';
  if(!job.division.startsWith('SDM '))return 'ARCHIVE_ONLY';
  if(isDate(source?.latest_report_cutoff) && job.cutoff<source.latest_report_cutoff)return 'SUPERSEDED';
  return 'REVIEW_REQUIRED';
}
const registrationArgs=job=>({p_document_id:'PPIC_'+job.period.replace('-','')+'_'+job.division.replace(/ /g,'_')+'_'+job.sha256.slice(0,16),p_division:job.division,p_period:job.period,p_cutoff:job.cutoff+'T00:00:00+07:00',p_version:job.version,p_sha256:job.sha256,p_private_locator:BUCKET+'/'+job.period+'/'+job.division.toLowerCase().replace(/ /g,'_')+'/'+job.sha256+'.xlsx'});
const sourceArgs=job=>({p_sha256:job.sha256,p_division:job.division,p_period:job.period,p_cutoff:job.cutoff,p_version:job.version});
const json=(value,status=200,extra={})=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...extra}});

export function createImportHandler({service,fetcher=fetch,now=()=>new Date(),workbookDependencies}) {
  return async request=>{
    if(request.method!=='POST')return json({ok:false,error:'Method not allowed'},405);
    if(request.headers.has('origin'))return json({ok:false,error:'Unauthorized'},403);
    let body;
    try{const bytes=await readBoundedStream(request.body,4096);body=JSON.parse(new TextDecoder().decode(bytes));}catch{return json({ok:false,error:'Invalid request'},400);}
    if(!body||Array.isArray(body)||!uuid.test(String(body.job_id||''))||!/^[a-f0-9]{64}$/.test(String(body.nonce||''))||Object.keys(body).some(k=>!['job_id','nonce'].includes(k)))return json({ok:false,error:'Unauthorized'},403);
    let claim;try{claim=await service.rpc('ppic_auto_import_claim',{p_job_id:body.job_id,p_nonce:body.nonce});}catch{return json({ok:false,error:'Import service unavailable'},503);}
    if(claim.error)return json({ok:false,error:'Import service unavailable'},503);
    if(claim.data?.claimed!==true)return json({ok:false,error:'Unauthorized'},403);
    const job=claim.data;
    const complete=async(status,documentId,reportStatus,message)=>{
      const result=await service.rpc('ppic_auto_import_complete',{p_job_id:job.id,p_lease_token:job.lease_token,p_status:status,p_document_id:documentId,p_report_status:reportStatus,p_message:message});
      if(result.error||result.data?.ok!==true)fail('COMPLETION_PENDING','Pencatatan akhir belum terkonfirmasi; pekerjaan akan diperiksa ulang.');
      return result.data;
    };
    const check=async()=>{const r=await service.rpc('ppic_auto_import_source_check',sourceArgs(job));if(r.error||!r.data)fail('REGISTRY_UNAVAILABLE','Register PPIC belum dapat diperiksa.');if(r.data.exists&&!r.data.matching)fail('SOURCE_METADATA_CONFLICT','File yang sama sudah terdaftar dengan metadata berbeda.');return r.data;};
    try{
      validateJob(job,now());let source=await check();
      if(source.exists){const done=await complete('DUPLICATE',source.document_id,reportState(job,source),'File yang sama telah tersimpan di PPIC; tidak dibuat salinan kedua.');return json({ok:true,status:done.status,job_id:job.id,document_id:done.document_id,report_status:done.report_status||reportState(job,source)});}
      const bytes=await fetchSource(job,fetcher);if(await sha256(bytes)!==job.sha256)fail('HASH_MISMATCH','Checksum unduhan berbeda dari sumber yang didaftarkan.');
      await validateWorkbook(bytes,job,workbookDependencies);
      source=await check();
      if(source.exists){const done=await complete('DUPLICATE',source.document_id,reportState(job,source),'File telah diterima proses lain; tidak dibuat salinan kedua.');return json({ok:true,status:done.status,job_id:job.id,document_id:done.document_id,report_status:done.report_status||reportState(job,source)});}
      const registration=registrationArgs(job),path=registration.p_private_locator.slice(BUCKET.length+1);
      const uploaded=await service.storage.from(BUCKET).upload(path,bytes,{contentType:XLSX_MIME,upsert:false,cacheControl:'0'});
      if(uploaded.error){
        const collision=String(uploaded.error.statusCode)==='409'||/already exists|duplicate/i.test(String(uploaded.error.message||''));
        if(!collision)fail('STORAGE_FAILED','Penyimpanan file privat gagal.');
        source=await check();
        if(source.exists){const done=await complete('DUPLICATE',source.document_id,reportState(job,source),'File telah tersimpan oleh proses lain.');return json({ok:true,status:done.status,job_id:job.id,document_id:done.document_id,report_status:done.report_status||reportState(job,source)});}
        // Recover an orphan from an interrupted earlier attempt, only after verifying its bytes.
        const stored=await service.storage.from(BUCKET).download(path);if(stored.error||!stored.data||stored.data.size!==job.size_bytes)fail('STORAGE_CONFLICT','Arsip yang sudah ada belum dapat diverifikasi.');
        const existing=new Uint8Array(await stored.data.arrayBuffer());if(await sha256(existing)!==job.sha256)fail('STORAGE_CONFLICT','Checksum arsip yang sudah ada tidak sesuai.');
      }
      const registered=await service.rpc('ppic_register_uploaded_source',registration);
      if(registered.error)fail('REGISTRATION_PENDING','File privat sudah tersimpan; pencatatan register perlu dicoba ulang.');
      source=await check();if(!source.exists||!source.matching||source.private_locator!==registration.p_private_locator)fail('REGISTRATION_PENDING','Pencatatan sumber belum terkonfirmasi.');
      const status=registered.data?.duplicate?'DUPLICATE':'IMPORTED',state=reportState(job,source);
      const message=state==='SUPERSEDED'?'File berhasil diarsipkan; laporan yang lebih baru tetap digunakan.':state==='PROCESSED'?'File sumber sudah digunakan laporan aktif.':state==='REVIEW_REQUIRED'?'File SDM berhasil diarsipkan; menunggu pemrosesan laporan SDM.':'File berhasil masuk Bank Data; laporan memerlukan pemrosesan terpisah.';
      const done=await complete(status,source.document_id,state,message);
      return json({ok:true,status:done.status,job_id:job.id,document_id:done.document_id,report_status:done.report_status||state});
    }catch(error){
      const safe=error instanceof ImportError?error:new ImportError('IMPORT_FAILED','Impor belum berhasil; pekerjaan dapat dicoba ulang.');
      try{await complete('FAILED',null,'REVIEW_REQUIRED',safe.code+': '+safe.message);}catch{/* Expiring lease enables a safe retry; never delete an immutable stored object. */}
      return json({ok:false,job_id:job.id,code:safe.code,error:safe.message},safe.code==='COMPLETION_PENDING'?503:422);
    }
  };
}

export function createStatusHandler({service}) {
  const cors={'access-control-allow-origin':ORIGIN,'access-control-allow-headers':'authorization, apikey, content-type','access-control-allow-methods':'GET,POST,OPTIONS','vary':'Origin'};
  return async request=>{
    if(request.headers.get('origin')!==ORIGIN)return json({ok:false,error:'Origin not allowed'},403);
    if(request.method==='OPTIONS')return json({ok:true},200,cors);
    if(!['GET','POST'].includes(request.method))return json({ok:false,error:'Method not allowed'},405,cors);
    const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'';if(!token)return json({ok:false,error:'Login Owner diperlukan'},401,cors);
    let user;try{user=await service.auth.getUser(token);}catch{return json({ok:false,error:'Authentication unavailable'},503,cors);}
    if(user.error||user.data?.user?.id!==OWNER)return json({ok:false,error:'Only verified Owner can view automatic imports'},403,cors);
    try{
      let period=new URL(request.url).searchParams.get('period');
      if(request.method==='POST'&&request.body){
        let payload;try{payload=JSON.parse(new TextDecoder().decode(await readBoundedStream(request.body,2048)));}catch{return json({ok:false,error:'Invalid request'},400,cors);}
        if(!payload||Array.isArray(payload)||Object.keys(payload).some(k=>k!=='period'))return json({ok:false,error:'Invalid request'},400,cors);
        if(payload.period!==undefined){if(period&&payload.period!==period)return json({ok:false,error:'Period mismatch'},400,cors);period=payload.period;}
      }
      if(period!==null&&period!==undefined&&(typeof period!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)))return json({ok:false,error:'Invalid period'},400,cors);
      const result=await service.rpc('ppic_auto_import_status',{p_period:period||null});if(result.error||!result.data)return json({ok:false,error:'Status impor belum tersedia'},503,cors);
      // Explicit allowlist prevents signed URLs, nonces, leases or raw internal errors escaping to the client.
      const data=result.data,config=data.config||{},counts={};for(const k of ['total','queued','processing','imported','duplicate','failed']){const n=Number(data.counts?.[k]??0);counts[k]=Number.isSafeInteger(n)&&n>=0?n:0;}
      if(data.source_policy?.complete!==true||!Array.isArray(data.source_policy.excluded_document_ids))return json({ok:false,error:'Kebijakan sumber otomatis belum tersedia'},503,cors);
      if((data.source_policy.period??null)!==(period||null))return json({ok:false,error:'Periode kebijakan sumber otomatis tidak sesuai'},503,cors);
      const excluded=data.source_policy.excluded_document_ids;if(excluded.length>200||excluded.some(id=>typeof id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{5,127}$/.test(id)))return json({ok:false,error:'Kebijakan sumber otomatis tidak valid'},503,cors);
      const jobs=array(data.jobs).slice(0,80).map(j=>Object.fromEntries(['id','filename','division','period','version','cutoff','status','document_id','report_status','message','created_at','completed_at'].map(k=>[k,k==='message'&&typeof j[k]==='string'?j[k].replace(/https?:\/\/\S+/gi,'[alamat sumber]').slice(0,1000):j[k]??null])));
      return json({ok:true,config:{enabled:config.enabled===true,cadence:'HOURLY',timezone:'Asia/Jakarta',automation_id:config.automation_id??null,last_check_at:config.last_check_at??null,last_success_at:config.last_success_at??null},jobs,counts,source_policy:{period:data.source_policy.period??null,complete:true,excluded_document_ids:excluded}},200,cors);
    }catch{return json({ok:false,error:'Status impor belum tersedia'},503,cors);}
  };
}
