const {test,expect}=require('@playwright/test');const zlib=require('zlib');
const API='https://jryfozndxpjymggevkgq.supabase.co';
const material={m:[['A-01','AMBREE GCC 99','PCS',4435800,5.47,'OPEN RECON'],['B-04','BOX B.A.L 16','BOX',1000,500,'OPEN RECON']],e:[['A-01',2,10940000,626000],['A-01',3,0,970000],['B-04',2,1108,0]],cutoff:16};
const payload={codec:'zlib-base64',data:zlib.deflateSync(Buffer.from(JSON.stringify(material))).toString('base64')};
async function login(page){
 await page.route(API+'/**',route=>{
 const u=route.request().url();
 if(u.includes('/auth/v1/token'))return route.fulfill({status:200,contentType:'application/json',body:'{"access_token":"fake","expires_in":3600}'});
 if(u.includes('/functions/v1/ppic-owner-check'))return route.fulfill({status:200,contentType:'application/json',body:'{"authorized":true,"role":"owner"}'});
 if(u.includes('/rest/v1/ppic_material_daily_owner_view'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{period:'2026-11',cutoff:'2026-11-16',version:'V010',status:'OPEN RECON',payload}])});
 if(u.includes('/rest/v1/'))return route.fulfill({status:200,contentType:'application/json',body:'[]'});
 if(u.includes('/auth/v1/logout'))return route.fulfill({status:204,body:''});
 return route.fulfill({status:404,body:'{}'});
 });
 await page.goto('http://127.0.0.1:8765/');await page.locator('#ownerPassword').fill('fake');await page.locator('#loginButton').click();await expect(page.locator('#ppicMain')).toBeVisible();await page.locator('[data-view="materials"]').click();
}
test('material daily report has 30 dates, nominal and explicit cutoff',async({page})=>{
 await login(page);await expect(page.locator('#matRows tr')).toHaveCount(30);
 await expect(page.locator('#matStatus')).toContainText('AMBREE GCC 99');
 await expect(page.locator('#matRows tr').nth(16)).toContainText('BELUM ADA DATA');
 await expect(page.locator('#matRows tr').nth(1)).toContainText('10.940.000');
 await expect(page.locator('#matCapacity')).toContainText('simulasi');
});
test('print template per material and all materials, no unverified capacity',async({page})=>{
 await login(page);await page.locator('#matPrint').click();await expect(page.locator('#previewModal')).toBeVisible();
 let html=await page.locator('#previewFrame').getAttribute('srcdoc');expect(html).toContain('size:A4 landscape');expect(html).toContain('AMBREE GCC 99');expect(html).not.toContain('BOX B.A.L 16');
 await page.locator('#closePreview').click();await page.locator('#matPrintScope').selectOption('all');await page.locator('#matPrint').click();
 html=await page.locator('#previewFrame').getAttribute('srcdoc');expect(html).toContain('BOX B.A.L 16');expect(html).toContain('BELUM DAPAT DIHITUNG');
});
test('logout clears private material report',async({page})=>{
 await login(page);await page.locator('#logoutOwner').click();await expect(page.locator('#matRows')).toBeEmpty();await expect(page.locator('#matPrint')).toBeDisabled();
});
