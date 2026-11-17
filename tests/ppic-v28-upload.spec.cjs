const {test,expect}=require('@playwright/test');
const ROOT='http://127.0.0.1:8765/',API='https://jryfozndxpjymggevkgq.supabase.co';
async function signIn(page,uploadResult={ok:true,document_id:'PPIC_202611_BAHAN_BAKU_abc',registration:'OPEN RECON'}){
 let uploads=0;
 await page.route(API+'/**',async route=>{
  const u=route.request().url();
  if(u.includes('/auth/v1/token'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:'test-owner-jwt',expires_in:3600})});
  if(u.includes('/functions/v1/ppic-owner-check'))return route.fulfill({status:200,contentType:'application/json',body:'{"authorized":true,"role":"owner"}'});
  if(u.includes('/functions/v1/ppic-owner-upload')){
   uploads++;
   expect(route.request().headers()['authorization']).toBe('Bearer test-owner-jwt');
   expect(route.request().headers()['x-ppic-division']).toBe('BAHAN BAKU');
   expect(route.request().headers()['x-ppic-period']).toBe('2026-11');
   expect(route.request().headers()['x-ppic-cutoff']).toBe('2026-11-17');
   return route.fulfill({status:uploadResult.ok?201:409,contentType:'application/json',body:JSON.stringify(uploadResult)});
  }
  if(u.includes('/rest/v1/ppic_source_catalog'))return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  if(u.includes('/rest/v1/ppic_reports_owner_view'))return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  if(u.includes('/auth/v1/logout'))return route.fulfill({status:204,body:''});
  return route.fulfill({status:404,body:'{}'});
 });
 await page.goto(ROOT);await page.locator('#ownerPassword').fill('fake-password');
 await page.locator('#loginButton').click();await expect(page.locator('#ppicMain')).toBeVisible();
 return ()=>uploads;
}
test('Owner can upload XLSX into private staging without posting reports',async({page})=>{
 const count=await signIn(page);
 await page.locator('[data-view="upload"]').click();
 await expect(page.locator('#upload')).toBeVisible();
 await page.locator('#uploadDivision').selectOption('BAHAN BAKU');
 await page.locator('#uploadVersion').fill('V009');
 await page.locator('#uploadFile').setInputFiles({name:'BAL_BAHAN_BAKU_V09.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.concat([Buffer.from('PK\x03\x04'),Buffer.alloc(200)])});
 await page.locator('#uploadSubmit').click();
 await expect(page.locator('#uploadStatus')).toContainText('Berhasil disimpan privat');
 await expect(page.locator('#uploadStatus')).toContainText('Data belum diposting');
 expect(count()).toBe(1);
});
test('duplicate source does not claim success',async({page})=>{
 await signIn(page,{ok:false,duplicate:true,message:'Exact duplicate'});
 await page.locator('[data-view="upload"]').click();
 await page.locator('#uploadDivision').selectOption('BAHAN BAKU');
 await page.locator('#uploadFile').setInputFiles({name:'BAL_BAHAN_BAKU_V09.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.alloc(200)});
 await page.locator('#uploadSubmit').click();
 await expect(page.locator('#uploadStatus')).toContainText('Exact duplicate');
});
test('upload cannot run after Owner logout',async({page})=>{
 const count=await signIn(page);
 await page.locator('#logoutOwner').click();
 await expect(page.locator('#ppicMain')).toBeHidden();
 await expect(page.evaluate(()=>window.ppicUploadPrivate({file:new Blob(['x']),division:'BAHAN BAKU',period:'2026-11',cutoff:'2026-11-17',version:'V009'}).then(()=>false,()=>true))).resolves.toBe(true);
 expect(count()).toBe(0);
});
test('file extension and size validation prevent upload',async({page})=>{
 const count=await signIn(page);
 await page.locator('[data-view="upload"]').click();
 await page.locator('#uploadDivision').selectOption('BAHAN BAKU');
 await page.locator('#uploadFile').setInputFiles({name:'bad.csv',mimeType:'text/csv',buffer:Buffer.alloc(200)});
 await page.locator('#uploadSubmit').click();
 await expect(page.locator('#uploadStatus')).toContainText('File harus .xlsx');
 expect(count()).toBe(0);
});
