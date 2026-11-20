const {test,expect}=require('@playwright/test');
const ROOT='http://127.0.0.1:8765/';
const API='https://jryfozndxpjymggevkgq.supabase.co';
async function ownerLogin(page) {
 const errors=[];
 page.on('pageerror',err=>errors.push(err.message));
 await page.route(API+'/**',route=>{
  const url=route.request().url();
  let response=[];
  if(url.includes('/auth/v1/token'))response={access_token:'synthetic-token',expires_in:3600};
  else if(url.includes('/functions/v1/ppic-owner-check'))response={authorized:true,role:'owner'};
  else if(url.includes('/functions/v1/ppic-robot-status'))response={ok:true,period:'2026-11',config:{enabled:false},health:{state:'DISABLED'},latest_brief:null,coverage:[],evidence_sources:[],runs:[]};
  else if(url.includes('/auth/v1/logout'))response={};
  else if(url.includes('/rest/v1/ppic_source_catalog'))response=[];
  else if(url.includes('/rest/v1/ppic_reports_owner_view'))response=[];
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)});
 });
 await page.goto(ROOT);
 await expect(page.locator('#ppicMain')).toBeHidden();
 await page.locator('#ownerPassword').fill('synthetic-password');
 await page.locator('#loginButton').click();
 await expect(page.locator('#ppicMain')).toBeVisible();
 await expect(page.locator('#dashboard')).toBeVisible();
 await expect(page.locator('[data-view="dashboard"]')).toHaveAttribute('aria-current','page');
 return errors;
}
test('manager homepage retains the collapsed 3-step guide and clear source disclaimers',async({page})=>{
 const errors=await ownerLogin(page);
 await expect(page.locator('.ppic-step-card')).toHaveCount(3);
 await expect(page.locator('.ppic-shortcut')).toHaveCount(6);
 await expect(page.locator('#ppicStartTitle')).toHaveText('Selesaikan laporan dalam 3 langkah');
 await expect(page.locator('#dashboard')).toContainText('Upload menyimpan sumber');
 await expect(page.locator('.ppic-nav-primary [data-view]')).toHaveCount(5);
 await expect(page.locator('.ppic-nav-secondary [data-view]')).toHaveCount(8);
 await expect(page.locator('[data-view]')).toHaveCount(13);
 expect(errors).toEqual([]);
});
test('steps navigate upload to Bank Data to reporting without losing context',async({page})=>{
 await ownerLogin(page);
 await page.locator('#robotReportGuide>summary').click();
 await page.locator('.ppic-step-card [data-go="upload"]').click();
 await expect(page.locator('#upload')).toBeVisible();
 await expect(page.locator('#ppicContextTitle')).toHaveText('Upload Excel');
 await expect(page.locator('[data-view="upload"]')).toHaveAttribute('aria-current','page');
 await page.locator('#ppicContextNext').click();
 await expect(page.locator('#data')).toBeVisible();
 await expect(page.locator('#ppicContextStep')).toHaveText('LANGKAH 02 / 03');
 await page.locator('#ppicContextNext').click();
 await expect(page.locator('#reports')).toBeVisible();
 await expect(page.locator('#ppicContextTitle')).toHaveText('Laporan & Cetak');
 await expect(page.locator('#reportCoverage')).toContainText('0');
 await page.locator('#ppicContextNext').click();
 await expect(page.locator('#dashboard')).toBeVisible();
});
test('upload help distinguishes SDM worker Excel from ordinary Giling and Verpack source',async({page})=>{
 await ownerLogin(page);
 await page.locator('[data-view="upload"]').click();
 await page.locator('#uploadDivision').selectOption('GILING');
 await expect(page.locator('#uploadDivisionHint')).toContainText('SDM GILING');
 await page.locator('#uploadDivision').selectOption('SDM GILING');
 await expect(page.locator('#uploadDivisionHint')).toContainText('rincian pekerja');
 await expect(page.locator('#uploadDivisionHint')).toContainText('BUKAN laporan produksi');
 await page.locator('#uploadDivision').selectOption('SDM VERPACK');
 await expect(page.locator('#uploadDivisionHint')).toContainText('BUKAN laporan produksi VERPACK');
 await page.locator('#uploadDivision').selectOption('CUKAI');
 await expect(page.locator('#uploadDivisionHint')).toContainText('tidak otomatis');
 await expect(page.locator('#upload')).toContainText('3 · Cek Laporan');
});
test('all division menus remain accessible through grouped nav and quick links',async({page})=>{
 await ownerLogin(page);
 const route=['sdm','finished','customers','excise','materials','daily','analytics','sources','dashboard'];
 for(const id of route){
  await page.locator('[data-view="'+id+'"]').click();
  await expect(page.locator('#'+id)).toBeVisible();
  await expect(page.locator('[data-view="'+id+'"]')).toHaveAttribute('aria-current','page');
  await expect(page.locator('#ppicContextTitle')).not.toBeEmpty();
 }
 await page.locator('#robotReportGuide>summary').click();
 await page.locator('.ppic-shortcut[data-go="sdm"]').click();
 await expect(page.locator('#sdmThreeReports')).toBeVisible();
 await expect(page.locator('#ppicContextHelp')).toContainText('payroll final');
});
test('mobile divisi menu expands in a two-column grid and dashboard fits without cut-off cards',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const errors=await ownerLogin(page);
 await expect(page.locator('#ppicDivisionsList')).toBeHidden();
 await page.locator('#ppicDivisionsToggle').click();
 await expect(page.locator('#ppicDivisionsList')).toBeVisible();
 const width=await page.evaluate(()=>({
  page:document.documentElement.scrollWidth,
  viewport:window.innerWidth,
  nav:document.querySelector('.ppic-nav-secondary').scrollWidth,
  navVisible:document.querySelector('.ppic-nav-secondary').clientWidth,
  cards:[...document.querySelectorAll('.ppic-step-card,.ppic-shortcut')].map(x=>({width:x.getBoundingClientRect().width,screen:x.getBoundingClientRect().right}))
 }));
 expect(width.page).toBeLessThanOrEqual(width.viewport+2);
 expect(width.nav).toBeLessThanOrEqual(width.navVisible+2);
 expect(width.cards.every(x=>x.width<=width.viewport&&x.screen<=width.viewport+3)).toBeTruthy();
 await page.locator('[data-view="excise"]').click();
 await expect(page.locator('#excise')).toBeVisible();
 await page.locator('[data-view="upload"]').click();
 await expect(page.locator('#upload')).toBeVisible();
 expect(errors).toEqual([]);
});
test('login resets to home on next session and private data does not appear before login',async({page})=>{
 await ownerLogin(page);
 await page.locator('[data-view="sdm"]').click();
 await expect(page.locator('#sdm')).toBeVisible();
 await page.locator('#logoutOwner').click();
 await expect(page.locator('#ppicMain')).toBeHidden();
 await page.locator('#ownerPassword').fill('synthetic-password');
 await page.locator('#loginButton').click();
 await expect(page.locator('#ppicMain')).toBeVisible();
 await expect(page.locator('#dashboard')).toBeVisible();
 await expect(page.locator('[data-view="dashboard"]')).toHaveAttribute('aria-current','page');
});
test('installation instructions remain available but do not crowd first screen',async({page})=>{
 await ownerLogin(page);
 await expect(page.locator('#installPanel')).toBeHidden();
 await page.locator('.ppic-install-help summary').click();
 await expect(page.locator('#installPanel')).toBeVisible();
 await expect(page.locator('#installPpic')).toBeEnabled();
});
