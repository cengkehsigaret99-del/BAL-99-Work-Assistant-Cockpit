"use strict";
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root&&root.document){root.PPICStage3=api;api.mount(root);}
})(typeof window==='object'?window:null,function(){
 const KIND={OWNER_DECISION:'Keputusan Owner',ADMIN_FOLLOWUP:'Tindak lanjut divisi',DATA_BLOCKER:'Bukti perlu dilengkapi'};
 const GATES={BUTUH_VERIFIKASI:'Tertahan: bukti belum cukup',PERLU_TINJAUAN_OWNER:'Perlu tinjauan Owner',TINDAK_LANJUT_DIVISI:'Usulan tindak lanjut divisi'};
 const CONFIDENCE={TINGGI:'Tinggi',SEDANG:'Sedang',RENDAH:'Rendah'};
 const periodValid=x=>typeof x==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(x);
 const dateOnly=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)?new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(x+'T00:00:00Z')):'Belum diketahui';
 const instant=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))?new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jakarta'}).format(new Date(x))+' WIB':'Belum ada pemeriksaan';
 const bounded=(x,n=2000)=>typeof x==='string'?x.slice(0,n):'';
 const list=x=>Array.isArray(x)?x:[];
 function buildModel(payload,period){
  if(!payload||payload.ok!==true||payload.period!==period||!periodValid(period))throw Error('Periode pusat keputusan tidak cocok.');
  if(payload.ready!==true)return {ready:false,period};
  const s=payload.latest;
  if(!s||!['REVIEW_REQUIRED','WAITING_DATA'].includes(s.status)||!Array.isArray(s.decisions)||!Array.isArray(s.focus_ids)||typeof s.evidence_current!=='boolean')
   throw Error('Format pusat keputusan belum sesuai.');
  const cards=s.decisions.filter(x=>x.action_state==='USULAN');
  if(cards.length!==s.decisions.length)throw Error('Status keputusan tidak valid.');
  return {ready:true,period,analysis_as_of:s.analysis_as_of,created_at:s.created_at,status:s.status,evidence_current:s.evidence_current,
    source_count:s.source_count,data_blockers:s.data_blockers,focus_ids:s.focus_ids,cards,risks:list(s.risk_register)};
 }
 function mount(win){
  const doc=win.document,$=id=>doc.getElementById(id),panel=$('ppicStage3Panel');
  if(!panel)return;
  const el=(tag,text,cls)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
  let active=false,loading=false,seq=0,timer=null,last=null;
  const period=()=>$('robotPeriod')?.value||'2026-11';
  const setNotice=(value,tone='neutral')=>{const node=$('ppicStage3Message');node.textContent=value;node.dataset.tone=tone;};
  const stop=()=>{if(timer!==null)win.clearTimeout(timer);timer=null;};
  const schedule=()=>{stop();if(active)timer=win.setTimeout(()=>{if(doc.hidden){schedule();return;}refresh();},180000);};
  const riskBox=(risk)=>{
   const tag=el('span',(risk.severity==='HIGH'?'Penting · ':'Perlu dicek · ')+(risk.code||'Temuan'),'ppic-s3-risk');
   tag.title=bounded(risk.message,380);
   return tag;
  };
  function evidenceBlock(evidence){
   const details=el('details',undefined,'ppic-s3-evidence');
   details.append(el('summary','Lihat sumber & sel rujukan'));
   for(const item of list(evidence)){
    const row=el('div',undefined,'ppic-s3-evidence-row');
    row.append(el('strong',bounded(item.document_id,160)));
    const keys=list(item.fact_keys).map(x=>bounded(x,80)).filter(Boolean);
    row.append(el('small',keys.join(' · '),'ppic-s3-muted'));
    if(item.document_id&&typeof win.ppicRobotOpenSource==='function'){
     const btn=el('button','Buka di Bank Data','ppic-s3-source-link');btn.type='button';
     btn.addEventListener('click',()=>win.ppicRobotOpenSource(item.document_id));
     row.append(btn);
    }
    details.append(row);
   }
   return details;
  }
  function card(d,stale){
   const node=el('article',undefined,'ppic-s3-card');node.dataset.priority=d.priority;
   const head=el('div',undefined,'ppic-s3-card-head');
   head.append(el('span',d.priority,'ppic-s3-priority'),el('span',KIND[d.kind]||d.kind,'ppic-s3-kind'));
   node.append(head,el('h4',bounded(d.title,240)),el('p',bounded(d.recommendation,1500),'ppic-s3-recommendation'));
   const explain=el('div',undefined,'ppic-s3-explain');
   for(const [name,value] of [
    ['Mengapa:',d.reason],['Risiko / konsekuensi:',d.consequence],
    ['Penanggung jawab (usulan):',d.owner_role],['Batas data:',d.data_limit]
   ]) {const p=el('p');p.append(el('strong',name+' '),doc.createTextNode(bounded(value,1500)||'Belum dijelaskan.'));explain.append(p);}
   node.append(explain);
   const footer=el('div',undefined,'ppic-s3-meta');
   footer.append(el('span',GATES[d.gate]||'Menunggu verifikasi','ppic-s3-gate'),
    el('span','Keyakinan '+(CONFIDENCE[d.confidence]||'belum terverifikasi')),
    el('span','USULAN · belum dieksekusi'));
   node.append(footer);
   if(list(d.risks).length){const risks=el('div',undefined,'ppic-s3-risk-row');for(const item of d.risks)risks.append(riskBox(item));node.append(risks);}
   node.append(evidenceBlock(d.evidence));
   const actions=el('div',undefined,'ppic-s3-actions');
   const ask=el('button',stale?'Minta analisis ulang':'Minta analisis lanjutan','btn');
   ask.type='button';
   ask.addEventListener('click',()=>{
    const input=$('ppicAskText'),select=$('ppicAskIntent');
    if(!active||!input||input.disabled||!select)return;
    select.value='ANALYZE';
    input.value=(stale?'Perbarui analisis berdasarkan sumber terbaru untuk: ':'Analisis lebih lanjut dan langkah verifikasi untuk: ')+bounded(d.title,210);
    input.focus();input.scrollIntoView({behavior:'smooth',block:'center'});
    setNotice('Pertanyaan disiapkan di kolom GPT. Periksa lalu tekan Kirim ke GPT.','neutral');
   });
   actions.append(ask);node.append(actions);
   return node;
  }
  function reset(){
   last=null;
   for(const id of ['ppicStage3Focus','ppicStage3Others','ppicStage3RiskList'])$(id).replaceChildren();
   $('ppicStage3Badge').textContent='Belum diperiksa';$('ppicStage3Badge').dataset.tone='neutral';
   $('ppicStage3Time').textContent='Belum ada ringkasan keputusan yang dimuat.';
   $('ppicStage3More').hidden=true;$('ppicStage3More').open=false;
   $('ppicStage3Refresh').disabled=true;
   setNotice('Login Owner untuk membaca usulan keputusan privat.');
  }
  function render(m){
   const badge=$('ppicStage3Badge');
   badge.textContent=!m.ready?'Belum tersedia':!m.evidence_current?'Sumber berubah':m.status==='WAITING_DATA'?'Butuh data':'Siap ditinjau';
   badge.dataset.tone=m.ready&&!m.evidence_current?'alert':m.status==='WAITING_DATA'?'gold':'good';
   if(!m.ready){setNotice('Belum ada analisis keputusan yang cocok untuk periode ini. Pemeriksaan robot terjadwal diperlukan.');return;}
   $('ppicStage3Time').textContent='Dasar analisis GPT: '+dateOnly(m.analysis_as_of)+' · snapshot keputusan: '+instant(m.created_at)+' · '+m.source_count+' divisi.';
   if(!m.evidence_current)setNotice('Sumber atau analisis GPT telah berubah. Usulan lama di bawah hanya untuk histori; tunggu keputusan baru sebelum bertindak.','alert');
   else if(m.status==='WAITING_DATA')setNotice('Robot telah menyusun usulan, tetapi '+m.data_blockers+' keputusan masih memerlukan bukti. Jangan membuat komitmen stok, kas, atau payroll dari angka yang belum tervalidasi.','gold');
   else setNotice('Usulan terbaru bersumber telah siap ditinjau. Tidak ada tindakan operasional yang dieksekusi otomatis.','neutral');
   const byId=new Map(m.cards.map(x=>[x.id,x]));
   const focus=m.focus_ids.map(id=>byId.get(id)).filter(Boolean);
   const remaining=m.cards.filter(x=>!m.focus_ids.includes(x.id));
   $('ppicStage3Focus').replaceChildren(...focus.map(d=>card(d,!m.evidence_current)));
   const others=$('ppicStage3Others');others.replaceChildren(...remaining.map(d=>card(d,!m.evidence_current)));
   $('ppicStage3More').hidden=remaining.length===0;
   $('ppicStage3MoreCount').textContent=remaining.length+' prioritas tambahan';
   const risks=$('ppicStage3RiskList');risks.replaceChildren();
   for(const r of [...m.risks].sort((a,b)=>Number(b.severity==='HIGH')-Number(a.severity==='HIGH')).slice(0,10)){
    const block=el('article',undefined,'ppic-s3-issue');
    block.append(el('strong',(r.severity==='HIGH'?'Penting · ':'Perlu dicek · ')+(r.division||'Divisi')));
    block.append(el('p',bounded(r.message,500),'ppic-s3-muted'));
    if(r.source_cutoff||r.report_cutoff)block.append(el('small','Sumber: '+dateOnly(r.source_cutoff)+' · laporan: '+dateOnly(r.report_cutoff),'ppic-s3-muted'));
    risks.append(block);
   }
  }
  async function refresh(){
   if(!active||loading||typeof win.ppicLoadStage3Status!=='function')return;
   const current=++seq,p=period();loading=true;$('ppicStage3Refresh').disabled=true;
   setNotice('Membaca keputusan manajemen tersimpan…');
   try{
    const result=await win.ppicLoadStage3Status(p);
    if(!active||current!==seq||p!==period())return;
    last=buildModel(result,p);render(last);
   }catch(error){if(active&&current===seq)setNotice('Keputusan terbaru belum terbaca: '+bounded(error?.message,180),'alert');}
   finally{loading=false;$('ppicStage3Refresh').disabled=!active;schedule();}
  }
  win.ppicStage3SessionReady=()=>{active=true;$('ppicStage3Refresh').disabled=false;refresh();};
  win.ppicStage3Clear=()=>{active=false;seq++;stop();loading=false;reset();};
  $('ppicStage3Refresh').addEventListener('click',refresh);
  $('robotPeriod')?.addEventListener('change',()=>{seq++;last=null;if(active)refresh();});
  doc.addEventListener('visibilitychange',()=>{if(!doc.hidden&&active&&!loading)refresh();});
  reset();
 }
 return {buildModel,mount};
});
