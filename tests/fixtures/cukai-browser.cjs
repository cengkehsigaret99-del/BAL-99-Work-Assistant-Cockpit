const {expect}=require('@playwright/test');
const {snapshot}=require('./cukai-synthetic.cjs');
const API='https://jryfozndxpjymggevkgq.supabase.co';

// Synthetic browser contract: no fiscal conversion master or verified physical count.
function browserSnapshot(revision=1,change=0){
 const value=snapshot(revision,change);
 value.hjes.push({id:'UJI-REFILL',hje:10500,label:'Refill Uji',opening:80,purchases:0,usage:10,closing:70,factory:null,unconfirmed:null,openingValue:null,purchaseValue:null,usageValue:null,closingValue:null,cukaiPerPiece:null});
 value.daily_usage.push({date:'2026-11-03',hje:10500,source_hje_id:'UJI-REFILL',quantity:10});
 return value;
}
async function loginCukai(page,{source=browserSnapshot(),reports,daily}={}){
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const state={source,status:200,hits:0};
 const oldReports=reports||[{report_key:'05',period:'2026-11',version:'V999',cutoff:'2026-11-25',status:'OPEN RECON',payload:{notice:'LEGACY MUST NOT REPLACE CANONICAL',tables:[]}}];
 const oldDaily=daily||[{period:'2026-11',division:'CUKAI 10.325',version:'V999',status:'OPEN RECON',payload:{opening_qty:88888,tariff:999,valid_through:'2026-11-25',cols:['day','in_qty','out_qty'],entries:[]}}];
 await page.route(API+'/**',async route=>{
  const request=route.request(),url=request.url();let data=[],status=200;
  if(url.includes('/auth/v1/token'))data={access_token:'SYNTHETIC_OWNER_TOKEN',expires_in:3600};
  else if(url.includes('/functions/v1/ppic-owner-check'))data={authorized:true,role:'owner'};
  else if(url.includes('/functions/v1/ppic-robot-status'))data={ok:true,period:'2026-11',config:{enabled:false},health:{state:'DISABLED'},latest_brief:null,coverage:[],evidence_sources:[],runs:[]};
  else if(url.includes('/rest/v1/rpc/ppic_cukai_source')){
   state.hits++;const period=request.postDataJSON().p_period;
   data=period===state.source.period?state.source:{ok:true,ready:false,period};status=state.status;
  }
  else if(url.includes('/rest/v1/ppic_reports_owner_view'))data=oldReports;
  else if(url.includes('/rest/v1/ppic_daily_owner_view'))data=oldDaily;
  else if(url.includes('/auth/v1/logout'))data={};
  return route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('http://127.0.0.1:8765/');
 await expect(page.locator('#ppicMain')).toBeHidden();
 await expect(page.locator('#cukaiSourceTables')).toBeEmpty();
 await page.locator('#ownerPassword').fill('synthetic-password');
 await page.locator('#loginButton').click();
 await expect(page.locator('#ppicMain')).toBeVisible();
 if(await page.locator('#ppicDivisionsList').isHidden())await page.locator('#ppicDivisionsToggle').click();
 await page.locator('[data-view="excise"]').click();
 await expect(page.locator('#cukaiSourcePanel')).toBeVisible();
 await expect(page.locator('#cukaiSourceStatus')).toContainText('Sinkron dengan Robot Cukai');
 await expect(page.locator('#cukaiSourceTables tbody tr')).toHaveCount(source.hjes.length);
 return {state,errors};
}
module.exports={browserSnapshot,loginCukai};
