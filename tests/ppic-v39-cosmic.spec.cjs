const {test,expect}=require('@playwright/test');
const API='https://jryfozndxpjymggevkgq.supabase.co';
test('user BAL logo, cosmic dashboard, login and report PDF header',async({page})=>{
 await page.route(API+'/**',route=>{const u=route.request().url();if(u.includes('/auth/v1/token'))return route.fulfill({status:200,contentType:'application/json',body:'{"access_token":"fake","expires_in":3600}'});if(u.includes('/functions/v1/ppic-owner-check'))return route.fulfill({status:200,contentType:'application/json',body:'{"authorized":true,"role":"owner"}'});if(u.includes('/rest/v1/'))return route.fulfill({status:200,contentType:'application/json',body:'[]'});return route.fulfill({status:404,body:'{}'});});
 await page.goto('http://127.0.0.1:8765/');await expect(page.locator('.bal-login-brand img')).toBeVisible();expect(await page.locator('.bal-login-brand img').evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
 await page.locator('#ownerPassword').fill('fake');await page.locator('#loginButton').click();await expect(page.locator('#ppicMain')).toBeVisible();
 await expect(page.locator('.bal-brand-mark')).toBeVisible();expect(await page.locator('.bal-brand-mark').evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
 await expect(page.locator('#bal-cosmic-v39')).toHaveCount(1);
 const branded=await page.evaluate(()=>balBrandPrint('<!doctype html><html><head></head><body><p>Uji laporan</p></body></html>'));
 expect(branded).toContain('bal-logo-user.webp');expect(branded).toContain('PPIC CONTROL TOWER');expect(branded).toContain('Uji laporan');
});
