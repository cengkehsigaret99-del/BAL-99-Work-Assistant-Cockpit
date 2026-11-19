(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BALPayroll = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const DENOMINATIONS = Object.freeze([100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100]);
  const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const text = value => typeof value === 'string' ? value.trim() : '';
  const key = (div, id) => div + '|' + text(id).toUpperCase();
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = value => value == null ? '—' : new Intl.NumberFormat('id-ID', {maximumFractionDigits: 2}).format(value);
  const rupiah = value => value == null ? 'Belum ditetapkan' : 'Rp ' + fmt(value);
  const sum = (rows, field) => rows.reduce((total, row) => total + (number(row[field]) || 0), 0);
  const chunk = (rows, size) => Array.from({length: Math.ceil(rows.length / size)}, (_, i) => rows.slice(i * size, (i + 1) * size));
  function weightedChunks(rows, limit, weight) {
    const parts=[];let part=[],used=0;
    for(const row of rows){const units=weight(row);if(part.length&&used+units>limit){parts.push(part);part=[];used=0;}part.push(row);used+=units;}
    if(part.length)parts.push(part);return parts;
  }
  const dateLabel = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? new Intl.DateTimeFormat('id-ID', {day:'2-digit', month:'short', timeZone:'UTC'}).format(new Date(date + 'T00:00:00Z')) : 'Tanggal belum tersedia';
  function denominations(amount) {
    if (!Number.isSafeInteger(amount) || amount < 0) return {counts: DENOMINATIONS.map(() => 0), allocated: 0, remainder: amount, valid: false};
    let remaining = amount;
    const counts = DENOMINATIONS.map(d => {const n = Math.floor(remaining / d); remaining -= n * d; return n;});
    return {counts, allocated: amount - remaining, remainder: remaining, valid: true};
  }
  function datesBetween(start, end) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end || '') || start > end) return [];
    const dates = [], last = new Date(end + 'T00:00:00Z');
    for (let d = new Date(start + 'T00:00:00Z'); d <= last && dates.length < 367; d.setUTCDate(d.getUTCDate() + 1)) dates.push(d.toISOString().slice(0, 10));
    return dates;
  }
  function normalize(payload, period) {
    const data = payload || {}, meta = data.meta || {}, payroll = meta.payroll || {};
    const sourcePeriod = text(meta.period) || text(period);
    const sourceWorkers = Array.isArray(data.w) ? data.w : [];
    const records = (Array.isArray(data.r) ? data.r : []).map((r, index) => {
      const w = sourceWorkers[r[0]] || [];
      const day = typeof r[1] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r[1]) ? r[1] : /^\d{4}-\d{2}$/.test(sourcePeriod) && Number.isInteger(r[1]) && r[1] >= 1 && r[1] <= 31 ? sourcePeriod + '-' + String(r[1]).padStart(2, '0') : '';
      return {div:text(w[0]), id:text(w[1]), name:text(w[2]), workerIndex:r[0], date:day, brand:text((data.b || [])[r[2]]) || 'Belum teridentifikasi', qty:number(r[3]), wage:number(r[4]), sourceStatus:text((data.s || [])[r[5]]), sourceIndex:index};
    }).filter(r => ['GILING','VERPACK'].includes(r.div) && r.date);
    return {records, payroll, meta};
  }
  function buildModel(payload, options) {
    const o = Object.assign({division:'GILING', start:'', end:'', search:'', period:''}, options || {});
    const {records, payroll, meta} = normalize(payload, o.period);
    const policyScope = !!text(payroll.periodStart) && !!text(payroll.periodEnd) && o.start >= payroll.periodStart && o.end <= payroll.periodEnd;
    const wholePayrollPeriod = o.start === payroll.periodStart && o.end === payroll.periodEnd;
    const bonusPolicy = policyScope ? text(payroll.bonusPolicy) || 'UNKNOWN' : 'UNKNOWN';
    const extrasOverlap = !text(payroll.periodStart) || !text(payroll.periodEnd) || o.end >= payroll.periodStart && o.start <= payroll.periodEnd;
    const allowed = r => (o.division === 'GABUNGAN' || r.div === o.division) && (!text(o.search) || (r.id + ' ' + r.name).toLocaleLowerCase('id-ID').includes(text(o.search).toLocaleLowerCase('id-ID')));
    const scoped = records.filter(r => allowed(r) && r.date >= o.start && r.date <= o.end);
    const grouped = new Map();
    for (const r of scoped) {
      const identity = r.id ? key(r.div,r.id) : r.div + '|UNRESOLVED:' + r.workerIndex;
      if (!grouped.has(identity)) grouped.set(identity, {key:identity,div:r.div,id:r.id,name:r.name,records:[],external:false});
      grouped.get(identity).records.push(r);
    }
    const staffMetadata = payroll.workers || {};
    const staff = [...grouped.values()].map(w => {
      const wm = staffMetadata[w.key] || staffMetadata[key(w.div,w.id)] || {};
      w.gross = w.records.some(r=>r.wage!=null)?sum(w.records,'wage'):null;
      w.quantity = w.records.some(r=>r.qty!=null)?sum(w.records,'qty'):null;
      w.missingWageRows = w.records.filter(r => r.wage == null).length;
      w.missingQtyRows = w.records.filter(r => r.qty == null).length;
      w.negativeRows = w.records.filter(r => (r.wage != null && r.wage < 0) || (r.qty != null && r.qty < 0)).length;
      w.holdReason = text(wm.holdReason) || (!w.id ? 'ID pekerja belum tersedia' : !w.name || w.name === '0' ? 'Nama pekerja belum tersedia' : w.negativeRows ? 'Koreksi negatif perlu direkonsiliasi' : w.records.some(r=>r.qty>0&&r.wage==null) ? 'Nominal upah untuk hasil tercatat belum lengkap' : w.records.some(r=>r.wage>0&&(r.qty==null||r.qty===0)) ? 'Upah tanpa hasil perlu direkonsiliasi' : !Number.isSafeInteger(w.gross) ? 'Nominal rupiah perlu diverifikasi' : '');
      if (wm.identityVerified === false && !w.holdReason) w.holdReason = 'Identitas pekerja perlu diverifikasi';
      w.bonusPolicy = policyScope ? text(wm.bonusPolicy) || bonusPolicy : 'UNKNOWN';
      w.bonus = w.bonusPolicy === 'OFF' ? 0 : wholePayrollPeriod ? number(wm.bonus) : null;
      w.deduction = wholePayrollPeriod ? number(wm.deduction) : null;
      w.net = wholePayrollPeriod && wm.netApproved === true && number(wm.netPay) != null ? wm.netPay : null;
      w.table = text(wm.table); w.note = text(wm.note);
      w.brands = [...new Set(w.records.map(r => r.brand))].map(brand => {const rows=w.records.filter(r=>r.brand===brand),qty=sum(rows,'qty'),wage=sum(rows,'wage');return {brand,qty,wage,rate:qty>0?wage/qty:null};}).filter(b=>b.qty!==0||b.wage!==0);
      w.daily = datesBetween(o.start,o.end).map(date => {const rows=w.records.filter(r=>r.date===date);return {date,qty:rows.some(r=>r.qty!=null)?sum(rows,'qty'):null,wage:rows.some(r=>r.wage!=null)?sum(rows,'wage'):null,brands:[...new Set(rows.filter(r=>r.qty!==0||r.wage!==0).map(r=>r.brand))].join(', '),status:[...new Set(rows.map(r=>r.sourceStatus).filter(Boolean))].join('; ')};});
      return w;
    }).filter(w => w.gross != null && w.gross !== 0 || w.quantity > 0 || w.holdReason && w.records.some(r => r.wage != null && r.wage !== 0));
    const extraHolds = (extrasOverlap && Array.isArray(payroll.holds) ? payroll.holds : []).map((h,i) => ({key:'EXTRA_HOLD:'+i,div:text(h.div),id:text(h.id),name:text(h.name),gross:number(h.wage),quantity:number(h.qty),holdReason:text(h.reason)||'HOLD sesuai sumber',date:text(h.date),source:text(h.source),table:text(h.table),external:true,records:[],daily:datesBetween(o.start,o.end).map(date=>({date,qty:date===text(h.date)?number(h.qty):null,wage:date===text(h.date)?number(h.wage):null,brands:date===text(h.date)?text(h.brand):'',status:date===text(h.date)?text(h.source):''})),note:text(h.date)?'':'Tanggal transaksi belum tersedia; nominal belum dialokasikan per hari.',brands:text(h.brand)?[{brand:text(h.brand),qty:number(h.qty),wage:number(h.wage),rate:number(h.rate)??(number(h.qty)>0&&number(h.wage)!=null?h.wage/h.qty:null)}]:[],bonusPolicy,bonus:bonusPolicy==='OFF'?0:null,deduction:null,net:null,missingWageRows:0,missingQtyRows:0,includedInRecords:h.includedInRecords===true})).filter(h=>allowed(h)&&(!h.date||h.date>=o.start&&h.date<=o.end)&&!h.includedInRecords);
    staff.push(...extraHolds);
    staff.sort((a,b)=>a.div.localeCompare(b.div)||a.name.localeCompare(b.name,'id')||a.id.localeCompare(b.id));
    const pending = (extrasOverlap && Array.isArray(payroll.pending) ? payroll.pending : []).filter(p=>allowed({div:text(p.div),id:text(p.id),name:text(p.name)})&&(!text(p.date)||p.date>=o.start&&p.date<=o.end)).map(p=>({div:text(p.div),id:text(p.id),name:text(p.name),date:text(p.date),qty:number(p.qty),wage:number(p.wage),reason:text(p.reason),source:text(p.source)}));
    const candidates = staff.filter(w=>w.gross>0&&!w.holdReason).map(w=>Object.assign(w,{cash:denominations(w.gross)}));
    const holds = staff.filter(w=>w.holdReason);
    const counts = DENOMINATIONS.map((_,i)=>candidates.reduce((n,w)=>n+w.cash.counts[i],0));
    const totalGross = staff.length && !staff.some(w=>w.gross!=null)?null:sum(staff,'gross'), cashGross = sum(candidates,'gross');
    const divisions = ['GILING','VERPACK'].filter(div=>o.division==='GABUNGAN'||o.division===div).map(div=>({div,quantity:sum(staff.filter(w=>w.div===div),'quantity'),gross:sum(staff.filter(w=>w.div===div),'gross'),candidateGross:sum(candidates.filter(w=>w.div===div),'gross'),count:staff.filter(w=>w.div===div).length,candidates:candidates.filter(w=>w.div===div).length,cutoff:text(payroll.sourceCutoffByDivision?.[div])||text(meta.sourceCutoffByDivision?.[div])||text(meta.cutoff)}));
    const dailySource = [...scoped,...extraHolds.filter(h=>h.date).map(h=>({date:h.date,div:h.div,qty:h.quantity,wage:h.gross}))];
    const daily = datesBetween(o.start,o.end).map(date=>{const rows=dailySource.filter(r=>r.date===date),g=rows.filter(r=>r.div==='GILING'),v=rows.filter(r=>r.div==='VERPACK');return {date,giling:g.some(r=>r.qty!=null)?sum(g,'qty'):null,verpack:v.some(r=>r.qty!=null)?sum(v,'qty'):null,gross:rows.some(r=>r.wage!=null)?sum(rows,'wage'):null,known:rows.some(r=>r.wage!=null)};});
    const days=datesBetween(o.start,o.end).length;
    const heldGross=holds.length&&!holds.some(w=>w.gross!=null)?null:sum(holds,'gross');
    const incompleteWages=staff.filter(w=>w.records.some(r=>r.qty>0&&r.wage==null)).length;
    return {options:o,staff,candidates,holds,pending,divisions,daily,totalGross,cashGross,heldGross,pendingGross:sum(pending,'wage'),counts,allocated:candidates.reduce((n,w)=>n+w.cash.allocated,0),remainder:candidates.reduce((n,w)=>n+w.cash.remainder,0),bonusPolicy,meta,notes:[...(payroll.notes||[]).filter(v=>typeof v==='string'),...(incompleteWages?[incompleteWages+' pekerja memiliki hasil tercatat dengan nominal upah belum lengkap; status HOLD sampai rekonsiliasi.']:[])],valid:!!payload&&days>0&&days<=7,invalidReason:days>7?'Pilih rentang maksimal 7 hari untuk keluaran payroll mingguan.':days===0?'Periksa rentang tanggal yang dipilih.':''};
  }
  const table = (heads, rows, cls='') => '<table class="'+cls+'"><thead><tr>'+heads.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
  function renderDocument(model, options) {
    const opts=Object.assign({kind:'slips',logoUrl:''},options||{}),m=model,o=m.options;
    const sheets=[];
    const metaLine='Periode '+o.start+' s.d. '+o.end+' · '+o.division+(text(o.search)?' · Pekerja: '+text(o.search):' · Semua pekerja');
    const cutoffLine=m.divisions.map(d=>d.div+' sampai '+(d.cutoff||'belum diketahui')).join(' · ');
    const bonus=m.bonusPolicy==='OFF'?'BONUS OFF':'BONUS BELUM DITETAPKAN';
    const mast=title=>'<div class="mast"><img src="'+esc(opts.logoUrl)+'" alt="Logo BAL"><div><b>PR. BANYU ANYAR LESTARI</b><span>'+esc(title)+'</span></div></div>';
    const head=title=>mast(title)+'<h1>'+esc(title)+'</h1><p class="meta">'+esc(metaLine)+'</p><p class="meta">'+esc(cutoffLine)+' · '+bonus+'</p><p class="state">WORKING / OPEN RECON</p>';
    const foot=(index,total)=>'<footer>PR. BANYU ANYAR LESTARI · Dokumen privat · Halaman '+index+' dari '+total+'</footer>';
    const cutoffFor=div=>m.divisions.find(d=>d.div===div)?.cutoff||'belum diketahui';
    const slip=(w,compact,index)=>{
      const unit=w.div==='GILING'?'batang':'pack';
      const rows=w.daily.length?w.daily.map(d=>[dateLabel(d.date),d.brands||'—',fmt(d.qty),rupiah(d.wage)]):[[dateLabel(w.date),w.brands.map(b=>b.brand).join(', ')||'Belum teralokasi',fmt(w.quantity),rupiah(w.gross)]];
      const brandRows=w.brands.map(b=>[b.brand,fmt(b.qty)+' '+unit,b.rate==null?'—':'Rp '+fmt(b.rate)+'/'+unit,rupiah(b.wage)]);
      return '<article class="slip '+(compact?'compact':'large')+'">'+mast('SLIP GAJI · '+w.div)+'<div class="slip-title"><h2>'+esc(w.name||'NAMA BELUM TERSEDIA')+'</h2><span>#'+index+'</span></div><p class="identity">ID '+esc(w.id||'BELUM ADA ID')+(w.table?' · Meja '+esc(w.table):'')+'</p><p class="meta">'+esc(o.start)+' s.d. '+esc(o.end)+' · Data '+esc(cutoffFor(w.div))+'</p><div class="state '+(w.holdReason?'hold':'')+'">'+esc(w.holdReason?'HOLD · '+w.holdReason:'WORKING / OPEN RECON')+'</div>'+table(['Tanggal','Merek','Hasil ('+unit+')','Upah bruto'],rows)+(!compact?'<h3>Perhitungan per merek</h3>':'')+(brandRows.length?table(['Merek','Jumlah','Tarif','Upah'],brandRows,'brands'):'')+'<div class="gross"><span>TOTAL UPAH BRUTO</span><strong>'+esc(rupiah(w.gross))+'</strong></div><dl class="pay-lines"><div><dt>Bonus '+(w.bonusPolicy==='OFF'?'OFF':'')+'</dt><dd>'+esc(w.bonus==null?'Belum ditetapkan':rupiah(w.bonus))+'</dd></div><div><dt>Potongan / kasbon</dt><dd>'+esc(w.deduction==null?'Belum tersedia':rupiah(w.deduction))+'</dd></div><div><dt>Gaji bersih</dt><dd>'+esc(w.net==null?'Belum ditetapkan':rupiah(w.net))+'</dd></div></dl><p class="legend">0 = nol pada sumber; — = data belum tersedia. Hasil kerja tidak menjadi bukti absensi resmi.</p>'+(w.note?'<p class="legend">'+esc(w.note)+'</p>':'')+(w.external?'<p class="legend">Sumber: '+esc(w.source)+'</p>':'')+'<div class="signature"><span>Pemeriksa<br><i></i></span><span>Penerima<br><i></i></span></div>'+(!compact?'<p class="legend">Tanggal pembayaran: ____________________<br>Nominal bruto merupakan dasar rekonsiliasi; pembayaran dan gaji bersih belum disahkan.</p>':'<p class="legend">Sebelum potongan / kasbon. Tanggal bayar: __________</p>')+'</article>';
    };
    if(opts.kind==='slips'){
      let sequence=0;
      for(const div of ['GILING','VERPACK']){
        const staff=m.staff.filter(w=>w.div===div);
        let compact=[];
        const flush=()=>{for(const group of chunk(compact,4))sheets.push({orientation:'portrait',body:'<div class="giling-grid">'+group.map(w=>slip(w,true,++sequence)).join('')+'</div>'});compact=[];};
        for(const w of staff){if(div==='GILING'&&w.daily.length<=8&&w.brands.length<=3)compact.push(w);else{flush();sheets.push({orientation:'portrait',body:slip(w,false,++sequence)});}}flush();
      }
    }else{
      const qty=m.divisions.map(d=>'<div><span>'+esc(d.div)+' ('+(d.div==='GILING'?'batang':'pack')+')</span><b>'+esc(fmt(d.quantity))+'</b></div>').join('');
      const summary=head('REKAP TARIK TUNAI · '+o.division)+'<div class="metrics"><div><span>Upah bruto tercatat</span><b>'+esc(rupiah(m.totalGross))+'</b></div><div><span>HOLD · '+m.holds.length+' pekerja</span><b>'+esc(rupiah(m.heldGross))+'</b></div><div><span>Calon tunai berdasarkan bruto</span><b>'+esc(rupiah(m.cashGross))+'</b></div><div><span>Calon penerima per divisi</span><b>'+m.candidates.length+'</b></div>'+qty+'</div><p class="note">Dasar tunai adalah upah bruto penerima yang tidak berstatus HOLD. Potongan / kasbon dan gaji bersih belum ditetapkan. Dokumen ini belum menjadi bukti pembayaran.</p><h2>Rekap hasil harian</h2>'+table(['Tanggal','Giling (batang)','Verpack (pack)','Upah bruto'],m.daily.map(d=>[dateLabel(d.date),fmt(d.giling),fmt(d.verpack),d.known?rupiah(d.gross):'—']))+'<p class="legend">Batang dan pack disajikan terpisah. Pending di luar bruto: '+esc(rupiah(m.pendingGross))+'.</p>';
      sheets.push({orientation:'portrait',body:summary});
      const exceptions=[...m.holds.map(w=>[w.div,w.id||'BELUM ADA ID',w.name,'HOLD',rupiah(w.gross),w.holdReason]),...m.pending.map(w=>[w.div,w.id||'—',w.name,'PENDING',rupiah(w.wage),w.reason+(w.date?' · '+w.date:' · Tanggal belum tersedia')])];
      for(const part of chunk(exceptions,10))sheets.push({orientation:'portrait',body:head('CATATAN REKONSILIASI')+table(['Divisi','ID','Nama','Status','Nominal','Keterangan'],part)+'<p class="note">HOLD tidak masuk calon tunai. Pending tidak masuk bruto maupun pecahan. Kekurangan data tidak diganti nol.</p>'});
      for(const part of chunk(m.notes,10))sheets.push({orientation:'portrait',body:head('CATATAN SUMBER PAYROLL')+'<ul class="notes">'+part.map(n=>'<li>'+esc(n)+'</li>').join('')+'</ul>'});
      sheets.push({orientation:'portrait',body:head('KEBUTUHAN PECAHAN TUNAI')+table(['Pecahan (Rp)','Jumlah lembar / koin','Nilai (Rp)'],DENOMINATIONS.map((d,i)=>[fmt(d),fmt(m.counts[i]),fmt(d*m.counts[i])]))+'<div class="gross"><span>Total pecahan</span><strong>'+esc(rupiah(m.allocated))+'</strong></div><p><strong>Sisa yang belum terwakili pecahan: '+esc(rupiah(m.remainder))+'</strong></p><p class="note">Pecahan dihitung untuk setiap orang, kemudian dijumlahkan. Sisa tidak dibulatkan dan tidak mengurangi hak upah. Cocokkan jumlah pecahan + sisa dengan calon bruto '+esc(rupiah(m.cashGross))+'.</p>'+'<div class="signature roomy"><span>Disusun oleh<br><i></i></span><span>Diperiksa oleh<br><i></i></span><span>Disetujui oleh<br><i></i></span></div><p>Tanggal: ____________________</p>'});
      for(const part of chunk(m.candidates.filter(w=>w.cash.remainder),20))sheets.push({orientation:'portrait',body:head('DAFTAR SISA PECAHAN')+table(['Divisi','ID','Nama','Sisa (Rp)'],part.map(w=>[w.div,w.id,w.name,fmt(w.cash.remainder)]))+'<p class="note">Sisa tetap tercatat sebagai hak upah. Tidak dibulatkan dan tidak dianggap lunas.</p>'});
      let rowNo=0;
      for(const group of weightedChunks(m.candidates,20,w=>Math.max(1,Math.ceil(w.name.length/30),Math.ceil(w.id.length/14)))){sheets.push({orientation:'landscape',body:head('DAFTAR CALON PENERIMA / PARAF')+table(['No','Divisi','ID','Nama','Hasil','Upah bruto','Gaji bersih','Tanggal bayar','Paraf'],group.map(w=>[++rowNo,w.div,w.id,w.name,fmt(w.quantity)+' '+(w.div==='GILING'?'batang':'pack'),rupiah(w.gross),w.net==null?'':rupiah(w.net),'','']),'recipients')+'<p class="subtotal">Subtotal halaman: '+group.length+' penerima · '+esc(rupiah(sum(group,'gross')))+'</p><p class="legend">Kolom gaji bersih dan pembayaran diisi setelah rekonsiliasi dan pengesahan.</p>'});}
      rowNo=0;
      for(const group of weightedChunks(m.candidates,24,w=>Math.max(1,Math.ceil(w.name.length/30),Math.ceil(w.id.length/13)))){sheets.push({orientation:'landscape',body:head('RINCIAN PECAHAN PER PENERIMA')+table(['No','Divisi','ID','Nama','Bruto',...DENOMINATIONS.map(fmt),'Sisa'],group.map(w=>[++rowNo,w.div,w.id,w.name,fmt(w.gross),...w.cash.counts.map(fmt),fmt(w.cash.remainder)]),'denoms')+'<p class="subtotal">Subtotal halaman: '+esc(rupiah(sum(group,'gross')))+'</p>'});}
    }
    const css='@page portrait{size:A4 portrait;margin:10mm}@page landscape{size:A4 landscape;margin:10mm}@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}html,body{margin:0;padding:0;font:10pt/1.4 Arial,sans-serif;color:#183c50;background:#dce5ec}.sheet{background:#fff;width:190mm;min-height:277mm;margin:12px auto;padding:0;position:relative;break-after:page;page-break-after:always;page:portrait}.sheet:last-child{break-after:auto;page-break-after:auto}.sheet.landscape{width:277mm;min-height:190mm;page:landscape}.sheet-content{padding-bottom:9mm}footer{position:absolute;bottom:0;left:0;width:100%;height:7mm;border-top:1px solid #b6cbd4;color:#647784;font-size:7pt;padding-top:2mm}.mast{display:flex;gap:3mm;align-items:center;border-bottom:2px solid #b19155;padding-bottom:3mm}.mast img{width:16mm;height:16mm;object-fit:contain}.mast b{display:block;font-size:12pt}.mast span{display:block;font-size:8pt;color:#537180}h1{font-size:17pt;line-height:1.2;margin:4mm 0 2mm}h2{font-size:12pt;margin:4mm 0 2mm}h3{font-size:10pt}.meta{font-size:8pt;color:#4f6676;margin:1.5mm 0}.state{padding:1.5mm 2mm;background:#e9f2f5;color:#1e6075;font-size:8pt;font-weight:bold}.state.hold{background:#fff0d5;color:#825b1c}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:3mm;margin:4mm 0}.metrics div{background:#eff6f8;padding:3mm}.metrics span{display:block;font-size:8pt}.metrics b{font-size:15pt}table{border-collapse:collapse;width:100%;margin:3mm 0;font-size:8pt;table-layout:fixed}th,td{border:1px solid #c7d8e1;padding:1.6mm;vertical-align:top;overflow-wrap:anywhere;text-align:left}th{background:#174b64;color:#fff;font-size:7.5pt}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}.note{padding:3mm;background:#fff6e5;border-left:3px solid #bd9a54;font-size:9pt}.legend,.notes{font-size:7.5pt;color:#526875}.gross{display:flex;justify-content:space-between;align-items:center;gap:2mm;padding:3mm;background:#e4f1f6;font-weight:bold}.gross strong{font-size:15pt}.subtotal{font-size:9pt;font-weight:bold}.signature{display:flex;justify-content:space-between;gap:5mm;margin-top:4mm;font-size:8pt}.signature span{flex:1;text-align:center}.signature i{display:block;height:12mm;border-bottom:1px solid #b3c5ce}.signature.roomy{margin-top:10mm}.signature.roomy i{height:20mm}.identity{font-size:8pt;font-weight:bold;margin:1mm 0}.slip-title{display:flex;justify-content:space-between;align-items:center;gap:3mm}.slip-title h2{margin:2mm 0;font-size:12pt}.slip-title span{font-size:7pt;color:#637784}.pay-lines{margin:2mm 0;font-size:8pt}.pay-lines div{display:flex;justify-content:space-between;gap:3mm;margin:1mm 0}.pay-lines dt,.pay-lines dd{margin:0}.giling-grid{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:131mm 131mm;gap:5mm;height:267mm}.slip{border:1px solid #a8c5d4;padding:4mm;break-inside:avoid;page-break-inside:avoid}.slip.large{min-height:267mm}.compact .mast img{width:10mm;height:10mm}.compact .mast b{font-size:7.5pt}.compact .mast span{font-size:6pt}.compact .mast{gap:2mm;padding-bottom:2mm}.compact h2{font-size:9pt}.compact .meta,.compact .identity,.compact .state{font-size:6.5pt}.compact table{font-size:6.8pt;margin:2mm 0}.compact th{font-size:6pt}.compact th,.compact td{padding:1mm}.compact .gross{padding:2mm;font-size:6.8pt}.compact .gross strong{font-size:10pt}.compact .pay-lines{font-size:6.5pt}.compact .legend{font-size:5.8pt;line-height:1.25;margin:1.5mm 0}.compact .signature{font-size:6.5pt;margin-top:2mm}.compact .signature i{height:7mm}.landscape .mast{padding-bottom:2mm}.landscape .mast img{width:10mm;height:10mm}.landscape .mast b{font-size:9pt}.landscape .mast span{font-size:6.5pt}.landscape h1{font-size:12pt;margin:3mm 0 2mm}.landscape .meta{font-size:6.5pt;line-height:1.2;margin:1mm 0}.landscape .state{font-size:7pt;padding:1mm 2mm;margin:2mm 0}.denoms{font-size:6.5pt;line-height:1.15}.denoms th,.denoms td{padding:.8mm}.denoms th{font-size:6pt}.denoms th:nth-child(4),.denoms td:nth-child(4){width:37mm}.denoms th:nth-child(3),.denoms td:nth-child(3){width:19mm}.denoms th:nth-child(5),.denoms td:nth-child(5){width:21mm}.recipients{font-size:8pt;line-height:1.2}.recipients th,.recipients td{padding:1.1mm}.recipients td{height:5.5mm}.recipients th:nth-child(4){width:45mm}@media screen{.sheet{padding:6mm;min-height:auto}.giling-grid{height:auto;grid-template-rows:minmax(131mm,auto) minmax(131mm,auto)}footer{position:static;margin-top:3mm}.sheet-content{padding-bottom:0}}@media screen and (max-width:800px){body{padding:8px}.sheet,.sheet.landscape{width:100%;margin:0 0 12px;padding:12px}.giling-grid{display:block;height:auto}.slip{margin-bottom:12px}.compact{min-height:0}.compact table{font-size:8pt}.compact .legend{font-size:7pt}.compact .mast b{font-size:10pt}.metrics{grid-template-columns:1fr 1fr}.metrics b{font-size:12pt}.sheet.landscape table{font-size:6.5pt}.sheet.landscape th{font-size:6pt}.denoms th:nth-child(3),.denoms td:nth-child(3),.denoms th:nth-child(4),.denoms td:nth-child(4),.denoms th:nth-child(5),.denoms td:nth-child(5),.recipients th:nth-child(4){width:auto}.slip.large{min-height:0}}@media print{html,body{background:#fff}.sheet{margin:0}.sheet.landscape .sheet-content{padding-bottom:9mm}a{color:inherit;text-decoration:none}}';
    return '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc('BAL '+(opts.kind==='slips'?'Slip Gaji':'Rekap Tarik Tunai')+' '+o.division+' '+o.start+' s.d. '+o.end)+'</title><style>'+css+'</style></head><body>'+sheets.map((s,i)=>'<section class="sheet '+s.orientation+'"><div class="sheet-content">'+s.body+'</div>'+foot(i+1,sheets.length)+'</section>').join('')+'</body></html>';
  }
  return Object.freeze({DENOMINATIONS,denominations,normalize,buildModel,renderDocument,format:fmt});
});
