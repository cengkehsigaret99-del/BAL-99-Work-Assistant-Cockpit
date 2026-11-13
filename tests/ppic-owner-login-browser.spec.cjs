const {test,expect}=require('@playwright/test');
const ROOT='http://127.0.0.1:8765/';
const AUTH='https://jryfozndxpjymggevkgq.supabase.co';
test('unauthenticated view is login only',async({page})=>{
 await page.goto(ROOT);
 await expect(page.locator('#ownerLogin')).toBeVisible();
 await expect(page.locator('#ppicMain')).toBeHidden();
 await expect(page.locator('#logoutOwner')).toBeHidden();
});
test('wrong email never sends login request',async({page})=>{
 let calls=0;await page.route(AUTH+'/**',async route=>{calls++;await route.fulfill({status:401,body:'{}'})});
 await page.goto(ROOT);await page.locator('#ownerEmail').fill('other@example.com');await page.locator('#ownerPassword').fill('example-password');
 await page.locator('#loginButton').click();
 await expect(page.locator('#ppicMain')).toBeHidden();
 await expect(page.locator('#loginStatus')).toContainText('bukan akun Owner');
 expect(calls).toBe(0);
});
test('valid auth but unauthorized edge remains blocked',async({page})=>{
 await page.route(AUTH+'/**',async route=>{
  if(route.request().url().includes('/auth/v1/token'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:'test-jwt',refresh_token:'refresh'})});
  return route.fulfill({status:403,contentType:'application/json',body:'{"error":"forbidden"}'});
 });
 await page.goto(ROOT);await page.locator('#ownerPassword').fill('example-password');await page.locator('#loginButton').click();
 await expect(page.locator('#ppicMain')).toBeHidden();
 await expect(page.locator('#loginStatus')).toContainText('tidak memiliki izin Owner');
});
test('authorized edge opens dashboard; logout and reload close it',async({page})=>{
 await page.route(AUTH+'/**',async route=>{
  const url=route.request().url();
  if(url.includes('/auth/v1/token'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:'test-jwt',refresh_token:'refresh'})});
  if(url.includes('/functions/v1/ppic-owner-check'))return route.fulfill({status:200,contentType:'application/json',body:'{"authorized":true,"role":"owner","reports_connected":false}'});
  return route.fulfill({status:204,body:''});
 });
 await page.goto(ROOT);await page.locator('#ownerPassword').fill('example-password');await page.locator('#loginButton').click();
 await expect(page.locator('#ppicMain')).toBeVisible();
 await expect(page.locator('#ownerLogin')).toBeHidden();
 await page.reload();await expect(page.locator('#ppicMain')).toBeHidden();
 await page.locator('#ownerPassword').fill('example-password');await page.locator('#loginButton').click();
 await expect(page.locator('#ppicMain')).toBeVisible();
 await page.locator('#logoutOwner').click();await expect(page.locator('#ppicMain')).toBeHidden();
});
