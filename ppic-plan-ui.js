"use strict";
(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 if(root&&root.document){root.PPICProductionPlan=api;api.mount(root);}
})(typeof window==='object'?window:null,function(){
 const STATES={MISSING_PROOF:'Bukti belum lengkap',PARTIAL_PROOF:'Bukti sebagian',METADATA_CONFLICT:'Konflik tanggal',VERIFIED:'Terbukti'};
 const readableDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)?new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T00:00:00Z')):'Belum diketahui';
 const readableTime=d=>typeof d==='string'&&Number.isFinite(Date.parse(d))?new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(d))+' WIB':'Belum tercatat';
 const fmt=n=>typeof n==='number'&&Number.isFinite(n)?new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}).format(n):'Belum terverifikasi';
 const text=(v,n=600)=>typeof v==='string'?v.slice(0,n):'';
 const lst=x=>Array.isArray(x)?x:[];
 function buildModel(data,period){
  if(data?.ok!==true||data?.period!==period)throw Error('Periode rencana tidak cocok.');
  if(data.ready!==true)return {ready:false,period};
  const s=data.latest;
  if(!s||!['HOLD_DATA','PROPOSALS_READY'].includes(s.state)||typeof s.evidence_current!=='boolean'||!Array.isArray(s.gates))throw Error('Format rencana tidak valid.');
  return{ready:true,period,created_at:s.created_at,analysis_as_of:s.analysis_as_of,state:s.state,evidence_current:s.evidence_current,
   skt_observed:s.skt_observed,skt_captured_at:s.skt_captured_at,skt_counts:s.skt_counts,gates:lst(s.gates),actions:lst(s.next_actions),
   proposals:lst(s.proposal_lines),facts:lst(s.source_facts)};
 }
 function mount(win){
  const doc=win.document,$=id=>doc.getElementById(id),panel=$('ppicPlanPanel');
  if(!panel)return;
  let enabled=false,loading=false,sequence=0,timer=null,model=null;
  const node=(tag,value,cls)=>{const e=doc.createElement(tag);if(value!==undefined)e.textContent=value;if(cls)e.className=cls;return e;};
  const period=()=>$('robotPeriod')?.value||'2026-11';
  const notify=(str,tone='neutral')=>{$('ppicPlanStatus').textContent=str;$('ppicPlanStatus').dataset.tone=tone;};
  const stop=()=>{if(timer!==null)win.clearTimeout(timer);timer=null;};
  const schedule=()=>{stop();if(enabled)timer=win.setTimeout(()=>{if(!doc.hidden)refresh();else schedule();},180000);};
  const metric=(name,value)=>{const e=node('div',undefined,'ppic-plan-metric');e.append(node('span',name),node('strong',value));return e;};
  function render(m){
   const badge=$('ppicPlanBadge');
   badge.textContent=!m.ready?'Belum tersedia':!m.evidence_current?'Sumber berubah':m.state==='HOLD_DATA'?'Menunggu bukti':'Usulan siap ditinjau';
   badge.dataset.tone=!m.ready?'neutral':m.state==='HOLD_DATA'||!m.evidence_current?'alert':'good';
   if(!m.ready){notify('Snapshot rencana belum tersedia untuk periode ini. Rencana hanya dibuat dari sumber yang dapat diverifikasi.');return;}
   $('ppicPlanTime').textContent='Sumber analisis: '+readableDate(m.analysis_as_of)+' · pemeriksaan rencana: '+readableTime(m.created_at)+'.';
   const counts=m.skt_counts;
   const metrics=$('ppicPlanMetrics');
   metrics.replaceChildren(
    metric('Form pesanan SKT',m.skt_observed&&counts?fmt(counts.co_orders):'Belum terbaca'),
    metric('Realisasi pada mirror',m.skt_observed&&counts?fmt(counts.co_realizations):'Belum terbaca'),
    metric('Alokasi pada mirror',m.skt_observed&&counts?fmt(counts.co_allocations):'Belum terbaca'),
    metric('Usulan SKU terhitung',fmt(m.proposals.filter(x=>x.state==='PROPOSAL_ONLY').length))
   );
   if(!m.evidence_current)notify('Sumber PPIC, briefing, atau revisi mirror SKT berubah. Tampilan ini HISTORIS; tidak boleh dijadikan target atau komitmen baru.','alert');
   else if(m.state==='HOLD_DATA')notify('Rencana kuantitatif belum dapat dihitung secara sah. Angka historis bukan permintaan firm atau stok bebas. Daftar bukti di bawah adalah prioritas pemeriksaan.','alert');
   else notify('Terdapat usulan berdasarkan sumber terverifikasi. Angka tetap memerlukan tinjauan Owner sebelum menjadi rencana resmi.','neutral');
   const box=$('ppicPlanGates');box.replaceChildren();
   for(const g of m.gates){
    const e=node('article',undefined,'ppic-plan-gate');
    const head=node('div',undefined,'ppic-plan-gate-head');
    head.append(node('strong',g.label||g.code),node('span',STATES[g.state]||g.state,'ppic-plan-gate-state'));
    e.append(head,node('p',text(g.message,520),'ppic-plan-muted'));
    if(g.owner_role)e.append(node('small','Penanggung jawab usulan: '+text(g.owner_role,140),'ppic-plan-muted'));
    box.append(e);
   }
   const tasks=$('ppicPlanActions');tasks.replaceChildren();
   for(const a of m.actions){
    const e=node('article',undefined,'ppic-plan-action');
    e.append(node('span',a.priority,'ppic-plan-priority'),node('strong',text(a.division,120)));
    e.append(node('p',text(a.task,1200)));
    tasks.append(e);
   }
   const previews=$('ppicPlanSKU');previews.replaceChildren();
   if(!m.proposals.length)previews.append(node('p','Belum ada SKU yang bisa dihitung: belum tersedia baris pesanan firm beserta stok QC, bahan, pita fisik dan kapasitas efektif yang sebanding.','ppic-plan-muted'));
   for(const s of m.proposals){
    const e=node('article',undefined,'ppic-plan-sku');
    e.append(node('strong',s.sku+' · '+(s.state==='PROPOSAL_ONLY'?'USULAN':'TERTAHAN')));
    if(s.state==='PROPOSAL_ONLY'){
     e.append(node('p','Permintaan firm: '+fmt(s.firm_order_pack)+' pack; bebas QC: '+fmt(s.available_pack)+' pack.','ppic-plan-muted'));
     e.append(node('p','Usulan kirim '+fmt(s.proposed_ship_pack)+' pack · produksi '+fmt(s.proposed_make_pack)+' pack. Perlu persetujuan Owner.','ppic-plan-sku-value'));
    }else{
     e.append(node('p','Belum boleh menghitung kuantitas. Bukti kurang: '+lst(s.missing).join(', '),'ppic-plan-muted'));
    }
    previews.append(e);
   }
   const facts=$('ppicPlanFacts');facts.replaceChildren();
   for(const f of m.facts){
    const e=node('div',undefined,'ppic-plan-fact');
    e.append(node('strong',f.division+' · '+f.key));
    const value=f.quality==='SOURCE'&&typeof f.value==='number'?fmt(f.value)+' '+(f.unit||''):f.quality==='MISSING'?'Belum tersedia':f.quality==='ESTIMATE'?'Estimasi (bukan stok fisik)':f.quality==='REFERENCE'?'Referensi (belum final)':text(f.value,100)||'Belum terbukti';
    e.append(node('span',value,'ppic-plan-muted'));
    e.append(node('small',f.document_id+' · '+readableDate(f.cutoff),'ppic-plan-muted'));
    facts.append(e);
   }
   $('ppicPlanSktNotice').textContent=m.skt_observed
    ?'Mirror SKT versi formulir terkini, dicatat '+readableTime(m.skt_captured_at)+'. Jumlah dokumen tidak sama dengan pesanan firm atau jumlah transaksi final.'
    :'Belum ada pengamatan mirror SKT yang dapat diverifikasi; angka pesanan tidak diasumsikan nol.';
  }
  function reset(){
   model=null;
   for(const id of ['ppicPlanMetrics','ppicPlanGates','ppicPlanActions','ppicPlanSKU','ppicPlanFacts'])$(id).replaceChildren();
   $('ppicPlanBadge').textContent='Belum diperiksa';$('ppicPlanBadge').dataset.tone='neutral';
   $('ppicPlanTime').textContent='Belum ada rencana yang dibaca.';$('ppicPlanSktNotice').textContent='';
   $('ppicPlanRefresh').disabled=true;notify('Masuk sebagai Owner untuk membaca rencana bersumber.');
  }
  async function refresh(){
   if(!enabled||loading||typeof win.ppicLoadPlanStatus!=='function')return;
   const current=++sequence,p=period();loading=true;$('ppicPlanRefresh').disabled=true;
   notify('Memeriksa sumber dan snapshot rencana…');
   try{
    const res=await win.ppicLoadPlanStatus(p);
    if(!enabled||current!==sequence||p!==period())return;
    model=buildModel(res,p);render(model);
   }catch(e){if(enabled&&current===sequence)notify('Rencana belum terbaca: '+text(e?.message,170),'alert');}
   finally{loading=false;$('ppicPlanRefresh').disabled=!enabled;schedule();}
  }
  $('ppicPlanRefresh').addEventListener('click',refresh);
  $('ppicPlanAsk').addEventListener('click',()=>{
   const input=$('ppicAskText'),select=$('ppicAskIntent');
   if(!enabled||!input||input.disabled||!select)return;
   select.value='ANALYZE';
   input.value='Berdasarkan rencana PPIC terakhir, rincikan bukti yang harus dikumpulkan dari DO, QC Barang Jadi, Cukai, bahan baku dan SDM untuk menghitung rencana produksi dan pengiriman per SKU secara aman. Pisahkan data terverifikasi dan data yang belum tersedia.';
   input.focus();input.scrollIntoView({block:'center',behavior:'smooth'});
   notify('Pertanyaan analisis disiapkan. Periksa dan tekan Kirim ke GPT bila sudah sesuai.','neutral');
  });
  $('robotPeriod')?.addEventListener('change',()=>{sequence++;model=null;if(enabled)refresh();});
  doc.addEventListener('visibilitychange',()=>{if(!doc.hidden&&enabled&&!loading)refresh();});
  win.ppicPlanSessionReady=()=>{enabled=true;$('ppicPlanRefresh').disabled=false;refresh();};
  win.ppicPlanClear=()=>{enabled=false;sequence++;stop();loading=false;reset();};
  reset();
 }
 return {buildModel,mount};
});
