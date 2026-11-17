const {test,expect}=require('@playwright/test'),zlib=require('zlib');
const API='https://jryfozndxpjymggevkgq.supabase.co';
const payload={codec:'zlib-base64',data:zlib.deflateSync(Buffer.from(JSON.stringify({m:[['C-033','GCC 12',1000,6000,'',1500],['C-036','GCC 16',800,8000,'',1600]],e:[[2,'KELUAR','C-033',320,'USUP',500],[2,'MASUK','C-036',null,null,800]],cutoff:17}))).toString('base64')};
test('packs and carton equivalents are visible in date stock, transactions and PDF',async({page})=>{
 await page.route(API+'/**',route=>{const u=route.request().url();if(u.includes('/auth/v1/token'))return route.fulfill({status:200,contentType:'application/json',body:'{"access_token":"fake","expires_in":3600}'});if(u.includes('/functions/v1/ppic-owner-check'))return route.fulfill({status:200,contentType:'application/json',body:'{"authorized":true,"role":"owner"}'});if(u.includes('/rest/v1/ppic_finished_goods_owner_view'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{period:'2026-11',version:'V012',payload}])});if(u.includes('/rest/v1/'))return route.fulfill({status:200,contentType:'application/json',body:'[]'});return route.fulfill({status:404,body:'{}'});});
 await page.goto('http://127.0.0.1:8765/');await page.locator('#ownerPassword').fill('fake');await page.locator('#loginButton').click();await expect(page.locator('#ppicMain')).toBeVisible();await page.locator('[data-view="finished"]').click();await page.locator('#fgDate').fill('2026-11-02');
 await expect(page.locator('#fgBalances tr')).toHaveCount(2);
 await expect(page.locator('#fgBalances tr').nth(0).locator('td').nth(6)).toHaveText('1.000');
 await expect(page.locator('#fgBalances tr').nth(0).locator('td').nth(7)).toHaveText('1');
 await expect(page.locator('#fgBalances tr').nth(1).locator('td').nth(6)).toHaveText('800');
 await expect(page.locator('#fgBalances tr').nth(1).locator('td').nth(7)).toHaveText('3');
 await expect(page.locator('#fgTransactions')).toContainText('0,5');
 await expect(page.locator('#fgDaily tr').nth(1).locator('td').nth(8)).toHaveText('4');
 await page.locator('#fgPrintMode').selectOption('month');await page.locator('#fgPrint').click();
 const html=await page.locator('#previewFrame').getAttribute('srcdoc');
 expect(html).toContain('Akhir karton');expect(html).toContain('Isi 12 = 1.000 pack/karton');
});
