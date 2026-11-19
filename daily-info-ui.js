/* Owner-only daily summary. Reuses the existing authenticated snapshot loaders. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),date=$('infoDate'),paper=$('infoPaper'),status=$('infoStatus'),download=$('infoDownload'),refresh=$('infoRefresh');
 if(!date||!paper||!window.PpicDailyInfoData||!window.PpicDailyInfo)return;
 const empty=()=>({finished:[],materials:[],daily:[],sdm:[]});
 let sources=empty(),model=null,generation=0,pending=false,exporting=false,refreshing=false;
 let session=0,exportOperation=0,refreshOperation=0;
 let decodedCache=new WeakMap();
 const authorized=()=>!$('ppicMain').hidden;
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 date.value=today();date.max=today();
 function clear(){
  generation++;session++;exportOperation++;refreshOperation++;
  sources=empty();model=null;decodedCache=new WeakMap();exporting=false;refreshing=false;
  for(const c of paper.querySelectorAll('canvas')){c.width=1;c.height=1}
  paper.replaceChildren();download.disabled=true;refresh.disabled=false;
  status.textContent='Masuk sebagai Owner untuk melihat Info Harian.';
 }
 window.ppicClearDailyInfo=clear;
 async function decode(snap){
  if(!snap||typeof snap!=='object')return null;
  if(snap.payload?.codec!=='zlib-base64')return snap;
  if(decodedCache.has(snap))return decodedCache.get(snap);
  const task=(async()=>{
   const bytes=Uint8Array.from(atob(snap.payload.data),c=>c.charCodeAt(0));
   const text=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).text();
   return {...snap,payload:JSON.parse(text)};
  })();decodedCache.set(snap,task);return task;
 }
 async function render(){
  const current=++generation;if(!authorized()){clear();return}
  download.disabled=true;model=null;
  for(const c of paper.querySelectorAll('canvas')){c.width=1;c.height=1}
  paper.replaceChildren();status.textContent='Menyiapkan ringkasan dari data terbaru…';
  const asOf=date.value,period=asOf.slice(0,7),input={asOf,daily:sources.daily},failures=[];
  try{
   if(!asOf||asOf>today())throw Error('Pilih tanggal sampai hari ini.');
   await Promise.all(['finished','materials','sdm'].map(async key=>{
    const snap=window.PpicDailyInfoData.latestSnapshot(sources[key],period);
    try{input[key]=snap?[await decode(snap)]:[]}catch(_){input[key]=[];failures.push(key)}
   }));
   if(current!==generation||!authorized())return;
   const next=window.PpicDailyInfoData.build(input);
   window.PpicDailyInfo.mount(paper,next);model=next;download.disabled=!next.hasData||exporting||refreshing;
   status.textContent=failures.length?'Sebagian sumber belum dapat dibaca. Muat ulang untuk mencoba kembali.':next.hasData?'Siap diunduh sebagai satu JPG. Tanggal data tercantum di setiap bagian.':'Belum ada angka bersumber untuk periode yang dipilih.';
  }catch(error){
   if(current!==generation||!authorized())return;
   status.textContent='Ringkasan belum tersedia: '+(error?.message||String(error));
  }
 }
 function schedule(){
  // Invalidate any in-flight JPEG immediately, before the next render microtask.
  generation++;download.disabled=true;
  if(pending)return;pending=true;
  queueMicrotask(()=>{pending=false;render()});
 }
 for(const [name,key] of [['ppicSetFinished','finished'],['ppicSetMaterials','materials'],['ppicSetDaily','daily'],['ppicSetSDM','sdm']]){
  const original=window[name];
  window[name]=function(rows){
   const result=original.apply(this,arguments);
   if(!authorized()){clear();return result}
   sources[key]=Array.isArray(rows)?rows:[];schedule();return result;
  };
 }
 date.addEventListener('change',schedule);
 $('infoLatest').addEventListener('click',()=>{date.max=today();date.value=today();schedule()});
 refresh.addEventListener('click',async()=>{
  if(!authorized()||refreshing)return;
  const currentSession=session,operation=++refreshOperation,isCurrent=()=>authorized()&&session===currentSession&&operation===refreshOperation;
  refreshing=true;refresh.disabled=true;download.disabled=true;generation++;
  status.textContent='Memuat ulang data operasional…';
  try{await window.ppicRefreshPrivateData();if(isCurrent())await render()}
  catch(error){if(isCurrent())status.textContent='Pembaruan belum lengkap: '+(error?.message||String(error))}
  finally{if(isCurrent()){refreshing=false;refresh.disabled=false;download.disabled=!model?.hasData||exporting}}
 });
 download.addEventListener('click',async()=>{
  if(!authorized()||!model?.hasData||exporting||refreshing)return;
  const current=generation,selected=model,currentSession=session,operation=++exportOperation;
  const isCurrent=()=>authorized()&&session===currentSession&&operation===exportOperation;
  exporting=true;download.disabled=true;
  status.textContent='Membuat satu file JPG…';
  try{
   const file=await window.PpicDailyInfo.exportJpeg(selected,{isCurrent:()=>isCurrent()&&current===generation&&model===selected});
   if(isCurrent()&&current===generation)status.textContent='JPG siap: '+file.filename;
  }catch(error){if(isCurrent()&&current===generation)status.textContent=error?.name==='AbortError'?'Data berubah. Unduh kembali ringkasan terbaru.':'JPG belum berhasil dibuat: '+(error?.message||String(error))}
  finally{if(isCurrent()){exporting=false;download.disabled=!model?.hasData||refreshing}}
 });
 clear();
})();
