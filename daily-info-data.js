/* Daily summary calculations. Operational values are supplied only after owner login. */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.PpicDailyInfoData=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const finite=x=>typeof x==='number'&&Number.isFinite(x);
 const number=(x,digits=2)=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:digits}).format(x);
 const clean=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 function validDate(x){
  if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;
  const d=new Date(x+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===x;
 }
 function dateLabel(x){return validDate(x)?new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Jakarta'}).format(new Date(x+'T00:00:00Z')):'Belum tersedia'}
 function latestSnapshot(rows,period,predicate=()=>true){
  return (Array.isArray(rows)?rows:[]).filter(x=>x&&x.period===period&&predicate(x)).slice().sort((a,b)=>{
   const av=Number(String(a.version||'').replace(/^V/i,''))||0,bv=Number(String(b.version||'').replace(/^V/i,''))||0;
   return bv-av||String(b.created_at||'').localeCompare(String(a.created_at||''));
  })[0]||null;
 }
 function sourceDate(snapshot,asOf){
  if(!snapshot||!validDate(asOf)||snapshot.period!==asOf.slice(0,7))return null;
  const p=snapshot.payload||{},values=[p.valid_through,p.meta?.cutoff,p.cutoff,snapshot.cutoff],dates=[asOf];
  for(let v of values){
   if(typeof v==='number'&&Number.isInteger(v))v=snapshot.period+'-'+String(v).padStart(2,'0');
   if(typeof v==='string')v=v.slice(0,10);
   if(validDate(v)&&v.startsWith(snapshot.period+'-'))dates.push(v);
  }
  return dates.length>1?dates.sort()[0]:null;
 }
 function section(id,title,columns){return {id,title,sourceDate:null,dateLabel:'Data belum tersedia',columns,rows:[],notes:[],emptyText:'Belum ada data bersumber untuk periode ini.'}}
 function dated(s,date,partial=false){s.sourceDate=date;s.dateLabel='Data '+dateLabel(date)+(partial?' · parsial':'')}
 function family(name){
  const n=clean(name);
  if(/^GCC(?:99|16)/.test(n)||n.includes('GEDUNGCENGKEH')||/^NEW16/.test(n))return n.includes('16')?'GCC16':'GCC99';
  if(/^CB(?:77|16)/.test(n)||n.includes('CENGKEHBIRU77'))return n.includes('16')?'CB16':'CB77';
  if(n.includes('REFILL')){
   if(n.includes('ORIGINAL'))return 'REFILLORIGINAL';
   if(n.includes('KUNING')||n==='REFILLK')return 'REFILLK';
   if(n==='REFILLH'||n.includes('HITAM')||n==='CENGKEHREFILL')return 'REFILLH';
  }
  return n;
 }
 function cartonFactor(brand,master){
  const key=family(brand);if(!key)return null;
  const matches=(Array.isArray(master)?master:[]).filter(m=>Array.isArray(m)&&!/(SAMPLE|SAMPEL|RETURE|RETUR)/i.test(String(m[1]))&&family(m[1])===key);
  if(!matches.length||matches.some(m=>!finite(m[2])||m[2]<=0))return null;
  const factors=[...new Set(matches.map(m=>m[2]))];return factors.length===1?factors[0]:null;
 }
 function cartonStock(qty,factor){
  if(!finite(factor)||factor<=0)return number(qty)+' pack · karton belum terverifikasi';
  const full=Math.floor(qty/factor),rest=qty-full*factor;
  return number(full)+' karton'+(rest?' + '+number(rest)+' pack':'');
 }
 function shortBrand(name){
  return String(name||'Merek belum tersedia').replace(/GEDUNG CENGKEH COKLAT 99\s*-?\s*16/gi,'GCC 16').replace(/GEDUNG CENGKEH COKLAT 99/gi,'GCC 99').replace(/GEDUNG CENGKEH 99/gi,'GCC 99').replace(/CENGKEH BIRU 77/gi,'CB 77').replace(/\s+/g,' ').trim();
 }
 function finishedSection(input,period){
  const s=section('finished','Stok barang jadi',['Merek / varian','Stok positif']);
  const snap=latestSnapshot(input.finished,period),p=snap?.payload,date=sourceDate(snap,input.asOf);
  if(!p||!date||!Array.isArray(p.m))return s;
  dated(s,date);const day=Number(date.slice(-2));let negatives=0,unknown=0;
  for(const m of p.m){
   let qty=finite(m[5])?m[5]:null;
   for(const e of p.e||[])if(e[2]===m[0]&&Number(e[0])>=1&&Number(e[0])<=day){
    if(!finite(e[5])||!['MASUK','KELUAR'].includes(e[1])){qty=null;break}
    if(qty!==null)qty+=(e[1]==='MASUK'?1:-1)*e[5];
   }
   if(qty===null){unknown++;continue}if(qty<0){negatives++;continue}if(qty===0)continue;
   s.rows.push({label:shortBrand(m[1]),value:cartonStock(qty,m[2]),detail:String(m[0]),numeric:{pack:qty,packPerCarton:finite(m[2])?m[2]:null}});
  }
  s.rows.sort((a,b)=>b.numeric.pack-a.numeric.pack||a.label.localeCompare(b.label));
  s.emptyText='Tidak ada stok positif pada tanggal sumber.';
  s.notes.push('Saldo buku; hanya merek / varian bersaldo positif.');
  if(negatives)s.notes.push(number(negatives)+' SKU bersaldo negatif tetap tercatat di laporan Barang Jadi.');
  if(unknown)s.notes.push(number(unknown)+' SKU belum dapat dihitung.');
  return s;
 }
 function ledgerBalance(snapshot,date){
  const p=snapshot.payload||{},cols=p.cols||[],ii=cols.indexOf('in_qty'),oi=cols.indexOf('out_qty'),di=cols.indexOf('day');
  if(!finite(p.opening_qty)||ii<0||oi<0||di<0)return null;
  let qty=p.opening_qty;const day=Number(date.slice(-2));
  for(const r of p.entries||[])if(Number(r[di])>=1&&Number(r[di])<=day){if(!finite(r[ii])||!finite(r[oi]))return null;qty+=r[ii]-r[oi]}
  return qty;
 }
 function exciseSection(input,period){
  const s=section('excise','Stok pita cukai',['Kelompok pita','Stok positif']);
  const labels={'CUKAI 10.325':'HJE 10.325 · isi 12','CUKAI 13.775':'HJE 13.775 · isi 16','CUKAI REFILL':'HJE 10.500 · Refill'};
  const divisions=[...new Set((input.daily||[]).filter(x=>x.period===period&&/^CUKAI(?:\s|$)/i.test(x.division||'')).map(x=>x.division))];
  const dates=[];let unavailable=0;
  for(const division of divisions){
   const snap=latestSnapshot(input.daily,period,x=>x.division===division),date=sourceDate(snap,input.asOf);
   if(!date){unavailable++;continue}dates.push(date);const qty=ledgerBalance(snap,date);
   if(qty===null){unavailable++;continue}if(qty<=0)continue;
   s.rows.push({label:labels[division]||division,value:number(qty)+' keping',detail:'',numeric:{keping:qty},sourceDate:date});
  }
  if(dates.length){const unique=[...new Set(dates)];dated(s,unique.sort()[0]);if(unique.length>1){s.dateLabel='Tanggal sumber per kelompok';for(const r of s.rows)r.detail='Data '+dateLabel(r.sourceDate)}}
  s.emptyText=dates.length?'Tidak ada saldo pita positif yang dapat ditampilkan.':s.emptyText;
  s.notes.push('Saldo buku per HJE; alokasi per merek belum tersedia.');
  if(unavailable)s.notes.push('Sebagian kelompok pita belum dapat dihitung.');
  return s;
 }
 function latestDailyEntry(snapshot,asOf){
  const date=sourceDate(snapshot,asOf);if(!date)return null;
  const p=snapshot.payload||{},cols=p.cols||[],di=cols.indexOf('day'),qi=cols.indexOf('in_qty');
  if(di<0||qi<0)return null;
  const rows=(p.entries||[]).filter(r=>Number.isInteger(r[di])&&r[di]>=1&&r[di]<=Number(date.slice(-2))&&finite(r[qi])).sort((a,b)=>b[di]-a[di]);
  if(!rows.length)return null;
  const day=rows[0][di],total=rows.filter(r=>r[di]===day).reduce((sum,r)=>sum+r[qi],0);
  return {date:snapshot.period+'-'+String(day).padStart(2,'0'),day,qty:total};
 }
 function gilingSection(input,period){
  const s=section('giling','Hasil batangan harian',['Produksi','Hasil harian']);
  const snap=latestSnapshot(input.daily,period,x=>x.division==='GILING'),r=latestDailyEntry(snap,input.asOf);
  if(!r)return s;
  dated(s,r.date);s.rows=[{label:'Total giling',value:number(r.qty)+' batang',numeric:{batang:r.qty}}];
  s.notes=['Hasil satu hari sesuai tanggal sumber.'];return s;
 }
 function verpackSection(input,period){
  const s=section('verpack','Hasil Verpack per merek',['Merek','Karton setara']);
  const daily=latestSnapshot(input.daily,period,x=>x.division==='VERPACK'),r=latestDailyEntry(daily,input.asOf);
  if(!r)return s;dated(s,r.date);
  const snap=latestSnapshot(input.sdm,period),p=snap?.payload,sdmDate=sourceDate(snap,input.asOf);
  if(!p||!sdmDate||sdmDate<r.date){s.emptyText='Rincian merek belum tersedia untuk tanggal hasil Verpack.';s.notes=[number(r.qty)+' pack tercatat; rincian karton menunggu sumber merek.'];return s}
  const brands=new Map();let bad=false;
  for(const a of p.r||[]){
   const worker=p.w?.[a[0]];if(!worker||worker[0]!=='VERPACK'||Number(a[1])!==r.day)continue;
   if(!finite(a[3])||a[3]<0){bad=true;continue}if(a[3]===0)continue;
   const brand=p.b?.[a[2]];if(!brand||brand==='—'){bad=true;continue}brands.set(brand,(brands.get(brand)||0)+a[3]);
  }
  const sum=[...brands.values()].reduce((a,b)=>a+b,0);
  if(bad||Math.abs(sum-r.qty)>0.000001){s.emptyText='Rincian merek belum cocok dengan total Verpack.';s.notes=['Total harian '+number(r.qty)+' pack; rincian merek perlu rekonsiliasi.'];return s}
  const fg=latestSnapshot(input.finished,period);let total=0,unknown=0;
  for(const [brand,qty] of [...brands].sort((a,b)=>a[0].localeCompare(b[0]))){
   const factor=cartonFactor(brand,fg?.payload?.m),cartons=factor===null?null:qty/factor;
   if(cartons===null)unknown++;else total+=cartons;
   s.rows.push({label:brand,value:cartons===null?'Belum terverifikasi':number(cartons,4)+' karton',detail:number(qty)+' pack',numeric:{pack:qty,packPerCarton:factor,cartons}});
  }
  if(!s.rows.length&&r.qty===0)s.rows=[{label:'Total Verpack',value:'0 karton',detail:'Nol tercatat pada sumber harian',numeric:{pack:0,cartons:0}}];
  if(!unknown)s.total={label:'Total hasil harian',value:number(total,4)+' karton'};
  s.notes=['Karton setara = pack ÷ isi karton per merek; sesuai master Barang Jadi.'];
  if(unknown)s.notes.push('Konversi yang belum terverifikasi tidak dijumlahkan.');
  return s;
 }
 function materialsSection(input,period){
  const s=section('materials','Kapasitas bahan baku',['Bahan','Estimasi karton']);
  const snap=latestSnapshot(input.materials,period),p=snap?.payload,date=sourceDate(snap,input.asOf);
  if(!p||!date||!Array.isArray(p.m))return s;
  const coverage=p.date_coverage?.[date],partial=coverage?.status==='PARTIAL';dated(s,date,partial);
  let modeled=0;const day=Number(date.slice(-2));
  for(const m of p.m){
   const basis=String(p.capacity_basis_by_code?.[m[0]]||'');
   // This simulation is allowed only when these assumptions are present in the private source.
   if(m[0]!=='A-01'||!/AMB(?:RI|REE|RE).*GCC\s*99/i.test(String(m[1]))||String(m[2]).toUpperCase()!=='PCS'||!/SIMULASI/i.test(basis)||!/12\s*(pcs|helai)\s*\/\s*pack/i.test(basis)||!/1[.,]?000\s*pack\s*\/\s*karton/i.test(basis))continue;
   if(!finite(m[3]))continue;let qty=m[3],bad=false;
   for(const e of p.e||[])if(e[0]===m[0]&&Number(e[1])>=1&&Number(e[1])<=day){if(!finite(e[2])||!finite(e[3])){bad=true;break}qty+=e[2]-e[3]}
   if(bad||qty<0)continue;
   if(partial&&Array.isArray(coverage.codes)&&!coverage.codes.includes(m[0]))continue;
   const cartons=qty/12/1000;modeled++;
   s.rows.push({label:String(m[1])+' · '+m[0],value:'≈ '+number(cartons,2)+' karton',detail:'Simulasi satu bahan',numeric:{qty,cartons}});
  }
  s.emptyText='Estimasi karton belum dapat dihitung dari sumber yang tersedia.';
  if(modeled)s.notes.push('Asumsi 12 PCS/pack dan 1.000 pack/karton. BOM belum disahkan.');
  if(p.m.length>modeled)s.notes.push('Kapasitas '+number(p.m.length-modeled)+' bahan lainnya belum dapat dihitung.');
  return s;
 }
 function build(input={}){
  if(!validDate(input.asOf))throw Error('Pilih tanggal ringkasan yang valid.');
  const period=input.asOf.slice(0,7),sections=[finishedSection(input,period),exciseSection(input,period),gilingSection(input,period),verpackSection(input,period),materialsSection(input,period)];
  return {asOf:input.asOf,title:'Info Harian',company:'PR. Banyu Anyar Lestari',status:'WORKING / OPEN RECON',sections,hasData:sections.some(s=>s.rows.length>0),subtitle:'Angka mengikuti tanggal sumber pada setiap bagian.'};
 }
 return Object.freeze({build,cartonFactor,latestSnapshot,sourceDate});
});
