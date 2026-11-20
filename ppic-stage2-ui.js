"use strict";
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root&&root.document){root.PPICStage2=api;api.mount(root);}
})(typeof window==='object'?window:null,function(){
 const STATES={PASS:'Cocok secara buku',FAIL:'Selisih buku',INSUFFICIENT:'Data belum lengkap',DATE_MISMATCH:'Tanggal berbeda',NOT_COMPARABLE:'Belum bisa dibandingkan'};
 const fmtDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)?new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T00:00:00Z')):'Belum tersedia';
 const fmtTime=d=>typeof d==='string'&&Number.isFinite(Date.parse(d))?new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(d))+' WIB':'Belum tercatat';
 const number=(v,unit='')=>typeof v==='number'&&Number.isFinite(v)?new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}).format(v)+(unit?' '+unit:''):'Belum tersedia';
 const obj=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
 const list=x=>Array.isArray(x)?x:[];
 function buildModel(payload,period){
  const p=obj(payload);
  if(p.ok!==true||p.period!==period)throw Error('Periode rekonsiliasi tidak cocok.');
  if(p.ready!==true)return{ready:false,period};
  const s=obj(p.latest);
  if(!['OPEN_RECON','BLOCKED'].includes(s.status)||!Array.isArray(s.checks)||!Array.isArray(s.coverage)||!Array.isArray(s.warnings))throw Error('Format rekonsiliasi belum didukung.');
  return{ready:true,period,status:s.status,created_at:s.created_at,source_count:s.source_count,archived_source_count:s.archived_source_count,
   checks:list(s.checks),warnings:list(s.warnings),coverage:list(s.coverage),indicators:obj(s.indicators),evidence_hash:s.evidence_hash};
 }
 function mount(win){
  const doc=win.document,$=id=>doc.getElementById(id),panel=$('ppicStage2Panel');
  if(!panel)return;
  const make=(tag,value,cls)=>{const el=doc.createElement(tag);if(value!==undefined)el.textContent=value;if(cls)el.className=cls;return el;};
  let enabled=false,loading=false,seq=0,timer=null,model=null;
  const period=()=>$('robotPeriod')?.value||'2026-11';
  const notice=(value,tone='neutral')=>{const node=$('ppicStage2Message');node.textContent=value;node.dataset.tone=tone;};
  const clearTimer=()=>{if(timer!==null)win.clearTimeout(timer);timer=null;};
  const schedule=()=>{clearTimer();if(enabled)timer=win.setTimeout(()=>{if(doc.hidden)schedule();else refresh();},180000);};
  function reset(){
   model=null;
   for(const id of ['ppicStage2Metrics','ppicStage2Checks','ppicStage2Warnings','ppicStage2Coverage'])$(id).replaceChildren();
   $('ppicStage2Refresh').disabled=true;
   $('ppicStage2Badge').textContent='Belum diperiksa';$('ppicStage2Badge').dataset.tone='neutral';
   $('ppicStage2Time').textContent='Belum ada snapshot yang dimuat.';
   notice('Login sebagai Owner untuk membaca rekonsiliasi privat.');
  }
  function render(m){
   $('ppicStage2Badge').textContent=m.ready?(m.status==='BLOCKED'?'Perlu rekonsiliasi':'Open recon'):'Belum tersedia';
   $('ppicStage2Badge').dataset.tone=m.ready?'alert':'neutral';
   if(!m.ready){notice('Belum ada snapshot analitik Tahap 2 untuk periode ini. Pembaruan mengikuti pemeriksaan robot.', 'neutral');return;}
   $('ppicStage2Time').textContent='Snapshot analitik: '+fmtTime(m.created_at)+'. Muat ulang hanya membaca hasil tersimpan.';
   notice('Buku diperiksa otomatis; angka sumber belum otomatis menjadi stok fisik, laporan final, atau transaksi baru.','neutral');
   const mbox=$('ppicStage2Metrics');mbox.replaceChildren();
   const fields=[['Divisi terpilih',number(m.source_count)],['Arsip PPIC diterima',number(m.archived_source_count)],
    ['Pemeriksaan cocok',number(m.checks.filter(x=>x.state==='PASS').length)],
    ['Temuan terbuka',number(m.warnings.length)]];
   for(const [name,value]of fields){const card=make('div',undefined,'ppic-s2-metric');card.append(make('span',name),make('strong',value));mbox.append(card);}
   const cbox=$('ppicStage2Checks');cbox.replaceChildren();
   if(!m.checks.length)cbox.append(make('p','Belum ada rekonsiliasi yang bisa dilakukan.','ppic-s2-muted'));
   for(const check of m.checks){
    const item=make('article',undefined,'ppic-s2-check');
    const head=make('div',undefined,'ppic-s2-check-head');
    const title={
     BJ_BOOK_MUTATION:'Mutasi buku Barang Jadi',DO_BJ_DELIVERY_BOOK:'Pengeluaran Barang Jadi ↔ DO',
     TSG_BOOK_MUTATION:'Mutasi buku TSG',CUKAI_BOOK_MUTATION:'Mutasi buku pita Cukai',
     GILING_VERPACK_BJ_HANDOVER:'Serah-terima Giling → Verpack → BJ'
    }[check.code]||check.code;
    head.append(make('strong',title),make('span',STATES[check.state]||check.state,'ppic-s2-tag'));
    item.append(head,make('p',check.message||'Belum ada uraian','ppic-s2-muted'));
    if(check.state==='PASS'&&check.reported!==null)item.append(make('p','Hasil buku: '+number(check.reported,check.unit||''),'ppic-s2-value'));
    if(check.state==='PASS'&&check.do_pack!==null&&check.bj_pack!==null)item.append(make('p','DO '+number(check.do_pack,'pack')+' = BJ '+number(check.bj_pack,'pack'),'ppic-s2-value'));
    cbox.append(item);
   }
   const wbox=$('ppicStage2Warnings');wbox.replaceChildren();
   if(!m.warnings.length)wbox.append(make('p','Belum ada temuan pada snapshot ini.','ppic-s2-muted'));
   for(const warn of [...m.warnings].sort((a,b)=>(a.severity==='HIGH'?-1:1)-(b.severity==='HIGH'?-1:1))){
    const item=make('article',undefined,'ppic-s2-warning');
    item.append(make('strong',(warn.severity==='HIGH'?'Penting · ':'Perlu diperiksa · ')+(warn.division||'Data')));
    item.append(make('p',warn.message||warn.code,'ppic-s2-muted'));
    if(warn.source_cutoff||warn.report_cutoff)item.append(make('small','Sumber '+fmtDate(warn.source_cutoff)+' · Laporan '+fmtDate(warn.report_cutoff),'ppic-s2-muted'));
    wbox.append(item);
   }
   const coverage=$('ppicStage2Coverage');coverage.replaceChildren();
   for(const row of m.coverage){const item=make('div',undefined,'ppic-s2-cover-row');
    item.append(make('strong',row.division||'Divisi'));
    item.append(make('span','Sumber '+fmtDate(row.source_cutoff)+' · laporan '+fmtDate(row.report_cutoff),'ppic-s2-muted'));
    if(row.report_status==='METADATA_CONFLICT')item.append(make('span','Konflik metadata','ppic-s2-alert'));
    coverage.append(item);
   }
  }
  async function refresh(){
   if(!enabled||loading||typeof win.ppicLoadStage2Status!=='function')return;
   loading=true;const current=++seq,p=period();$('ppicStage2Refresh').disabled=true;
   notice('Membaca snapshot rekonsiliasi tersimpan…');
   try{
    const value=await win.ppicLoadStage2Status(p);
    if(!enabled||current!==seq||p!==period())return;
    model=buildModel(value,p);render(model);
   }catch(e){if(enabled&&current===seq)notice('Snapshot terbaru belum dapat dibaca: '+String(e.message||'Periksa koneksi').slice(0,190),'alert');}
   finally{loading=false;$('ppicStage2Refresh').disabled=!enabled;schedule();}
  }
  win.ppicStage2SessionReady=()=>{enabled=true;$('ppicStage2Refresh').disabled=false;refresh();};
  win.ppicStage2Clear=()=>{enabled=false;seq++;clearTimer();loading=false;reset();};
  $('ppicStage2Refresh').addEventListener('click',refresh);
  $('robotPeriod')?.addEventListener('change',()=>{seq++;model=null;notice('Memeriksa periode baru…');if(enabled)refresh();});
  doc.addEventListener('visibilitychange',()=>{if(!doc.hidden&&enabled&&!loading)refresh();});
  reset();
 }
 return{buildModel,mount};
});
