const {test,expect}=require('@playwright/test');
const ROOT='http://127.0.0.1:8765/';
const API='https://jryfozndxpjymggevkgq.supabase.co';
const views=['ppic_source_catalog','ppic_reports_owner_view','ppic_daily_owner_view','ppic_do_customer_owner_view','ppic_material_daily_owner_view','ppic_finished_goods_owner_view','ppic_sdm_weekly_owner_view'];

async function setup(page){
 const state={revision:1,failCustomer:false,hits:Object.fromEntries(views.map(x=>[x,0]))};
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(API+'/**',route=>{
  const url=route.request().url();let body=[];
  if(url.includes('/auth/v1/token'))body={access_token:'synthetic-owner-token',expires_in:3600};
  else if(url.includes('/functions/v1/ppic-owner-check'))body={authorized:true,role:'owner'};
  else if(url.includes('/functions/v1/ppic-robot-status'))body={ok:true,period:'2026-11',config:{enabled:false},health:{state:'DISABLED'},latest_brief:null,coverage:[],evidence_sources:[],runs:[]};
  else if(url.includes('/functions/v1/ppic-auto-import-status'))body={ok:true,config:{enabled:false,cadence:'HOURLY',timezone:'Asia/Jakarta',automation_id:null},jobs:[]};
  else if(url.includes('/auth/v1/logout'))body={};
  else{
   const key=views.find(x=>url.includes('/rest/v1/'+x+'?'));
   if(key)state.hits[key]++;
   if(key==='ppic_do_customer_owner_view'){
    if(state.failCustomer)return route.fulfill({status:500,contentType:'application/json',body:'{"message":"synthetic failure"}'});
    const latest=state.revision===2;
    body=[{period:'2026-11',version:latest?'V014':'V012',cutoff:latest?'2026-11-18':'2026-11-17',status:'WORKING / OPEN RECON',source_document_id:'SYNTHETIC-DO-'+state.revision,
     rows:[{sj:901,date:latest?'2026-11-18':'2026-11-17',customer:'PELANGGAN UJI',destination:'AREA UJI',area:'AREA UJI',sku:'UJI-012',brand:'MEREK UJI',hje:10325,kind:'REGULER',pack:latest?5:4,price:1000,nominal:latest?5000:4000,basis:'SINTETIK'}]}];
   }
  }
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto(ROOT);await page.locator('#ownerPassword').fill('synthetic-password');await page.locator('#loginButton').click();
 await expect(page.locator('#ppicMain')).toBeVisible();
 await expect(page.locator('#loginStatus')).toContainText('berhasil diperiksa');
 return {state,errors};
}

test('refresh reloads every private dataset and displays current source without another login',async({page})=>{
 const {state,errors}=await setup(page);
 expect(Object.values(state.hits)).toEqual(views.map(()=>1));
 state.revision=2;
 const result=await page.evaluate(()=>window.ppicRefreshPrivateDocs());
 expect(result).toEqual({ok:true,modules:9});
 expect(Object.values(state.hits)).toEqual(views.map(()=>2));
 if(await page.locator('#ppicDivisionsList').isHidden())await page.locator('#ppicDivisionsToggle').click();
 await page.locator('[data-view="customers"]').click();
 await expect(page.locator('#doStatus')).toContainText('V014');
 await expect(page.locator('#doStatus')).toContainText('2026-11-18');
 await expect(page.locator('#doMetrics')).toContainText('5.000');
 expect(errors).toEqual([]);
});

test('partial refresh failure stays visible and logout prevents further private reads',async({page})=>{
 const {state}=await setup(page);state.failCustomer=true;
 const failure=await page.evaluate(()=>window.ppicRefreshPrivateData().then(()=>'',e=>e.message));
 expect(failure).toContain('Sebagian data belum diperbarui');
 expect(failure).toContain('(500)');
 await page.locator('#logoutOwner').click();
 await expect(page.locator('#ppicMain')).toBeHidden();
 await expect(page.locator('#doDetails')).toBeEmpty();
 const before=JSON.stringify(state.hits);
 const loggedOut=await page.evaluate(()=>window.ppicRefreshPrivateData().then(()=>'',e=>e.message));
 expect(loggedOut).toContain('Sesi Owner berakhir');
 expect(JSON.stringify(state.hits)).toBe(before);
});

test('DO PDF keeps unknown nominal distinct from an explicit zero-price sample',async({page})=>{
 await setup(page);
 const snapshot={period:'2026-11',version:'V014',cutoff:'2026-11-18',status:'OPEN RECON',rows:[
  {sj:990,date:'2026-11-18',customer:'CUSTOMER UJI',destination:'TUJUAN UJI',area:'AREA UJI',sku:'UJI-KOSONG',brand:'MEREK UJI',kind:'REGULER',pack:3,price:null,nominal:null,basis:'BELUM TERSEDIA'}
 ]};
 await page.evaluate(s=>window.ppicSetDoCustomers([s]),snapshot);
 if(await page.locator('#ppicDivisionsList').isHidden())await page.locator('#ppicDivisionsToggle').click();
 await page.locator('[data-view="customers"]').click();
 await page.locator('#doPrint').click();
 let html=await page.locator('#previewFrame').getAttribute('srcdoc');
 expect(html).toContain('TOTAL NILAI DO: BELUM ADA HARGA / NILAI');
 expect(html).not.toContain('TOTAL NILAI DO: Rp 0');
 await page.locator('#closePreview').click();
 snapshot.rows[0]={...snapshot.rows[0],kind:'SAMPLE',price:0,nominal:0,basis:'SAMPEL'};
 await page.evaluate(s=>window.ppicSetDoCustomers([s]),snapshot);
 await page.locator('#doPrint').click();
 html=await page.locator('#previewFrame').getAttribute('srcdoc');
 expect(html).toContain('TOTAL NILAI DO: Rp 0');
 expect(html).toContain('3 pack sampel');
});
