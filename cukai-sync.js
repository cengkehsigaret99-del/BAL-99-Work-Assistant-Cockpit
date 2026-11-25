/* One-way, private Robot Cukai reader. All operational values arrive after Owner login. */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root?.document){root.PPICCukaiSource=api;api.mount(root);}
})(typeof window==='object'?window:null,function(){
 'use strict';
 const periodPattern=/^20\d{2}-(0[1-9]|1[0-2])$/;
 const sha=/^[a-f0-9]{64}$/;
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
 const finite=n=>typeof n==='number'&&Number.isFinite(n);
 const text=(s,max=240)=>typeof s==='string'?s.slice(0,max):'';
 const validDate=d=>typeof d==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
 const fmt=n=>finite(n)?new Intl.NumberFormat('id-ID',{maximumFractionDigits:3}).format(n):'Belum tersedia';
 const timestamp=s=>typeof s==='string'&&Number.isFinite(Date.parse(s));
 const time=s=>timestamp(s)?new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(s))+' WIB':'Belum tersedia';
 const invalid=()=>{throw Error('Publikasi Robot Cukai tidak valid atau tidak lengkap.');};
 function validate(raw,period){
  if(!raw||raw.ok!==true||raw.period!==period||!periodPattern.test(period))invalid();
  if(raw.ready===false)return {ok:true,ready:false,period};
  if(raw.ready!==true||raw.schema_version!==1||raw.source_system!=='ROBOT_CUKAI'||!uuid.test(raw.source_snapshot_id||'')||!Number.isSafeInteger(raw.source_revision)||raw.source_revision<=0||!sha.test(raw.source_hash||'')||!sha.test(raw.payload_hash||'')||!validDate(raw.cutoff)||raw.cutoff.slice(0,7)!==period||!timestamp(raw.published_at)||!Array.isArray(raw.hjes)||raw.hjes.length<1||raw.hjes.length>100)invalid();
  const seen=new Set();
  const hjes=raw.hjes.map(h=>{
   if(!h||typeof h.id!=='string'||!h.id.trim()||h.id.length>100||seen.has(h.id)||!finite(h.hje))invalid();seen.add(h.id);
   for(const k of ['opening','purchases','usage','closing'])if(!Number.isSafeInteger(h[k])||h[k]<0)invalid();
   if(h.opening+h.purchases-h.usage!==h.closing)invalid();
   for(const k of ['factory','unconfirmed'])if(h[k]!=null&&(!Number.isSafeInteger(h[k])||h[k]<0))invalid();
   const out={id:h.id,hje:h.hje,label:text(h.label)||h.id,opening:h.opening,purchases:h.purchases,usage:h.usage,closing:h.closing,factory:h.factory??null,unconfirmed:h.unconfirmed??null};
   for(const k of ['openingValue','purchaseValue','usageValue','closingValue','cukaiPerPiece'])out[k]=finite(h[k])?h[k]:null;
   // Canonical v1 has no verified physical count or carton master. Do not infer either.
   out.physical_count=null;out.packs_per_carton=null;
   return out;
  });
  if(!Array.isArray(raw.daily_usage)||raw.daily_usage.length>10000)invalid();
  const dailySeen=new Set(),byId=new Map(hjes.map(h=>[h.id,h]));
  const daily_usage=raw.daily_usage.map(r=>{
   if(!r||!validDate(r.date)||r.date.slice(0,7)!==period||r.date>raw.cutoff||(r.quantity!==null&&(!Number.isSafeInteger(r.quantity)||r.quantity<0)))invalid();
   const unmapped=r.source_hje_id===null&&hjes.filter(h=>h.hje===r.hje).length>1;
   if(!unmapped&&(!seen.has(r.source_hje_id)||r.hje!==byId.get(r.source_hje_id)?.hje))invalid();
   const key=r.date+'|'+(unmapped?'UNMAPPED:'+r.hje:r.source_hje_id);if(dailySeen.has(key))invalid();dailySeen.add(key);
   return {date:r.date,source_hje_id:r.source_hje_id,hje:r.hje,quantity:r.quantity};
  });
  return {ok:true,ready:true,schema_version:1,source_system:'ROBOT_CUKAI',period,source_snapshot_id:raw.source_snapshot_id,source_revision:raw.source_revision,source_hash:raw.source_hash,payload_hash:raw.payload_hash,published_at:raw.published_at,source_created_at:raw.source_created_at,cutoff:raw.cutoff,reconciliation_status:text(raw.reconciliation_status)||'WORKING / OPEN RECON',hjes,daily_usage,valuation_method:text(raw.valuation_method),source:{name:text(raw.source?.name),sha256:raw.source?.sha256},sync:{status:raw.sync?.status==='current'?'current':'stale',last_checked_at:raw.sync?.last_checked_at},capabilities:{daily_receipts:false,physical_stock_confirmed:false}};
 }
 function accept(previous,next){
  if(!previous?.ready)return next;
  if(!next?.ready)throw Error('Publikasi terbaru belum tersedia; snapshot terakhir dipertahankan.');
  if(next.period!==previous.period)throw Error('Periode publikasi berubah.');
  if(next.source_revision<previous.source_revision)throw Error('Revisi lama ditolak; snapshot terbaru dipertahankan.');
  if(next.source_revision===previous.source_revision&&(next.payload_hash!==previous.payload_hash||next.source_snapshot_id!==previous.source_snapshot_id||next.source_hash!==previous.source_hash))throw Error('Identitas revisi sumber tidak sesuai.');
  return next;
 }
 function sum(rows,key){return rows.every(h=>finite(h[key]))?rows.reduce((n,h)=>n+h[key],0):null;}
 function reference(s){return {source_system:'ROBOT_CUKAI',source_snapshot_id:s.source_snapshot_id,source_revision:s.source_revision,source_hash:s.source_hash,payload_hash:s.payload_hash,cutoff:s.cutoff,published_at:s.published_at};}
 function dailyProjection(s){
  if(!s?.ready)return [];
  return s.hjes.map(h=>({period:s.period,division:'CUKAI '+h.id,version:'V'+String(s.source_revision).padStart(12,'0'),cutoff:s.cutoff,status:s.reconciliation_status,unit:'keping',valuation_basis:'SALDO BUKU ROBOT CUKAI',created_at:s.published_at,payload:{cols:['day','in_qty','out_qty'],entries:[],opening_qty:h.opening,opening_nominal:null,book_period_receipts:h.purchases,book_period_usage:h.usage,book_closing:h.closing,valid_through:s.cutoff,canonical_source:true,source_hje_id:h.id,source_label:h.label,source_revision:s.source_revision,qty_basis:'Saldo buku, bukan hasil opname',nominal_basis:'Nominal sesuai metode sumber ditampilkan terpisah',notes:['Tanggal penerimaan harian belum tersedia. Saldo harian sebelum cut-off tidak diasumsikan.'],provenance:reference(s)},source_document_ids:['ROBOT_CUKAI_'+s.source_snapshot_id]}));
 }
 function reportProjection(s){
  if(!s?.ready)return null;
  return {report_key:'05',period:s.period,title:'Pita Cukai — sumber Robot Cukai',version:'V'+String(s.source_revision).padStart(12,'0'),cutoff:s.cutoff,status:s.reconciliation_status,basis:'ACTUAL',created_at:s.published_at,source_refs:[reference(s)],payload:{notice:'Sumber: Robot Cukai · revisi '+s.source_revision+' · cut-off '+s.cutoff+'. Saldo buku dan estimasi pabrik mengikuti sumber.',tables:[{title:'Saldo per kelompok pita',headers:['ID pita','Kelompok','HJE','Saldo awal','Pemasukan','Pemakaian','Saldo akhir buku','Estimasi pabrik','Belum terkonfirmasi','Fisik opname'],rows:s.hjes.map(h=>[h.id,h.label,h.hje,h.opening,h.purchases,h.usage,h.closing,h.factory,h.unconfirmed,null])},{title:'Pemakaian harian bersumber',headers:['Tanggal','ID pita','HJE','Pemakaian keping'],rows:s.daily_usage.map(d=>[d.date,d.source_hje_id===null?'Kelompok belum terpetakan':d.source_hje_id,d.hje,d.quantity])}],provenance:reference(s),disclaimer:'Tanggal penerimaan harian, stok fisik opname, dan faktor karton belum tersedia pada publikasi ini. Nilai yang belum diketahui tetap tidak diketahui.'}};
 }
 function mergeDaily(raw,sources){const periods=new Set(sources.filter(s=>s.ready).map(s=>s.period));return [...raw.filter(s=>!(/^CUKAI(?:\s|$)/i.test(s.division||'')&&periods.has(s.period))),...sources.flatMap(dailyProjection)];}
 function mergeReports(raw,sources){const periods=new Set(sources.filter(s=>s.ready).map(s=>s.period));return [...raw.filter(s=>!(s.report_key==='05'&&periods.has(s.period))),...sources.map(reportProjection).filter(Boolean)];}
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function selected(s,filter={}){
  const pools=s.hjes.filter(h=>!filter.pool||h.id===filter.pool),ids=new Set(pools.map(h=>h.id));
  const from=validDate(filter.from)?filter.from:s.period+'-01',to=validDate(filter.to)?filter.to:s.cutoff;
  if(from>to||to>s.cutoff||from.slice(0,7)!==s.period||to.slice(0,7)!==s.period)throw Error('Rentang tanggal pemakaian tidak valid.');
  return {pools,from,to,usage:s.daily_usage.filter(d=>((!filter.pool&&d.source_hje_id===null)||ids.has(d.source_hje_id))&&d.date>=from&&d.date<=to)};
 }
 function printHTML(s,filter={}){
  const x=selected(s,filter),cell=v=>escape(typeof v==='number'?fmt(v):v==null?'Belum tersedia':v);
  const table=(heads,rows)=>'<table><thead><tr>'+heads.map(h=>'<th>'+escape(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(v=>'<td>'+cell(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
  return '<!doctype html><html lang="id"><head><meta charset="utf-8"><title>BAL · Pita Cukai</title><style>@page{size:A4 landscape;margin:12mm}body{font:10px/1.5 Arial;color:#172c3c}h1{font-size:21px}h2{font-size:14px;margin-top:20px}table{width:100%;border-collapse:collapse}th,td{padding:6px;border:1px solid #cbd5df;text-align:left;overflow-wrap:anywhere}th{background:#e8eef2}tr{break-inside:avoid}thead{display:table-header-group}.meta{overflow-wrap:anywhere;font-size:9px}.notice{background:#f0f4f7;padding:10px}</style></head><body><h1>PR. BANYU ANYAR LESTARI · PITA CUKAI</h1><p>Sumber: Robot Cukai · '+escape(s.reconciliation_status)+'</p><p>Saldo buku per '+escape(s.cutoff)+' · revisi '+s.source_revision+' · publikasi '+escape(time(s.published_at))+'</p><p class="meta">ID snapshot: '+escape(s.source_snapshot_id)+'<br>Hash sumber: '+escape(s.source_hash)+'<br>Hash publikasi: '+escape(s.payload_hash)+'</p><p class="notice">Saldo buku dan estimasi pabrik mengikuti kategori sumber. Stok fisik hasil opname dan faktor karton belum tersedia. Rentang di bawah hanya memfilter rincian pemakaian, tidak mengubah saldo buku pada cut-off.</p><h2>Saldo buku per kelompok pita — keping</h2>'+table(['Kelompok / ID','HJE','Awal','Pemasukan','Pemakaian','Akhir buku','Estimasi pabrik','Belum terkonfirmasi','Opname'],x.pools.map(h=>[h.label+' / '+h.id,h.hje,h.opening,h.purchases,h.usage,h.closing,h.factory,h.unconfirmed,null]))+'<h2>Nominal sesuai sumber · '+escape(s.valuation_method||'Metode belum tersedia')+'</h2>'+table(['Kelompok','Saldo awal Rp','Pemasukan Rp','Pemakaian Rp','Saldo akhir Rp'],x.pools.map(h=>[h.label,h.openingValue,h.purchaseValue,h.usageValue,h.closingValue]))+'<h2>Pemakaian tercatat · '+escape(x.from)+' sampai '+escape(x.to)+'</h2>'+table(['Tanggal','ID pita','HJE','Pemakaian keping'],x.usage.map(d=>[d.date,d.source_hje_id===null?'Kelompok belum terpetakan':d.source_hje_id,d.hje,d.quantity]))+'<p>Tanggal tanpa catatan tidak berarti pemakaian nol. Penerimaan harian belum tersedia pada publikasi ini.</p></body></html>';
 }
 function mount(win){
  const doc=win.document,$=id=>doc.getElementById(id),section=$('excise');if(!section)return;
  const legacy=section.querySelector(':scope > .panel');if(legacy)legacy.hidden=true;
  const panel=doc.createElement('section');panel.className='panel';panel.id='cukaiSourcePanel';
  panel.innerHTML='<div class="eyebrow">SUMBER: ROBOT CUKAI</div><h2>Pita Cukai · Pembaruan Otomatis</h2><p id="cukaiSourceStatus" role="status" aria-live="polite">Masuk sebagai Owner untuk membaca sumber.</p><div class="report-filters"><label>Periode<input id="cukaiSourcePeriod" type="month"></label><label>Kelompok pita<select id="cukaiSourcePool"><option value="">Semua kelompok</option></select></label></div><p id="cukaiSourceMeta" class="muted"></p><div id="cukaiSourceMetrics" class="metrics"></div><div id="cukaiSourceTables"></div><p class="muted">Dasar perencanaan: saldo buku dan estimasi pabrik sesuai kategori sumber. Stok fisik hasil opname dan faktor karton belum tersedia pada publikasi ini.</p><h3>Pemakaian tercatat</h3><div class="report-filters"><label>Dari<input id="cukaiSourceFrom" type="date"></label><label>Sampai<input id="cukaiSourceTo" type="date"></label></div><p class="muted">Tanggal hanya memfilter rincian pemakaian. Saldo buku tetap mengikuti cut-off sumber. Tanggal kosong tidak dianggap nol.</p><div id="cukaiSourceUsage"></div><div class="actions"><button id="cukaiSourceRefresh" class="btn" disabled>Perbarui Sekarang</button><button id="cukaiSourcePrint" class="btn primary" disabled>Preview PDF Cukai</button></div>';
  section.prepend(panel);
  $('cukaiSourcePeriod').value=$('exPeriod')?.value||new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',timeZone:'Asia/Jakarta'}).format(new Date());
  let enabled=false,generation=0,timer=null,rawDaily=[],rawReports=[],lastError='';
  const states=new Map(),busy=new Map();
  const originalDaily=win.ppicSetDaily,originalReports=win.ppicSetReports;
  const originalCukaiOptions=[...($('dailyDivision')?.options||[])].filter(o=>/^CUKAI(?:\s|$)/i.test(o.value)).map(o=>({value:o.value,label:o.textContent}));
  const period=()=>$('cukaiSourcePeriod').value;
  const filters=()=>({pool:$('cukaiSourcePool').value,from:$('cukaiSourceFrom').value,to:$('cukaiSourceTo').value});
  function merged(){
   const all=[...states.values()];
   const daily=mergeDaily(rawDaily,all),reports=mergeReports(rawReports,all);
   const list=$('dailyDivision'),saved=list?.value,selectedPeriod=$('dailyPeriod')?.value;
   if(list){
    for(const o of [...list.options])if(/^CUKAI(?:\s|$)/i.test(o.value))o.remove();
    const relevant=all.find(s=>s.ready&&s.period===selectedPeriod);
    const options=relevant?relevant.hjes.map(h=>({value:'CUKAI '+h.id,label:h.label+' · '+h.id})):originalCukaiOptions;
    for(const option of options){const o=doc.createElement('option');o.value=option.value;o.textContent=option.label;o.dataset.cukaiSource=String(!!relevant);list.append(o);}
    if(saved&&[...list.options].some(o=>o.value===saved))list.value=saved;
    else if(/^CUKAI(?:\s|$)/i.test(saved||'')&&options.length)list.value=options[0].value;
   }
   originalDaily?.(daily);originalReports?.(reports);
  }
  win.ppicSetDaily=rows=>{rawDaily=Array.isArray(rows)?rows:[];if(!enabled)return originalDaily?.(rawDaily);merged();};
  win.ppicSetReports=rows=>{rawReports=Array.isArray(rows)?rows:[];if(!enabled)return originalReports?.(rawReports);merged();};
  function table(heads,rows){const wrap=doc.createElement('div');wrap.className='tablewrap';const t=doc.createElement('table'),head=doc.createElement('thead'),hr=doc.createElement('tr'),body=doc.createElement('tbody');for(const h of heads){const c=doc.createElement('th');c.textContent=h;hr.append(c)}head.append(hr);for(const r of rows){const tr=doc.createElement('tr');for(const v of r){const c=doc.createElement('td');c.textContent=typeof v==='number'?fmt(v):v==null?'Belum tersedia':String(v);tr.append(c)}body.append(tr)}t.append(head,body);wrap.append(t);return wrap;}
  function clearDisplay(){for(const id of ['cukaiSourceMeta','cukaiSourceMetrics','cukaiSourceTables','cukaiSourceUsage'])$(id).replaceChildren();$('cukaiSourcePrint').disabled=true;}
  function render(){
   const s=states.get(period());clearDisplay();
   if(!enabled){$('cukaiSourceStatus').textContent='Masuk sebagai Owner untuk membaca sumber.';return;}
   if(!s?.ready){$('cukaiSourceStatus').textContent=lastError||'Belum ada publikasi Robot Cukai untuk periode ini.';return;}
   const old=$('cukaiSourcePool').value;$('cukaiSourcePool').replaceChildren(new Option('Semua kelompok',''));for(const h of s.hjes)$('cukaiSourcePool').append(new Option(h.label+' · '+h.id,h.id));if(s.hjes.some(h=>h.id===old))$('cukaiSourcePool').value=old;
   for(const [id,defaultValue] of [['cukaiSourceFrom',s.period+'-01'],['cukaiSourceTo',s.cutoff]]){if(!$(id).value.startsWith(s.period+'-'))$(id).value=defaultValue;$(id).min=s.period+'-01';$(id).max=s.cutoff;}
   $('cukaiSourceStatus').textContent=lastError?'Pembaruan tertunda: '+lastError+' Snapshot terakhir tetap ditampilkan.':s.sync.status==='current'?'Sinkron dengan Robot Cukai.':'Sumber memiliki pembaruan yang belum terbit; snapshot terakhir ditampilkan.';
   $('cukaiSourceMeta').textContent='Saldo buku per '+s.cutoff+' · '+s.reconciliation_status+' · revisi '+s.source_revision+' · terakhir diperiksa '+time(s.sync.last_checked_at)+' · ID '+s.source_snapshot_id;
   let x;try{x=selected(s,filters())}catch(e){$('cukaiSourceStatus').textContent=e.message;return;}
   for(const [label,key] of [['Saldo awal','opening'],['Pemasukan','purchases'],['Pemakaian','usage'],['Saldo akhir buku','closing']]){const el=doc.createElement('article');el.className='panel metric';const l=doc.createElement('div'),v=doc.createElement('strong');l.textContent=label;v.textContent=fmt(sum(x.pools,key))+' keping';el.append(l,v);$('cukaiSourceMetrics').append(el);}
   $('cukaiSourceTables').append(table(['Kelompok / ID','HJE','Awal','Pemasukan','Pemakaian','Akhir buku','Estimasi pabrik','Belum terkonfirmasi','Opname','Karton'],x.pools.map(h=>[h.label+' / '+h.id,h.hje,h.opening,h.purchases,h.usage,h.closing,h.factory,h.unconfirmed,null,null])));
   $('cukaiSourceUsage').append(table(['Tanggal','ID pita','HJE','Pemakaian keping'],x.usage.map(d=>[d.date,d.source_hje_id===null?'Kelompok belum terpetakan':d.source_hje_id,d.hje,d.quantity])));$('cukaiSourcePrint').disabled=false;
  }
  async function refresh(p=period()){
   if(!enabled||!periodPattern.test(p)||busy.has(p)||typeof win.ppicLoadCukaiSource!=='function')return;
   const epoch=generation,request={};busy.set(p,request);if(p===period())$('cukaiSourceRefresh').disabled=true;
   try{const data=await win.ppicLoadCukaiSource(p);if(!enabled||epoch!==generation||busy.get(p)!==request)return;
    const previous=states.get(p),next=accept(previous,validate(data,p));if(p===period()&&next.ready&&$('cukaiSourceTo').value===previous?.cutoff)$('cukaiSourceTo').value=next.cutoff;states.set(p,next);if(p===period())lastError='';merged();render();
   }catch(e){if(enabled&&epoch===generation&&p===period()&&e?.name!=='AbortError'){lastError=text(e?.message,180);render();}}
   finally{if(busy.get(p)===request)busy.delete(p);if(enabled&&epoch===generation)$('cukaiSourceRefresh').disabled=false;}
  }
  function activePeriods(){return [...new Set([period(),$('reportPeriod')?.value,$('dailyPeriod')?.value,$('robotPeriod')?.value,$('infoDate')?.value?.slice(0,7)].filter(p=>periodPattern.test(p)))];}
  function schedule(){if(timer)win.clearTimeout(timer);if(enabled)timer=win.setTimeout(()=>{if(!doc.hidden)activePeriods().forEach(p=>refresh(p));schedule();},60000);}
  $('cukaiSourceRefresh').addEventListener('click',()=>refresh());
  $('cukaiSourcePeriod').addEventListener('change',()=>{lastError='';$('cukaiSourcePool').value='';render();refresh();});
  for(const id of ['cukaiSourcePool','cukaiSourceFrom','cukaiSourceTo'])$(id).addEventListener('change',render);
  for(const id of ['reportPeriod','dailyPeriod','robotPeriod','infoDate'])$(id)?.addEventListener('change',()=>activePeriods().forEach(p=>refresh(p)));
  $('cukaiSourcePrint').addEventListener('click',()=>{const s=states.get(period());if(!enabled||!s?.ready)return;const html=printHTML(s,filters());$('previewFrame').srcdoc=typeof win.balBrandPrint==='function'?win.balBrandPrint(html):html;$('previewModal').hidden=false;$('closePreview').focus();});
  doc.addEventListener('visibilitychange',()=>{if(enabled&&!doc.hidden)activePeriods().forEach(p=>refresh(p));});
  win.ppicCukaiSessionReady=()=>{enabled=true;generation++;lastError='';$('cukaiSourceRefresh').disabled=false;activePeriods().forEach(p=>refresh(p));schedule();};
  win.ppicCukaiClear=()=>{enabled=false;generation++;if(timer)win.clearTimeout(timer);timer=null;busy.clear();states.clear();rawDaily=[];rawReports=[];lastError='';$('cukaiSourceRefresh').disabled=true;$('cukaiSourcePool').replaceChildren(new Option('Semua kelompok',''));for(const id of ['cukaiSourceFrom','cukaiSourceTo'])$(id).value='';render();};
  win.ppicRefreshCukaiSource=refresh;
  render();
 }
 return Object.freeze({validate,accept,dailyProjection,reportProjection,mergeDaily,mergeReports,selected,printHTML,mount});
});
