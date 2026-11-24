/* BAL PPIC readable text sizes. Stores only visual preference on this device. */
(function(global,factory){
  "use strict";
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(global&&global.document)api.mount(global);
})(typeof window==="object"?window:null,function(){
  "use strict";
  const KEY="bal-ppic-reading-size-v1";
  const OPTIONS=Object.freeze({
    normal:{label:"Normal",font:"15,5 piksel"},
    large:{label:"Besar",font:"17 piksel"},
    xlarge:{label:"Sangat besar",font:"19 piksel"}
  });
  function safeMode(x){return Object.prototype.hasOwnProperty.call(OPTIONS,x)?x:"large";}
  function getStored(win){
    try{return safeMode(win.localStorage.getItem(KEY));}
    catch{return "large";}
  }
  function mount(win){
    const doc=win.document,root=doc.documentElement;
    const group=doc.getElementById("ppicReadingControls");
    const state=doc.getElementById("ppicReadingStatus");
    if(!group||!state)return;
    const buttons=Array.from(group.querySelectorAll("button[data-reading-choice]"));
    if(buttons.length!==3||new Set(buttons.map(b=>b.dataset.readingChoice)).size!==3) return;
    function apply(v,persist=true){
      const mode=safeMode(v);
      root.dataset.ppicReading=mode;
      for(const b of buttons){
        b.setAttribute("aria-pressed",String(b.dataset.readingChoice===mode));
        b.setAttribute("title","Ukuran tulisan: "+OPTIONS[b.dataset.readingChoice].label);
      }
      state.textContent="Ukuran tulisan "+OPTIONS[mode].label+" dipilih.";
      if(persist){try{win.localStorage.setItem(KEY,mode);}catch{/* blocked storage is safe */}}
      return mode;
    }
    apply(getStored(win),false);
    group.addEventListener("click",e=>{
      const target=e.target.closest?.("button[data-reading-choice]");
      if(!target||!group.contains(target))return;
      apply(target.dataset.readingChoice);
    });
    win.addEventListener("storage",e=>{
      if(e.key===KEY)apply(safeMode(e.newValue),false);
    });
  }
  return{mount,safeMode,key:KEY};
});
