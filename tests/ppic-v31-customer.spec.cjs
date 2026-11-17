const {test,expect}=require('@playwright/test');
const ROOT='http://127.0.0.1:8765/',API='https://jryfozndxpjymggevkgq.supabase.co';
const rows=[
{sj:320,date:'2026-11-09',customer:'KHOIRUL SOLEH',destination:'PMS',area:'Padang',sku:'C-033',brand:'GCC 99 12',hje:10325,kind:'REGULER',pack:129000,price:6400,nominal:825600000,basis:'HISTORIS'},
{sj:320,date:'2026-11-09',customer:'KHOIRUL SOLEH',destination:'PMS',area:'Padang',sku:'C-036',brand:'NEW 16',hje:13775,kind:'REGULER',pack:57600,price:8400,nominal:483840000,basis:'HISTORIS'},
{sj:321,date:'2026-11-11',customer:'SANDY',destination:'SANDY',area:'Banten',sku:'C-033',brand:'GCC 99 12',hje:10325,kind:'REGULER',pack:10000,price:null,nominal:null,basis:'BELUM ADA HARGA'}];
async function login(page){
 await page.route(API+'/**',route=>{
 const u=route.request().url();
 if(u.includes('/auth/v1/token'))return route.fulfill({status:200,contentType:'application/json',body:'{"access_token":"fake","expires_in":3600}'});
 if(u.includes('/functions/v1/ppic-owner-check'))return route.fulfill({status:200,contentType:'application/json',body:'{"authorized":true,"role":"owner"}'});
 if(u.includes('/rest/v1/ppic_do_customer_owner_view'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{period:'2026-11',cutoff:'2026-11-17',version:'V010',status:'OPEN RECON',rows}])});
 if(u.includes('/rest/v1/'))return route.fulfill({status:200,contentType:'application/json',body:'[]'});
 if(u.includes('/auth/v1/logout'))return route.fulfill({status:204,body:''});
 return route.fulfill({status:404,body:'{}'});
 });
 await page.goto(ROOT);await page.locator('#ownerPassword').fill('fake');await page.locator('#loginButton').click();await expect(page.locator('#ppicMain')).toBeVisible();
 await page.locator('[data-view="customers"]').click();
}
test('customer DO report shows real field structure and missing prices',async({page})=>{
 await login(page);await expect(page.locator('#doDetails tr')).toHaveCount(3);
 await expect(page.locator('#doStatus')).toContainText('10.000 pack tanpa harga');
 await expect(page.locator('#doSummary tr')).toHaveCount(2);
 await expect(page.locator('#doCharts svg')).toHaveCount(1);
});
test('customer and SKU filters, PDF print, and no stale data after logout',async({page})=>{
 await login(page);await page.locator('#doCustomer').selectOption('KHOIRUL SOLEH');
 await expect(page.locator('#doDetails tr')).toHaveCount(2);
 await page.locator('#doSku').selectOption('C-036');await expect(page.locator('#doDetails tr')).toHaveCount(1);
 await page.locator('#doPrint').click();await expect(page.locator('#previewModal')).toBeVisible();
 const html=await page.locator('#previewFrame').getAttribute('srcdoc');expect(html).toContain('NEW 16');expect(html).not.toContain('SANDY');
 await page.locator('#closePreview').click();await page.locator('#logoutOwner').click();
 await expect(page.locator('#doDetails')).toBeEmpty();await expect(page.locator('#doPrint')).toBeDisabled();
});
test('no November data is not silently fabricated',async({page})=>{
 await login(page);await page.locator('#doPeriod').fill('2026-10');
 await expect(page.locator('#doDetails')).toBeEmpty();await expect(page.locator('#doPrint')).toBeDisabled();
});
