const {test,expect}=require('@playwright/test'),zlib=require('zlib');const API='https://jryfozndxpjymggevkgq.supabase.co';const data={w:[['GILING','G10002','MUDRIKAH'],['VERPACK','P10001','ISRIYAH']],b:['GCC 99'],s:['NORMAL'],r:[[0,13,0,3200,128000,0],[1,13,0,500,105000,0]]};const payload={codec:'zlib-base64',data:zlib.deflateSync(Buffer.from(JSON.stringify(data))).toString('base64')};test('combined report separates batang and pack and sums wages',async({page})=>{await page.route(API+'/**',route=>{const u=route.request().url();if(u.includes('/auth/v1/token'))return route.fulfill({status:200,contentType:'application/json',body:'{"access_token":"fake","expires_in":3600}'});if(u.includes('/functions/v1/ppic-owner-check'))return route.fulfill({status:200,contentType:'application/json',body:'{"authorized":true,"role":"owner"}'});if(u.includes('/rest/v1/ppic_sdm_weekly_owner_view'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{period:'2026-11',version:'V001',payload}])});if(u.includes('/rest/v1/'))return route.fulfill({status:200,contentType:'application/json',body:'[]'});return route.fulfill({status:404,body:'{}'});});await page.goto('http://127.0.0.1:8765/');await page.locator('#ownerPassword').fill('fake');await page.locator('#loginButton').click();await expect(page.locator('#ppicMain')).toBeVisible();await page.locator('[data-view="sdm"]').click();await page.locator('#sdmDiv').selectOption('GABUNGAN');await expect(page.locator('#sdmRows tr')).toHaveCount(2);await expect(page.locator('#sdmMetrics')).toContainText('3.200 batang');await expect(page.locator('#sdmMetrics')).toContainText('500 pack');await expect(page.locator('#sdmMetrics')).toContainText('233.000');await page.locator('#sdmPrint').click();const html=await page.locator('#previewFrame').getAttribute('srcdoc');expect(html).toContain('MUDRIKAH');expect(html).toContain('ISRIYAH');expect(html).toContain('GABUNGAN');});
test('SDM Owner menu rebuilds a missing snapshot from two registered sources',async({page})=>{
  const mock={w:[['GILING','GX0001','PEKERJA UJI GILING'],['VERPACK','PX0001','PEKERJA UJI VERPACK']],b:['GCC 99'],s:['NORMAL'],r:[[0,17,0,2500,100000,0],[1,17,0,500,85000,0]]};
  const zipped={codec:'zlib-base64',data:zlib.deflateSync(Buffer.from(JSON.stringify(mock))).toString('base64'),meta:{cutoff:'2026-11-17',summaries:{'SDM GILING':{upahTanpaHasil:0},'SDM VERPACK':{upahTanpaHasil:0}}}};
  let rebuildCount=0;
  const uploads=['SDM GILING','SDM VERPACK'].map(division=>({document_id:'TEST_'+division.replaceAll(' ','_'),division,period:'2026-11',version:'V009'}));
  await page.route(API+'/**',async route=>{
    const u=route.request().url();
    if(u.includes('/auth/v1/token'))return route.fulfill({status:200,contentType:'application/json',body:'{"access_token":"test-owner","expires_in":3600}'});
    if(u.includes('/functions/v1/ppic-owner-check'))return route.fulfill({status:200,contentType:'application/json',body:'{"authorized":true,"role":"owner"}'});
    if(u.includes('/functions/v1/ppic-sdm-rebuild')){rebuildCount++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,period:'2026-11',version:'V009',cutoff:'2026-11-17',workers:2,rows:2})});}
    if(u.includes('/rest/v1/ppic_sdm_weekly_owner_view'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(rebuildCount?[{period:'2026-11',version:'V009',payload:zipped}]:[])});
    if(u.includes('/rest/v1/ppic_source_catalog'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(uploads)});
    if(u.includes('/rest/v1/'))return route.fulfill({status:200,contentType:'application/json',body:'[]'});
    return route.fulfill({status:404,contentType:'application/json',body:'{}'});
  });
  await page.goto('http://127.0.0.1:8765/');
  await page.locator('#ownerPassword').fill('test-only');
  await page.locator('#loginButton').click();
  await expect(page.locator('#ppicMain')).toBeVisible();
  await page.locator('[data-view="sdm"]').click();
  await expect.poll(()=>rebuildCount).toBe(1);
  await page.locator('#sdmDiv').selectOption('GABUNGAN');
  await expect(page.locator('#sdmRows tr')).toHaveCount(2);
  await expect(page.locator('#sdmMetrics')).toContainText('2.500 batang');
  await expect(page.locator('#sdmMetrics')).toContainText('500 pack');
  await expect(page.locator('#sdmPrint')).toBeEnabled();
  await expect(page.locator('#sdmProcessState')).toContainText('Selesai');
});
