const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const {snapshot}=require('./fixtures/cukai-synthetic.cjs');
const flush=()=>new Promise(r=>setImmediate(r));
const defer=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:x=>resolve(x)}};
async function until(fn){for(let i=0;i<80;i++){if(fn())return;await flush()}assert.ok(fn(),'condition not reached')}
function environment(){
 const html=fs.readFileSync('index.html','utf8'),vc=new VirtualConsole(),errors=[];
 vc.on('jsdomError',e=>{if(!/Not implemented:|Could not parse CSS/.test(e.message))errors.push(e.message)});
 const legacyGate=defer(),state={data:snapshot(),status:200,canonicalGate:null,daily:[],reports:[],apiHits:0};
 const readyHTML=html.replace(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g,(tag,src)=>{
  const code=fs.readFileSync(path.resolve(src),'utf8').replaceAll('</script>','<\\/script>');
  const capture=src==='cukai-sync.js'?`<script>(function(){const d=window.ppicSetDaily,r=window.ppicSetReports;window.ppicSetDaily=rows=>{window.__qaState.daily=rows;return d(rows)};window.ppicSetReports=rows=>{window.__qaState.reports=rows;return r(rows)};})();</script>`:'';
  return capture+'<script>'+code+'\n//# sourceURL='+src+'\n</script>';
 });
 const dom=new JSDOM(readyHTML,{url:'http://127.0.0.1:8912/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  Object.assign(w,{Response,Request,Headers,TextEncoder,TextDecoder,DecompressionStream,AbortController,__qaState:state});
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.HTMLElement.prototype.scrollIntoView=function(){};
  const originalTimeout=w.setTimeout.bind(w);state.minuteTicks=[];w.setTimeout=(fn,ms,...args)=>{if(ms===60000){state.minuteTicks.push(fn);return 987654;}return originalTimeout(fn,ms,...args);};
  w.fetch=async(url,init={})=>{
   let body=[],status=200;
   if(url.includes('/auth/v1/token'))body={access_token:'SYNTHETIC_OWNER',expires_in:3600};
   else if(url.includes('/ppic-owner-check'))body={authorized:true,role:'owner'};
   else if(url.includes('/rpc/ppic_cukai_source')){state.apiHits++;if(state.canonicalGate)await state.canonicalGate.promise;body=state.data;status=state.status;}
   else if(url.includes('/rest/v1/ppic_daily_owner_view')){await legacyGate.promise;body=[{period:'2026-11',division:'CUKAI LEGACY',version:'V999',payload:{book_closing:99999}},{period:'2026-11',division:'GILING',version:'V001',status:'OPEN RECON',unit:'batang',payload:{cols:['day','in_qty','out_qty'],opening_qty:0,entries:[[1,12,0]],valid_through:'2026-11-01'}}];}
   else if(url.includes('/rest/v1/ppic_reports_owner_view')){await legacyGate.promise;body=[{report_key:'05',period:'2026-11',version:'V999',cutoff:'2026-11-25',payload:{notice:'LEGACY SHOULD NOT WIN',tables:[]}}];}
   else if(url.includes('/functions/v1/')){body={ok:false};status=404;}
   return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
  };
 }}),w=dom.window;
 const el=id=>w.document.getElementById(id);
 const login=async()=>{el('ownerPassword').value='SYNTHETIC';el('loginForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await until(()=>!el('ppicMain').hidden&&state.apiHits>0);await flush();await flush()};
 const release=()=>legacyGate.resolve();
 const logout=()=>el('logoutOwner').click();
 return {w,el,state,errors,login,release,logout,close:()=>w.close()};
}
test('DOM startup race preserves canonical summary/report/Info Harian when legacy calls finish late',async()=>{
 const e=environment();try{await e.login();await until(()=>e.el('cukaiSourceStatus').textContent.includes('Sinkron'));e.release();await until(()=>e.state.daily.some(x=>x.division==='GILING'));
 assert.ok(!e.state.daily.some(x=>x.division==='CUKAI LEGACY'));assert.equal(e.state.daily.filter(x=>x.division.startsWith('CUKAI')).length,2);
 assert.equal(e.state.reports.find(x=>x.report_key==='05').payload.provenance.source_revision,1);
 assert.ok(e.el('cukaiSourceMetrics').textContent.includes('1.390'));assert.ok(e.el('cukaiSourceTables').textContent.includes('Pita Uji B'));
 assert.equal(e.el('cukaiSourcePrint').disabled,false);assert.deepEqual(e.errors,[]);
 }finally{e.close()}
});
function stateTicks(e){const ticks=e.state.minuteTicks.splice(0);assert.ok(ticks.length>0,'automatic poll registered');return ticks;}
test('DOM refresh updates source automatically, transient failure preserves values, print stays pinned',async()=>{
 const e=environment();try{e.release();await e.login();await until(()=>e.el('cukaiSourcePrint').disabled===false);
 e.el('cukaiSourcePrint').click();const printed=e.el('previewFrame').srcdoc;assert.ok(printed.includes('revisi 1'));
 e.state.data=snapshot(2,50);const ticks=stateTicks(e);ticks.forEach(fn=>fn());await until(()=>e.el('cukaiSourceMeta').textContent.includes('revisi 2'));assert.ok(e.state.apiHits>=2);
 assert.ok(e.el('cukaiSourceMetrics').textContent.includes('1.340'));assert.equal(e.el('previewFrame').srcdoc,printed);
 e.state.status=503;await e.w.ppicRefreshCukaiSource();assert.ok(e.el('cukaiSourceStatus').textContent.includes('tertunda'));assert.ok(e.el('cukaiSourceMetrics').textContent.includes('1.340'));
 e.state.status=200;e.state.data=snapshot();await e.w.ppicRefreshCukaiSource();assert.ok(e.el('cukaiSourceStatus').textContent.includes('Revisi lama'));assert.ok(e.el('cukaiSourceMeta').textContent.includes('revisi 2'));
 }finally{e.close()}
});
test('DOM logout clears all source data and pending response cannot restore it',async()=>{
 const e=environment();try{e.release();await e.login();await until(()=>e.el('cukaiSourcePrint').disabled===false);
 e.state.canonicalGate=defer();e.state.data=snapshot(2,70);const pending=e.w.ppicRefreshCukaiSource();await flush();e.logout();e.state.canonicalGate.resolve();await pending;
 assert.equal(e.el('ppicMain').hidden,true);assert.equal(e.el('cukaiSourceMetrics').textContent,'');assert.equal(e.el('cukaiSourceTables').textContent,'');assert.equal(e.el('cukaiSourcePrint').disabled,true);assert.equal(e.state.daily.length,0);assert.equal(e.state.reports.length,0);
 }finally{e.close()}
});
