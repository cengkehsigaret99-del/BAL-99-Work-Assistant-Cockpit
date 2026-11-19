// Source parsing only. No credentials, personal fixtures, or persistence belong here.
export const GILING_DAYS = ['JUMAT','SABTU','SENIN','SELASA','RABU','KAMIS'];
export const GILING_BRANDS = ['GCC 99','CB 77','GCC 16','CB 16','REFILL H','REFILL K','REFILL ORIGINAL','BAL 9'];
export const VERPACK_BRANDS = ['GCC 99','CB 77','GCC 16','CB 16','REFILL H','REFILL ORIGINAL','BAL 9'];
const GILING_COLUMNS = [['F','G'],['H','I'],['J','K'],['L','M'],['N','O'],['P','Q'],['R','S'],['T','U']];
const VERPACK_COLUMNS = ['D','E','F','G','H','I','J'];
export const normalizeId = value => String(value ?? '').trim().toUpperCase().replace(/\s+/g,' ');
const validName = value => typeof value === 'string' && value.trim() && value.trim() !== '0' ? value.trim() : '';
const numeric = value => value === null || value === undefined || String(value).trim() === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const amount = value => numeric(value) ?? 0;
export function dateSerial(value) {
  if(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value))return value.slice(0,10);
  const n=numeric(value); if(n===null || n<1 || n>100000)return '';
  return new Date(Date.UTC(1899,11,30)+Math.floor(n)*86400000).toISOString().slice(0,10);
}
const sourceRef = (source,sheet,row) => ({documentId:source.document_id,sheet,row});
const supportedDate = (date,period,cutoff) => date.startsWith(period+'-') && date<=cutoff;
function partBase(div,source) { return {div,source,rows:[],holds:[],pending:[],workers:{},notes:[],bonusPolicy:'UNKNOWN',coverageStart:null,cutoff:source.cutoff}; }
function markWorker(part,id,patch) { const key=part.div+'|'+id;part.workers[key]={...(part.workers[key]||{}),...patch}; }
function flagNameConflicts(part) {
  const names=new Map();
  for(const r of part.rows){if(r.qty>0||r.wage>0){const set=names.get(r.id)||new Set();if(r.name)set.add(r.name.toUpperCase());names.set(r.id,set);}}
  for(const [id,set] of names)if(set.size>1)markWorker(part,id,{holdReason:'Nama berbeda untuk ID yang sama; cocokkan identitas sumber.',identityVerified:false});
}
function compactZeros(part) {
  const positive=new Set(part.rows.filter(r=>r.qty>0||r.wage>0).map(r=>r.id+'|'+r.date));
  const zeroSeen=new Set();
  part.rows=part.rows.filter(r=>{
    if(r.qty!==0||r.wage!==0)return true;
    const k=r.id+'|'+r.date;if(positive.has(k)||zeroSeen.has(k))return false;zeroSeen.add(k);return true;
  });
}
export async function giling(file,source,period) {
  if(!GILING_DAYS.every(x=>file.sheets.has(x)))throw Error('File ini rekap Giling, belum memuat enam sheet rincian pekerja. Gunakan Giling V010 lengkap atau sumber harian Jumat–Kamis.');
  const part=partBase('GILING',source); const dates=[];
  if(file.sheets.has('00_RINGKASAN')){const cover=await file.rows('00_RINGKASAN');if(/BONUS\s+CORE\s+OFF|BONUS\s+OFF/i.test(String(cover.get(4)?.A||'')))part.bonusPolicy='OFF';}
  for(const sheet of GILING_DAYS){
    const rows=await file.rows(sheet),date=dateSerial(rows.get(3)?.D);
    if(!supportedDate(date,period,source.cutoff))continue;
    dates.push(date);const dayStatus=String(rows.get(4)?.D||'STATUS HARI BELUM TERSEDIA').trim().toUpperCase(); const seen=new Set();
    for(const [rn,c] of rows){
      if(rn<7)continue;const id=normalizeId(c.C);if(!/^(?:G\d+|PCS?\s*\d+)$/.test(id))continue;
      if(seen.has(id))throw Error('ID Giling berulang pada '+sheet+' baris '+rn);seen.add(id);
      const name=validName(c.E),ref=sourceRef(source,sheet,rn),missing=[];let found=0;
      markWorker(part,id,{bonus:part.bonusPolicy==='OFF'?0:null,deduction:null,netPay:null,netApproved:false,rawId:String(c.C),source:ref});
      if(!name)markWorker(part,id,{holdReason:'Nama pekerja belum tersedia.',identityVerified:false});
      for(let i=0;i<GILING_COLUMNS.length;i++){
        const [qc,wc]=GILING_COLUMNS[i],qty=numeric(c[qc]),wage=numeric(c[wc]);
        if(qty===null||wage===null)missing.push(qc+rn+':'+wc+rn);
        if((qty??0)===0&&(wage??0)===0)continue;
        found++;let status=dayStatus+' · GILING';
        if(qty===null||wage===null)status='RINCIAN BELUM LENGKAP · GILING';
        else if(qty===0&&wage>0)status='PERIKSA UPAH TANPA HASIL · GILING';
        else if(qty>0&&wage===0)status='PERIKSA UPAH NOL · GILING';
        if(/PERIKSA|BELUM LENGKAP/.test(status))markWorker(part,id,{holdReason:status,identityVerified:!!name});
        part.rows.push({div:'GILING',id,name,date,brand:GILING_BRANDS[i],qty,wage,status,source:ref});
      }
      if(!found)part.rows.push({div:'GILING',id,name,date,brand:'—',qty:missing.length?null:0,wage:missing.length?null:0,status:missing.length?'RINCIAN MEREK BELUM LENGKAP · ABSENSI BELUM VERIFIKASI':'NOL TERCATAT · ABSENSI BELUM VERIFIKASI',source:ref});
      if(missing.length)markWorker(part,id,{missingSourceFields:missing});
    }
  }
  if(!part.rows.length)throw Error('Rincian Giling pada periode/cut-off pilihan belum tersedia.');
  part.coverageStart=dates.sort()[0];part.cutoff=dates.sort().at(-1);flagNameConflicts(part);return part;
}
async function verpackControls(file,source) {
  const controls={workers:new Map(),pending:[],bonusPolicy:'UNKNOWN',periodStart:null,periodEnd:null};
  if(!file.sheets.has('Sheet3')||!file.sheets.has('REKAPITULASI'))return controls;
  const rows=await file.rows('Sheet3'),h=rows.get(8)||{};
  if(String(h.B||'').trim()!=='ID'||String(h.C||'').trim()!=='Nama pekerja'||String(h.G||'').trim()!=='Upah bruto')return controls;
  const recap=await file.rows('REKAPITULASI');controls.periodStart=dateSerial(recap.get(4)?.C);controls.periodEnd=dateSerial(recap.get(4)?.E);
  if(!controls.periodStart||!controls.periodEnd)throw Error('Periode rekap Verpack tidak lengkap.');
  if(/BONUS\s+OFF/i.test(String(rows.get(3)?.A||'')+' '+String(recap.get(26)?.A||'')))controls.bonusPolicy='OFF';
  for(const [rn,c] of rows){
    if(rn<9||numeric(c.A)===null||!validName(c.C))continue;
    const id=normalizeId(c.B);if(!/^P\d+$/.test(id))continue;
    if(controls.workers.has(id))throw Error('ID rekap Verpack berulang di Sheet3 baris '+rn);
    controls.workers.set(id,{name:validName(c.C),gross:amount(c.G),qty:amount(c.D),bonus:numeric(c.H),deduction:numeric(c.I),netPay:null,netApproved:false,identityVerified:!/HOLD|BELUM/i.test(String(c.K||'')),holdReason:/HOLD|BELUM/i.test(String(c.K||''))?String(c.K):null,source:sourceRef(source,'Sheet3',rn),coverageNote:String(c.Y||''),sourcePhoto:String(c.X||'')});
  }
  if(file.sheets.has('Sheet2')){
    const noteRows=await file.rows('Sheet2');let pendingSection=false;
    for(const [rn,c] of noteRows){
      if(String(c.A||'').trim()==='Data belum pasti'){pendingSection=true;continue;}
      if(pendingSection&&validName(c.A)&&numeric(c.C)!==null&&numeric(c.E)!==null){
        const name=validName(c.A),matches=[...controls.workers].filter(([,v])=>v.name===name);
        controls.pending.push({div:'VERPACK',id:matches.length===1?matches[0][0]:null,name,date:null,brand:String(c.B||'').replace('GCC16','GCC 16').replace('GCC99','GCC 99'),qty:amount(c.C),wage:amount(c.E),reason:'Tanggal hasil belum ditetapkan; dikeluarkan dari bruto dan calon tarik tunai.',source:{...sourceRef(source,'Sheet2',rn),photo:String(c.F||'')},includedInGross:false});
      }else if(pendingSection&&validName(c.A))pendingSection=false;
    }
  }
  return controls;
}
export async function verpack(file,source,period) {
  if(!file.sheets.has('INPUT DATA'))throw Error('File ini rekap Verpack, belum memuat sheet INPUT DATA per pekerja. Unggah workbook detail Manajemen dan Gaji atau sumber admin.');
  const rows=await file.rows('INPUT DATA'),rates=VERPACK_COLUMNS.map(c=>numeric(rows.get(5)?.[c]));
  if(rates.some(v=>v===null||v<=0))throw Error('Tarif sumber Verpack tidak lengkap.');
  const controls=await verpackControls(file,source),part=partBase('VERPACK',source),dates=[];
  part.pending=controls.pending;part.bonusPolicy=controls.bonusPolicy;
  const coverageStart=controls.periodStart&&controls.periodStart.startsWith(period+'-')?controls.periodStart:period+'-01';
  const coverageEnd=controls.periodEnd&&controls.periodEnd<source.cutoff?controls.periodEnd:source.cutoff;
  for(const [rn,c] of rows){
    if(rn<8)continue;const date=dateSerial(c.A);if(!supportedDate(date,period,coverageEnd)||date<coverageStart)continue;
    const id=normalizeId(c.B),rawName=validName(c.C),meta=controls.workers.get(id),name=meta?.name||rawName;
    const qs=VERPACK_COLUMNS.map(k=>amount(c[k])),rawWage=numeric(c.K),totalQty=qs.reduce((a,b)=>a+b,0),ref=sourceRef(source,'INPUT DATA',rn);
    if(!/^P\d+$/.test(id)){
      if(totalQty>0||(rawWage??0)>0){const brands=qs.map((qty,i)=>({brand:VERPACK_BRANDS[i],qty})).filter(x=>x.qty);part.holds.push({div:'VERPACK',id:null,name:name||'Nama belum tersedia',date,brand:brands.length===1?brands[0].brand:'GABUNGAN MEREK',qty:totalQty,wage:rawWage,status:'HOLD IDENTITAS · VERPACK',reason:'ID master belum tersedia; HOLD identitas.',source:{...ref,note:String(c.N||'')},brands,includedInRecords:false});dates.push(date);}
      continue;
    }
    dates.push(date);markWorker(part,id,{...(meta||{}),bonus:part.bonusPolicy==='OFF'?0:null,deduction:null,netPay:null,netApproved:false,source:meta?.source||ref});
    if(!name)markWorker(part,id,{holdReason:'Nama pekerja belum tersedia.',identityVerified:false});
    const active=qs.map((q,i)=>q!==0?i:-1).filter(i=>i>=0),allocated=qs.map((q,i)=>Math.round(q*rates[i]));
    const difference=rawWage===null?null:rawWage-allocated.reduce((a,b)=>a+b,0);
    const baseStatus=String(c.L||'STATUS HARI BELUM TERSEDIA').trim().toUpperCase();
    const note=String(c.N||'');const sourceStatus=/Foto/i.test(note)?'FOTO METOK · VERPACK':baseStatus+' · VERPACK';
    if(rawWage===null&&totalQty>0||difference!==null&&Math.abs(difference)>1)markWorker(part,id,{holdReason:rawWage===null?'Upah sumber belum tersedia.':'Selisih upah sumber dengan tarif; perlu verifikasi.',identityVerified:!!name});
    if(active.length){
      // Do not silently allocate an unexplained discrepancy to one brand.
      if(difference!==null&&difference!==0)part.notes.push({kind:'WAGE_DIFFERENCE',id,date,source:ref,difference});
      for(const i of active)part.rows.push({div:'VERPACK',id,name,date,brand:VERPACK_BRANDS[i],qty:qs[i],wage:rawWage===null?null:allocated[i],status:difference!==null&&Math.abs(difference)>1?'PERIKSA SELISIH UPAH · VERPACK':sourceStatus,source:{...ref,note}});
      if(difference!==null&&difference!==0)part.rows.push({div:'VERPACK',id,name,date,brand:'SELISIH UPAH SUMBER',qty:0,wage:difference,status:'PERIKSA SELISIH UPAH · VERPACK',source:ref});
    }else{
      if((rawWage??0)>0)markWorker(part,id,{holdReason:'Upah tanpa hasil tercatat; perlu verifikasi.',identityVerified:!!name});
      part.rows.push({div:'VERPACK',id,name,date,brand:'—',qty:rawWage===null?null:0,wage:rawWage,status:(rawWage??0)>0?'PERIKSA UPAH TANPA HASIL':'NOL TERCATAT · ABSENSI BELUM VERIFIKASI',source:ref});
    }
  }
  if(!part.rows.length)throw Error('Rincian Verpack pada periode/cut-off pilihan belum tersedia.');
  if(controls.workers.size){
    for(const [id,m]of controls.workers){
      const rr=part.rows.filter(r=>r.id===id),qty=rr.reduce((s,r)=>s+amount(r.qty),0),wage=rr.reduce((s,r)=>s+amount(r.wage),0);
      if(qty!==m.qty||wage!==m.gross)throw Error('Rincian Verpack berbeda dengan rekap pekerja '+id+'. Periksa sumber sebelum memproses.');
    }
  }
  part.coverageStart=coverageStart;part.cutoff=dates.sort().at(-1);compactZeros(part);flagNameConflicts(part);return part;
}
export function decodeRows(decoded) {
  return (decoded?.r||[]).map(r=>({div:decoded.w[r[0]][0],id:decoded.w[r[0]][1],name:decoded.w[r[0]][2],date:decoded.meta.period+'-'+String(r[1]).padStart(2,'0'),brand:decoded.b[r[2]],qty:r[3],wage:r[4],status:decoded.s[r[5]]}));
}
export function combineParts(parts,previous=null) {
  const before=previous?decodeRows(previous):[],rows=[];
  for(const part of parts){rows.push(...before.filter(r=>r.div===part.div&&(r.date<part.coverageStart||r.date>part.cutoff)),...part.rows);}
  return rows;
}
export function encodeRows(rows,metadata) {
  const workers=[],brands=['—'],statuses=[],records=[],wi=new Map(),bi=new Map([['—',0]]),si=new Map();
  for(const r of rows){const key=r.div+'|'+normalizeId(r.id);
    if(!wi.has(key)){wi.set(key,workers.length);workers.push([r.div,normalizeId(r.id),r.name||'']);}
    else if(r.name&&(r.qty>0||r.wage>0))workers[wi.get(key)][2]=r.name;
    if(!bi.has(r.brand)){bi.set(r.brand,brands.length);brands.push(r.brand);}
    if(!si.has(r.status)){si.set(r.status,statuses.length);statuses.push(r.status);}
    records.push([wi.get(key),Number(r.date.slice(-2)),bi.get(r.brand),r.qty,r.wage,si.get(r.status)]);
  }
  return {w:workers,b:brands,s:statuses,r:records,meta:metadata};
}
export function summarizeRows(rows) {return {qty:rows.reduce((s,r)=>s+amount(r.qty),0),wage:rows.reduce((s,r)=>s+amount(r.wage),0),lines:rows.length,upahTanpaHasil:rows.filter(r=>r.qty===0&&r.wage>0).length};}
export function payrollMetadata(parts,previous={}) {
  const workers={...(previous.workers||{})};for(const p of parts)Object.assign(workers,p.workers);
  const previousHolds=(previous.holds||[]).filter(h=>!parts.some(p=>p.div===h.div&&h.date&&h.date>=p.coverageStart&&h.date<=p.cutoff));
  const previousPending=(previous.pending||[]).filter(h=>!parts.some(p=>p.div===h.div));
  return {bonusPolicy:parts.every(p=>p.bonusPolicy==='OFF')?'OFF':'UNKNOWN',periodStart:parts.map(p=>p.coverageStart).sort().at(-1),periodEnd:parts.map(p=>p.cutoff).sort()[0],netApproved:false,sourceCutoffByDivision:Object.fromEntries(parts.map(p=>[p.div,p.cutoff])),workers,holds:[...previousHolds,...parts.flatMap(p=>p.holds)],pending:[...previousPending,...parts.flatMap(p=>p.pending)],notes:['Nominal adalah upah bruto; potongan/kasbon dan gaji bersih belum ditetapkan.','Hari ada hasil tidak sama dengan absensi resmi.'],coverageByDivision:Object.fromEntries(parts.map(p=>[p.div,{from:p.coverageStart,through:p.cutoff}]))};
}
