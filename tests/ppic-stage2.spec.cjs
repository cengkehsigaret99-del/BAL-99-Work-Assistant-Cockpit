const {test,expect}=require('@playwright/test');
const {status}=require('./fixtures/robot-synthetic.cjs');
const ROOT='http://127.0.0.1:8765/';
const API='https://jryfozndxpjymggevkgq.supabase.co';
const period='2026-11';
function stage2(){
 return {ok:true,period,ready:true,latest:{
  id:'11111111-1111-4111-8111-111111111111',schema_version:'ppic-stage2-review-v1',
  status:'BLOCKED',source_count:10,archived_source_count:7,created_at:'2026-11-21T00:10:00Z',evidence_hash:'a'.repeat(64),
  coverage:[{division:'GILING',source_cutoff:'2026-11-20',report_cutoff:'2026-11-17',report_status:'OPEN RECON'}],
  checks:[
   {code:'BJ_BOOK_MUTATION',state:'PASS',division:'BARANG JADI',message:'Buku sesuai tetapi fisik belum dihitung',reported:338125,computed:338125,unit:'pack'},
   {code:'GILING_VERPACK_BJ_HANDOVER',state:'NOT_COMPARABLE',division:'GILING / VERPACK / BARANG JADI',message:'Butuh serah-terima per SKU dan QC'}],
  warnings:[{severity:'HIGH',division:'SDM GILING',code:'METADATA_CONFLICT',message:'Tanggal sumber belum cocok',source_cutoff:'2026-11-20',report_cutoff:'2026-11-19'}],
  indicators:{'BARANG JADI':[{
   key:'book_closing_pack',label:'Saldo akhir buku',value:338125,quality:'SOURCE',unit:'pack',document_id:'SYNTHETIC_BJ',source_sheet:'UJI',source_range:'C4'
  }]}
 }};
}
async function mockLogin(page,{stage2Enabled=true}={}){
 const errs=[];page.on('pageerror',e=>errs.push(e.message));
 await page.route(API+'/**',async route=>{
  const url=route.request().url(),method=route.request().method();
  let body={},code=200;
  if(method==='OPTIONS'){body={ok:true};}
  else if(url.includes('/auth/v1/token'))body={access_token:'SYNTHETIC_OWNER_TOKEN',expires_in:3600};
  else if(url.includes('/ppic-owner-check'))body={authorized:true,role:'owner'};
  else if(url.includes('/ppic-stage2-status')){if(stage2Enabled)body=stage2();else{code=503;body={ok:false,error:'Belum tersedia'};}}
  else if(url.includes('/ppic-robot-status'))body=status('2026-11');
  else if(url.includes('/ppic-auto-import-status'))body={ok:true,config:{enabled:false},jobs:[]};
  else if(url.includes('/ppic-owner-assistant'))body={ok:true,period,questions:[],live_gpt_configured:false};
  else if(url.includes('/auth/v1/logout'))body={};
  else if(url.includes('/rest/v1/'))body=[];
  try{await route.fulfill({status:code,contentType:'application/json',body:JSON.stringify(body)});}catch(e){}
 });
 await page.goto(ROOT);
 await expect(page.locator('#ppicMain')).toBeHidden();
 await page.locator('#ownerPassword').fill('SYNTHETIC_PASSWORD');
 await page.locator('#loginButton').click();
 await expect(page.locator('#ppicMain')).toBeVisible();
 return errs;
}
test('Stage2 dashboard shows verified book results and blockers after Owner login',async({page})=>{
 const errors=await mockLogin(page);
 await expect(page.locator('#ppicStage2Panel')).toBeVisible();
 await expect(page.locator('#ppicStage2Badge')).toHaveText('Perlu rekonsiliasi');
 await expect(page.locator('#ppicStage2Metrics')).toContainText('10');
 await expect(page.locator('#ppicStage2Checks')).toContainText('338.125 pack');
 await expect(page.locator('#ppicStage2Checks')).toContainText('Belum bisa dibandingkan');
 await page.locator('#ppicStage2Panel details').nth(1).locator('summary').click();
 await expect(page.locator('#ppicStage2Warnings')).toContainText('SDM GILING');
 await expect(page.locator('#ppicStage2Checks')).not.toContainText('stok fisik siap kirim');
 expect(errors).toEqual([]);
});
test('No Owner login means no private reconciliation visible',async({page})=>{
 await page.goto(ROOT);
 await expect(page.locator('#ppicMain')).toBeHidden();
 await expect(page.locator('#ppicStage2Panel')).toBeHidden();
});
test('Stage2 backend error does not fabricate a successful reconciliation',async({page})=>{
 await mockLogin(page,{stage2Enabled:false});
 await expect(page.locator('#ppicStage2Message')).toContainText('belum dapat dibaca');
 await expect(page.locator('#ppicStage2Badge')).not.toHaveText('Open recon');
});
test('Mobile PPIC reconciliation cards remain within viewport width',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await mockLogin(page);
 await expect(page.locator('#ppicStage2Panel')).toBeVisible();
 const outer=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
 expect(outer.scroll).toBeLessThanOrEqual(outer.client+2);
});
