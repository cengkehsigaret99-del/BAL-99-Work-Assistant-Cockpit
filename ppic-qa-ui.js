"use strict";
(function(){
 const $=id=>document.getElementById(id),box=$("ppicAskConsole");
 if(!box)return;
 let active=false,busy=false,loading=false,timer=null,seq=0,period="";
 const label={ASK:"Pertanyaan",ANALYZE:"Analisis operasional",SYNC_CHECK:"Periksa sinkron"};
 const stateName={QUEUED:"Menunggu GPT",ANSWERED:"Dijawab",BLOCKED:"Perlu tindak lanjut"};
 const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const setStatus=(message,tone="neutral")=>{const n=$("ppicAskStatus");n.textContent=message;n.dataset.tone=tone;};
 const periodNow=()=>$("robotPeriod")?.value||"2026-11";
 const stop=()=>{if(timer!==null)clearTimeout(timer);timer=null;};
 const schedule=()=>{stop();if(active)timer=setTimeout(()=>{if(document.hidden){schedule();return;}refresh();},45000);};
 const render=(items,enabled)=>{
  const list=$("ppicAskHistory");list.replaceChildren();
  if(!Array.isArray(items)||!items.length){list.append(make("p","Belum ada pertanyaan pada periode ini.","ppic-qa-muted"));return;}
  for(const item of items.slice(0,10)){
   const article=make("article",undefined,"ppic-qa-entry");
   const head=make("div",undefined,"ppic-qa-entry-top");
   head.append(make("strong",label[item.intent]||"Pertanyaan"),make("span",stateName[item.state]||"Menunggu GPT","ppic-qa-pill"));
   article.append(head,make("p",item.question||"Pertanyaan tidak tersedia","ppic-qa-question"));
   if(item.state==="ANSWERED"&&item.answer){
    article.append(make("div",item.answer,"ppic-qa-answer"));
    if(Array.isArray(item.source_refs)&&item.source_refs.length){
     const details=make("details",undefined,"ppic-qa-evidence");
     details.append(make("summary","Bukti sumber"));
     for(const ref of item.source_refs.slice(0,10)){
      const row=make("p",(ref.document_id||"Sumber tak diketahui")+(Array.isArray(ref.fact_keys)&&ref.fact_keys.length?" · "+ref.fact_keys.join(", "):""),"ppic-qa-muted");
      details.append(row);
     }article.append(details);
    }
   }else article.append(make("p","Permintaan tersimpan. Robot GPT akan memprosesnya sesuai sumber dan kewenangan yang tersedia.","ppic-qa-muted"));
   article.append(make("small",(item.created_at?new Date(item.created_at).toLocaleString("id-ID",{timeZone:"Asia/Jakarta",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})+" WIB":"")+(item.backend==="OPENAI_API"?" · GPT langsung":item.backend==="GPT_AUTOMATION"?" · Robot GPT terjadwal":""),"ppic-qa-meta"));
   list.append(article);
  }
 };
 async function refresh(){
  if(!active||loading||busy||typeof window.ppicAssistantTransport!=="function")return;
  const current=++seq,p=periodNow();period=p;loading=true;
  try{
   const data=await window.ppicAssistantTransport({mode:"list",period:p});
   if(!active||current!==seq||periodNow()!==p)return;
   render(data.questions,data.live_gpt_configured);
   $("ppicAskMode").textContent=data.live_gpt_configured?"GPT langsung tersedia untuk pertanyaan":"Mode antrean GPT · jawaban langsung menunggu koneksi API aman";
   if(!data.live_gpt_configured)setStatus("Pertanyaan akan diteruskan ke robot GPT terjadwal. Kunci API baru belum diaktifkan pada Supabase.","neutral");
  }catch(e){if(active&&current===seq)setStatus("Riwayat pertanyaan belum dapat diperiksa: "+String(e.message||"Koneksi gagal").slice(0,170),"alert");}
  finally{loading=false;schedule();}
 }
 $("ppicAskForm").addEventListener("submit",async event=>{
  event.preventDefault();if(!active||busy)return;
  const question=$("ppicAskText").value.trim(),intent=$("ppicAskIntent").value,p=periodNow();
  if(question.length<3||question.length>800){setStatus("Pertanyaan harus 3–800 karakter.","alert");return;}
  if(!["ASK","ANALYZE","SYNC_CHECK"].includes(intent)){setStatus("Jenis permintaan tidak valid.","alert");return;}
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(p)){setStatus("Periode tidak valid.","alert");return;}
  busy=true;$("ppicAskSend").disabled=true;stop();setStatus("Mencatat permintaan dan memeriksa apakah GPT langsung tersedia…");
  try{
   const data=await window.ppicAssistantTransport({mode:"submit",period:p,intent,question,request_id:crypto.randomUUID()});
   if(!active)return;
   $("ppicAskText").value="";
   if(data.state==="ANSWERED")setStatus("Jawaban GPT berhasil disimpan. Lihat riwayat di bawah.","good");
   else setStatus(data.notice||"Permintaan tersimpan dan menunggu pemeriksaan GPT.","neutral");
  }catch(e){if(active)setStatus("Permintaan belum tersimpan: "+String(e.message||"Koneksi gagal").slice(0,180),"alert");}
  finally{busy=false;$("ppicAskSend").disabled=!active;if(active)refresh();}
 });
 $("robotPeriod")?.addEventListener("change",()=>{seq++;period=periodNow();$("ppicAskHistory").replaceChildren();if(active)refresh();});
 window.ppicAssistantSessionReady=()=>{active=true;period=periodNow();$("ppicAskText").disabled=false;$("ppicAskIntent").disabled=false;$("ppicAskSend").disabled=false;refresh();};
 window.ppicAssistantClear=()=>{active=false;seq++;stop();loading=false;busy=false;$("ppicAskText").value="";$("ppicAskText").disabled=true;$("ppicAskIntent").disabled=true;$("ppicAskSend").disabled=true;$("ppicAskHistory").replaceChildren();$("ppicAskMode").textContent="Login Owner untuk mengaktifkan asisten";setStatus("Percakapan hanya ditampilkan kepada Owner yang terverifikasi.");};
 window.ppicAssistantClear();
})();
