const {test,expect}=require('@playwright/test');
const {status}=require('./fixtures/robot-synthetic.cjs');
const ROOT=process.env.PPIC_TEST_BASE_URL||'http://127.0.0.1:8765/';
const API='https://jryfozndxpjymggevkgq.supabase.co';
const health=(good=true)=>({ok:true,period:'2026-11',ready:true,configured:true,latest:{
 schema_version:'ppic-do-auto-sync-v1',status:good?'SYNCED_WORKING':'INTEGRITY_CHECK_FAILED',
 source_version:'V012',report_version:'V015',cutoff:'2026-11-21',published_at:'2026-11-21T11:49:35.736Z',
 total_sj:24,total_lines:37,total_pack:621995,total_nominal:4474760000,
 last_sj:334,last_sj_lines:1,bj_source_cutoff:'2026-11-18',bj_book_delivery_pack:617995,
 cross_division_state:'CUTOFF_DIFFERENT',official_books_changed:false,is_latest:good,
 checks:['SOURCE_REGISTERED','FACTS_MATCH','FULL_DO_LINES','DAILY_DO_TOTALS','REPORT_DO_09'].map((code,i)=>({code,pass:good||i!==3})),
 pending:[{code:'BJ_QC_AND_CUTOFF',owner_role:'Admin Barang Jadi / QC',description:'Cocokkan SJ334 dengan BJ dan QC.'},
 {code:'KAS_INVOICE',owner_role:'Admin Kas Bank',description:'Verifikasi invoice dan pembayaran pelanggan.'}]
 }});
async function login(page,{good=true}={}){
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route(API+'/**',async route=>{
  const req=route.request(),url=req.url();
  let data={};
  if(url.includes('/auth/v1/token'))data={access_token:'TEST_OWNER_TOKEN',expires_in:3600};
  else if(url.includes('/ppic-owner-check'))data={authorized:true,role:'owner'};
  else if(url.includes('/ppic-robot-status'))data=status('2026-11');
  else if(url.includes('/ppic-do-sync-health'))data=health(good);
  else if(url.includes('/ppic-stage2-status')||url.includes('/ppic-stage3-status')||
    url.includes('/ppic-skt-watch-status')||url.includes('/ppic-plan-status'))
    data={ok:true,period:'2026-11',ready:false,latest:null};
  else if(url.includes('/ppic-auto-import-status'))data={ok:true,period:'2026-11',config:{enabled:false},jobs:[]};
  else if(url.includes('/ppic-owner-assistant'))data={ok:true,period:'2026-11',live_gpt_configured:true,questions:[]};
  else if(url.includes('/auth/v1/logout'))data={};
  else data=[];
  try{await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});}
  catch(e){if(!page.isClosed()&&!/closed|handled|canceled|Invalid InterceptionId/i.test(e.message))throw e;}
 });
 await page.goto(ROOT);
 await expect(page.locator('#ppicMain')).toBeHidden();
 await page.locator('#ownerPassword').fill('SYNTHETIC_PASSWORD');
 await page.locator('#loginButton').click();
 await expect(page.locator('#ppicMain')).toBeVisible();
 await expect(page.locator('#ppicDOAutoMetrics .ppic-do-auto-metric')).toHaveCount(4);
 return errors;
}
test('Valid Owner sees full DO V015 working sync and separate BJ cutoff warning',async({page})=>{
 const errors=await login(page);
 await expect(page.locator('#ppicDOAutoBadge')).toHaveText('Sinkron · WORKING');
 await expect(page.locator('#ppicDOAutoTime')).toContainText('web V015');
 await expect(page.locator('#ppicDOAutoMetrics')).toContainText('621.995');
 await expect(page.locator('#ppicDOAutoMetrics')).toContainText('4.474.760.000');
 await expect(page.locator('#ppicDOAutoMetrics')).toContainText('SJ334');
 await page.locator('#ppicDOAutoPanel summary').first().click();
 await expect(page.locator('#ppicDOAutoChecks .ppic-do-auto-check')).toHaveCount(5);
 await expect(page.locator('#ppicDOAutoChecks')).toContainText('Cocok');
 await page.locator('#ppicDOAutoPanel summary').last().click();
 await expect(page.locator('#ppicDOAutoPending')).toContainText('tanggal sumber yang berbeda');
 await expect(page.locator('#ppicDOAutoPending')).toContainText('18 Nov 2026');
 await expect(page.locator('#ppicDOAutoPanel')).toContainText('bukan memposting ulang');
 await page.locator('#logoutOwner').click();
 await expect(page.locator('#ppicMain')).toBeHidden();
 await expect(page.locator('#ppicDOAutoMetrics')).toBeEmpty();
 expect(errors).toEqual([]);
});
test('Unverified report health cannot display synced; mobile stays readable',async({page})=>{
 await page.setViewportSize({width:375,height:812});
 const errors=await login(page,{good:false});
 await expect(page.locator('#ppicDOAutoBadge')).toHaveText('Perlu pemeriksaan');
 await expect(page.locator('#ppicDOAutoStatus')).toContainText('Pemeriksaan integritas tidak lulus');
 await expect(page.locator('#ppicDOAutoMetrics .ppic-do-auto-metric')).toHaveCount(4);
 expect(errors).toEqual([]);
});
