const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../auth.js'),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve};};
function environment(handler=async()=>({status:200,body:{ok:true,config:{enabled:false},jobs:[]}})){
 const elements=new Map(),calls=[],receipts=[],errors=[],clear=[];
 const el=id=>{if(!elements.has(id))elements.set(id,{id,hidden:id==='ppicMain',disabled:false,value:id==='ownerEmail'?'cengkehsigaret99@gmail.com':['autoImportPeriod','robotPeriod'].includes(id)?'2026-11':'fake-test-only',textContent:'',handlers:{},addEventListener(name,fn){this.handlers[name]=fn;}});return elements.get(id);};
 const window={addEventListener(){},ppicSetDocs(){},ppicSetReports(){},ppicSetDaily(){},ppicSetDoCustomers(){},ppicSetMaterials(){},ppicSetFinished(){},ppicSetSDM(){},ppicSetAutoImportStatus(data,period){receipts.push({data,period});},ppicAutoImportSessionReady(){},ppicClearAutoImportStatus(){clear.push(true);},ppicAutoImportStatusError(message,options){errors.push({message,options});}};
 let timer=0;
 const fetch=async(url,init={})=>{calls.push({url,init});let result={status:200,body:[]};
  if(url.includes('/auth/v1/token'))result.body={access_token:'PRIVATE_SYNTHETIC_TOKEN',expires_in:3600};
  else if(url.includes('/ppic-owner-check'))result.body={authorized:true,role:'owner'};
  else if(url.includes('/ppic-auto-import-status'))result=await handler(JSON.parse(init.body),init);
  else if(url.includes('/ppic-robot-status'))result.body={ok:true,period:JSON.parse(init.body).period,config:{enabled:false},health:{state:'DISABLED'},latest_brief:null};
  return {ok:result.status>=200&&result.status<300,status:result.status,json:async()=>result.body};
 };
 const context={window,document:{getElementById:el,addEventListener(){},hidden:false},fetch,AbortController,setTimeout(){return ++timer;},clearTimeout(){},Promise,Date,Error,Object,Number,String,console};
 vm.runInNewContext(source,context);
 return {window,el,calls,receipts,errors,clear,login:()=>el('loginForm').handlers.submit({preventDefault(){}}),logout:()=>el('logoutOwner').handlers.click()};
}
test('status API requires verified Owner session and sends the selected period privately',async()=>{
 const e=environment();await assert.rejects(e.window.ppicLoadAutoImportStatus(),/Sesi Owner/);assert.equal(e.calls.length,0);
 await e.login();const req=e.calls.find(c=>c.url.endsWith('/ppic-auto-import-status'));
 assert.equal(req.init.method,'POST');assert.equal(req.init.cache,'no-store');assert.equal(JSON.parse(req.init.body).period,'2026-11');assert.equal(req.init.headers.Authorization,'Bearer PRIVATE_SYNTHETIC_TOKEN');
 assert.equal(e.receipts.length,1);assert.equal(e.el('ppicMain').hidden,false);assert.equal(e.window.accessToken,undefined);
});
test('late response after logout cannot repopulate receipts even if fetch ignores abort',async()=>{
 const d=deferred(),e=environment(()=>d.promise);const login=e.login();await flush();await flush();assert.equal(e.el('ppicMain').hidden,false);
 await e.logout();d.resolve({status:200,body:{ok:true,config:{enabled:true},jobs:[{filename:'PRIVATE_FILENAME.xlsx'}]}});await login;
 assert.equal(e.receipts.length,0);assert.equal(e.el('ppicMain').hidden,true);assert.ok(e.clear.length>=2);await assert.rejects(e.window.ppicLoadAutoImportStatus(),/Sesi Owner/);
});
test('newer period response wins and an older response is rejected',async()=>{
 const d=deferred();const e=environment(p=>p.period==='2026-12'?d.promise:Promise.resolve({status:200,body:{ok:true,config:{enabled:false},jobs:[]}}));
 await e.login();e.el('autoImportPeriod').value='2026-12';const stale=e.window.ppicLoadAutoImportStatus('2026-12').catch(x=>x);
 e.el('autoImportPeriod').value='2027-01';await e.window.ppicLoadAutoImportStatus('2027-01');d.resolve({status:200,body:{ok:true,config:{enabled:false},jobs:[{filename:'STALE.xlsx'}]}});
 assert.equal((await stale).name,'AbortError');assert.deepEqual(e.receipts.map(x=>x.period),['2026-11','2027-01']);
});
test('unconfigured 404 permits legacy SDM policy while a backend failure does not',async()=>{
 for(const status of [404,503]){
  const e=environment(async()=>({status,body:{error:'Synthetic unavailable'}}));await e.login();assert.equal(e.el('ppicMain').hidden,false);assert.equal(e.receipts.length,0);assert.equal(e.errors.at(-1).options.allowLegacy,status===404);
 }
});
test('invalid period cannot trigger an additional API request',async()=>{
 const e=environment();await e.login();const before=e.calls.length;await assert.rejects(e.window.ppicLoadAutoImportStatus('2026-13'),/Periode/);assert.equal(e.calls.length,before);
});
