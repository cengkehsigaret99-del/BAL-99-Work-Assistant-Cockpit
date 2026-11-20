const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../auth.js'),'utf8');
const owner=source.match(/const EMAIL="([^"]+)"/)[1];
const {status}=require('./fixtures/robot-synthetic.cjs');
const flush=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function environment(handler=async p=>({status:200,body:status(p.period)})){
 const elements=new Map(),calls=[],received=[],errors=[],cleared=[];
 const el=id=>{if(!elements.has(id))elements.set(id,{id,hidden:id==='ppicMain',value:id==='ownerEmail'?owner:['robotPeriod','autoImportPeriod'].includes(id)?'2026-11':'SYNTHETIC_PASSWORD',handlers:{},textContent:'',addEventListener(name,fn){this.handlers[name]=fn;}});return elements.get(id);};
 const window={addEventListener(){},ppicSetDocs(){},ppicSetReports(){},ppicSetDaily(){},ppicSetDoCustomers(){},ppicSetMaterials(){},ppicSetFinished(){},ppicSetSDM(){},ppicSetRobotStatus(data,period){received.push({data,period});},ppicClearRobotStatus(){cleared.push(true);},ppicRobotSessionReady(){},ppicRobotStatusError(message,options){errors.push({message,options});}};
 const fetch=async(url,init={})=>{calls.push({url,init});let result={status:200,body:[]};
  if(url.includes('/auth/v1/token'))result.body={access_token:'SYNTHETIC_PRIVATE_OWNER_TOKEN',expires_in:3600};
  else if(url.includes('/ppic-owner-check'))result.body={authorized:true,role:'owner'};
  else if(url.includes('/ppic-robot-status'))result=await handler(JSON.parse(init.body),init);
  else if(url.includes('/ppic-auto-import-status'))result.body={ok:true,config:{enabled:false},jobs:[]};
  return {ok:result.status>=200&&result.status<300,status:result.status,json:async()=>result.body};
 };
 vm.runInNewContext(source,{window,document:{getElementById:el,addEventListener(){},hidden:false},fetch,AbortController,setTimeout(){return 1;},clearTimeout(){},Date,Promise,Error,Object,Number,String,console});
 return {window,el,calls,received,errors,cleared,login:()=>el('loginForm').handlers.submit({preventDefault(){}}),logout:()=>el('logoutOwner').handlers.click()};
}
test('robot reads require Owner session and use POST period with private memory-only no-store token',async()=>{
 const e=environment();await assert.rejects(e.window.ppicLoadRobotStatus(),/Sesi Owner/);assert.equal(e.calls.length,0);await e.login();
 const req=e.calls.find(x=>x.url.endsWith('/ppic-robot-status'));assert.equal(req.init.method,'POST');assert.equal(req.init.cache,'no-store');assert.deepEqual(JSON.parse(req.init.body),{period:'2026-11'});assert.equal(req.init.headers.Authorization,'Bearer SYNTHETIC_PRIVATE_OWNER_TOKEN');assert.equal(e.window.accessToken,undefined);assert.equal(e.received.length,1);
 assert.equal((await e.window.ppicRefreshPrivateData()).modules,9);
});
test('late private response after logout is discarded even when fetch ignores abort',async()=>{
 const d=deferred(),e=environment(()=>d.promise),login=e.login();await flush();await flush();assert.equal(e.el('ppicMain').hidden,false);
 await e.logout();d.resolve({status:200,body:status()});await login;assert.equal(e.received.length,0);assert.equal(e.el('ppicMain').hidden,true);assert.ok(e.cleared.length>=2);await assert.rejects(e.window.ppicLoadRobotStatus(),/Sesi Owner/);
});
test('period changes abort and prevent older response from replacing current analysis',async()=>{
 const d=deferred(),e=environment(p=>p.period==='2026-12'?d.promise:Promise.resolve({status:200,body:status(p.period)}));await e.login();
 e.el('robotPeriod').value='2026-12';const old=e.window.ppicLoadRobotStatus('2026-12').catch(x=>x);
 e.el('robotPeriod').value='2027-01';await e.window.ppicLoadRobotStatus('2027-01');d.resolve({status:200,body:status('2026-12')});
 assert.equal((await old).name,'AbortError');assert.deepEqual(e.received.map(x=>x.period),['2026-11','2027-01']);
 const req=e.calls.filter(x=>x.url.endsWith('/ppic-robot-status'));assert.equal(req[1].init.signal.aborted,true);
});
test('same-period newer request wins over a delayed older request',async()=>{
 let count=0;const d=deferred(),e=environment(p=>++count===2?d.promise:Promise.resolve({status:200,body:status(p.period)}));await e.login();
 const first=e.window.ppicLoadRobotStatus().catch(x=>x);await e.window.ppicLoadRobotStatus();d.resolve({status:200,body:status()});assert.equal((await first).name,'AbortError');assert.equal(e.received.length,2);
});
test('404 status remains unavailable while existing report refresh succeeds',async()=>{
 const e=environment(async()=>({status:404,body:{error:'SYNTHETIC_NOT_CONFIGURED'}}));await e.login();assert.equal(e.el('ppicMain').hidden,false);assert.equal(e.errors.at(-1).options.unconfigured,true);assert.equal(e.received.length,0);assert.equal((await e.window.ppicRefreshPrivateData()).ok,true);
});
test('server failure is visible and wrong-period payload cannot publish into the selected period',async()=>{
 for(const response of [{status:503,body:{error:'SYNTHETIC_FAILED'}},{status:200,body:status('2026-12')}]){
  const e=environment(async()=>response);await e.login();assert.equal(e.el('ppicMain').hidden,false);assert.equal(e.received.length,0);assert.equal(e.errors.length,1);await assert.rejects(e.window.ppicRefreshPrivateData(),/Sebagian data/);
 }
});
test('invalid period cannot trigger a private request',async()=>{
 const e=environment();await e.login();const count=e.calls.length;await assert.rejects(e.window.ppicLoadRobotStatus('2026-13'),/Periode/);assert.equal(e.calls.length,count);
});
