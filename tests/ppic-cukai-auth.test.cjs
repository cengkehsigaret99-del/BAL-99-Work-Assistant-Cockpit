const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('auth.js','utf8'),owner=source.match(/const EMAIL="([^"]+)"/)[1],flush=()=>new Promise(r=>setImmediate(r));
function deferred(){let resolve;return {promise:new Promise(r=>resolve=r),resolve:(x)=>resolve(x)};}
function env(handler=async()=>({ok:true,ready:false,period:'2026-11'})){
 const elements=new Map(),calls=[];let tokenNo=0;
 const el=id=>{if(!elements.has(id))elements.set(id,{hidden:id==='ppicMain',value:id==='ownerEmail'?owner:['robotPeriod','autoImportPeriod'].includes(id)?'2026-11':'SYNTHETIC',handlers:{},textContent:'',addEventListener(n,f){this.handlers[n]=f;}});return elements.get(id)};
 const window={addEventListener(){},ppicSetDocs(){},ppicSetReports(){},ppicSetDaily(){},ppicSetDoCustomers(){},ppicSetMaterials(){},ppicSetFinished(){},ppicSetSDM(){}};
 const fetch=async(url,init={})=>{calls.push({url,init});let body=[],status=200;
  if(url.includes('/auth/v1/token'))body={access_token:'SYNTHETIC_'+ ++tokenNo,expires_in:3600};
  else if(url.includes('/ppic-owner-check'))body={authorized:true,role:'owner'};
  else if(url.endsWith('/rpc/ppic_cukai_source')){const r=await handler(JSON.parse(init.body),init);body=r.body??r;status=r.status??200;}
  else if(url.includes('/ppic-robot-status'))body={ok:true,period:'2026-11'};
  else if(url.includes('/ppic-auto-import-status'))body={ok:true};
  return {ok:status>=200&&status<300,status,json:async()=>body};
 };
 vm.runInNewContext(source,{window,document:{getElementById:el,addEventListener(){},hidden:false},fetch,AbortController,setTimeout:()=>1,clearTimeout(){},Date,Promise,Error,Object,Number,String,Map,console});
 return {window,el,calls,login:()=>el('loginForm').handlers.submit({preventDefault(){}}),logout:()=>el('logoutOwner').handlers.click()};
}
test('Cukai RPC uses existing Owner JWT and no user-supplied owner argument',async()=>{
 const e=env();await assert.rejects(e.window.ppicLoadCukaiSource('2026-11'),/Sesi/);await e.login();await e.window.ppicLoadCukaiSource('2026-11');
 const r=e.calls.find(x=>x.url.endsWith('/rpc/ppic_cukai_source'));assert.deepEqual(JSON.parse(r.init.body),{p_period:'2026-11'});assert.equal(r.init.cache,'no-store');assert.equal(r.init.headers.Authorization,'Bearer SYNTHETIC_1');assert.equal(e.window.accessToken,undefined);
});
test('late source response after logout and new login cannot repopulate old session',async()=>{
 const d=deferred(),e=env(()=>d.promise);await e.login();const old=e.window.ppicLoadCukaiSource('2026-11').catch(x=>x);await flush();await e.logout();await e.login();d.resolve({ok:true,ready:false,period:'2026-11'});assert.equal((await old).name,'AbortError');assert.equal(e.el('ppicMain').hidden,false);
});
test('a later same-period request wins while other periods stay independent',async()=>{
 const d=deferred();let n=0;const e=env(p=>p.p_period==='2026-11'&&++n===1?d.promise:{ok:true,ready:false,period:p.p_period});await e.login();const old=e.window.ppicLoadCukaiSource('2026-11').catch(x=>x);await e.window.ppicLoadCukaiSource('2026-12');await e.window.ppicLoadCukaiSource('2026-11');d.resolve({ok:true,ready:false,period:'2026-11'});assert.equal((await old).name,'AbortError');
});
test('authorization failure closes session; transient error leaves session usable',async()=>{
 const e=env(()=>({status:503,body:{ok:false}}));await e.login();await assert.rejects(e.window.ppicLoadCukaiSource('2026-11'),/503/);assert.equal(e.el('ppicMain').hidden,false);
 const denied=env(()=>({status:403,body:{ok:false}}));await denied.login();await assert.rejects(denied.window.ppicLoadCukaiSource('2026-11'),/berakhir/);assert.equal(denied.el('ppicMain').hidden,true);
});
