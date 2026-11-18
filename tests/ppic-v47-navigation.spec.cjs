const {test,expect}=require('@playwright/test');
const API='https://jryfozndxpjymggevkgq.supabase.co';
async function login(page){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(API+'/**',route=>{
  const u=route.request().url();let body=[];
  if(u.includes('/auth/v1/token'))body={access_token:'synthetic-test',expires_in:3600};
  else if(u.includes('/functions/v1/ppic-owner-check'))body={authorized:true,role:'owner'};
  else if(u.includes('/auth/v1/logout'))body={};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('http://127.0.0.1:8765/');
 await page.locator('#ownerPassword').fill('test-only');
 await page.locator('#loginButton').click();
 await expect(page.locator('#ppicMain')).toBeVisible();
 return errors;
}
test('simple initial navigation and deliberate division expansion',async({page})=>{
 const errors=await login(page);
 await expect(page.locator('#ppicDivisionsList')).toBeHidden();
 await expect(page.locator('#ppicDivisionsToggle')).toHaveAttribute('aria-expanded','false');
 await expect(page.locator('#ppicFlowStatus button')).toHaveCount(3);
 await page.locator('#ppicDivisionsToggle').click();
 await expect(page.locator('#ppicDivisionsList')).toBeVisible();
 await expect(page.locator('#ppicDivisionsToggle')).toHaveAttribute('aria-expanded','true');
 await page.locator('#ppicDivisionsToggle').click();
 await expect(page.locator('#ppicDivisionsList')).toBeHidden();
 expect(errors).toEqual([]);
});
test('three-step workflow navigates without changing private data',async({page})=>{
 await login(page);
 await page.locator('[data-flow="upload"]').click();
 await expect(page.locator('#upload')).toBeVisible();
 await expect(page.locator('[data-flow="upload"]')).toHaveAttribute('aria-current','step');
 await page.locator('[data-flow="data"]').click();
 await expect(page.locator('#data')).toBeVisible();
 await page.locator('[data-flow="reports"]').click();
 await expect(page.locator('#reports')).toBeVisible();
 await page.locator('[data-view="dashboard"]').click();
 await expect(page.locator('#dashboard')).toBeVisible();
 await expect(page.locator('#ppicDivisionsList')).toBeHidden();
});
test('divisional deep links reveal their menu and preserve report controls',async({page})=>{
 await login(page);
 await page.locator('#ppicDivisionsToggle').click();
 await page.locator('[data-view="sdm"]').click();
 await expect(page.locator('#sdm')).toBeVisible();
 await expect(page.locator('#ppicDivisionsList')).toBeVisible();
 await expect(page.locator('#sdmPrintCombined')).toBeDisabled();
 await page.locator('[data-view="excise"]').click();
 await expect(page.locator('#excise')).toBeVisible();
 await expect(page.locator('#ppicDivisionsList')).toBeVisible();
 await page.locator('[data-view="upload"]').click();
 await expect(page.locator('#uploadDivision')).toBeVisible();
});
test('mobile menu stays inside screen and remains usable',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await login(page);
 await page.locator('#ppicDivisionsToggle').click();
 const bounds=await page.evaluate(()=>{
  const el=document.querySelector('#ppicMain .ppic-nav');
  const bar=document.querySelector('#ppicFlowStatus');
  return {nav:el.getBoundingClientRect().width,flow:bar.getBoundingClientRect().width,viewport:innerWidth,buttons:[...document.querySelectorAll('#ppicDivisionsList .btn')].map(x=>x.getBoundingClientRect().width)};
 });
 expect(bounds.nav).toBeLessThanOrEqual(bounds.viewport);
 expect(bounds.flow).toBeLessThanOrEqual(bounds.viewport);
 expect(bounds.buttons.every(x=>x<bounds.viewport)).toBe(true);
});