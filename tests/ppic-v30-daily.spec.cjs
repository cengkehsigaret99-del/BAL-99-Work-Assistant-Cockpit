const {test,expect}=require('@playwright/test');
const ROOT='http://127.0.0.1:8765/',API='https://jryfozndxpjymggevkgq.supabase.co';
const daily=[
 {period:'2026-11',division:'BARANG JADI',cutoff:'2026-11-17',version:'V001',status:'OPEN RECON',unit:'pack',valuation_basis:'PROKSI, BUKAN HPP',
 payload:{opening_qty:148210,opening_nominal:1000000,valid_through:'2026-11-17',cols:['day','in_qty','out_qty','in_nominal','out_nominal'],entries:[[2,51600,8000,250000,60000],[3,60100,100,300000,1000]],qty_basis:'BUKU',nominal_basis:'PROKSI',notes:['SYNTHETIC TEST']},source_document_ids:['synthetic']},
 {period:'2026-11',division:'GILING',cutoff:'2026-11-17',version:'V001',status:'OPEN RECON',unit:'batang',valuation_basis:'UPAH BUKAN STOK',
 payload:{opening_qty:null,opening_nominal:null,valid_through:'2026-11-17',cols:['day','in_qty','labor_nominal'],entries:[[2,618500,24740000]],qty_basis:'PRODUKSI',nominal_basis:'UPAH',notes:[]},source_document_ids:['synthetic']}
];
async function login(page){
 await page.route(API+'/**',route=>{
  const u=route.request().url();
  if(u.includes('/auth/v1/token'))return route.fulfill({status:200,contentType:'application/json',body:'{"access_token":"test","expires_in":3600}'});
  if(u.includes('/functions/v1/ppic-owner-check'))return route.fulfill({status:200,contentType:'application/json',body:'{"authorized":true,"role":"owner"}'});
  if(u.includes('/rest/v1/ppic_daily_owner_view'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(daily)});
  if(u.includes('/rest/v1/ppic_source_catalog')||u.includes('/rest/v1/ppic_reports_owner_view'))return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  if(u.includes('/auth/v1/logout'))return route.fulfill({status:204,body:''});
  return route.fulfill({status:404,body:'{}'});
 });
 await page.goto(ROOT);await page.locator('#ownerPassword').fill('fake');await page.locator('#loginButton').click();await expect(page.locator('#ppicMain')).toBeVisible();
 await page.locator('[data-view="daily"]').click();
}
test('full month ledger carries opening and movements but never invents future data',async({page})=>{
 await login(page);
 await expect(page.locator('#dailyRows tr')).toHaveCount(30);
 await expect(page.locator('#dailyRows tr').nth(0)).toContainText('148.210');
 await expect(page.locator('#dailyRows tr').nth(1)).toContainText('191.810');
 await expect(page.locator('#dailyRows tr').nth(2)).toContainText('251.810');
 await expect(page.locator('#dailyRows tr').nth(17)).toContainText('BELUM ADA DATA');
 await expect(page.locator('#dailyRows tr').nth(17)).not.toContainText('251.810');
 await expect(page.locator('#dailyCharts svg')).toHaveCount(2);
});
test('unknown Giling physical opening/outflow remains blank',async({page})=>{
 await login(page);await page.locator('#dailyDivision').selectOption('GILING');
 await expect(page.locator('#dailyRows tr').nth(1)).toContainText('618.500');
 const cells=page.locator('#dailyRows tr').nth(1).locator('td');
 await expect(cells.nth(1)).toHaveText('—');
 await expect(cells.nth(4)).toHaveText('—');
 await expect(cells.nth(6)).toHaveText('24.740.000');
});
test('A4 monthly preview contains 30 rows and proper source cutoff',async({page})=>{
 await login(page);await page.locator('#dailyPrint').click();
 await expect(page.locator('#previewModal')).toBeVisible();
 const html=await page.locator('#previewFrame').getAttribute('srcdoc');
 expect(html).toContain('size:A4 landscape');
 expect(html).toContain('2026-11-30');
 expect(html).toContain('BELUM ADA DATA');
 expect(html).toContain('2026-11-17');
});
test('logout erases daily private table and print access',async({page})=>{
 await login(page);await page.locator('#logoutOwner').click();
 await expect(page.locator('#ppicMain')).toBeHidden();
 await expect(page.locator('#dailyRows')).toBeEmpty();
 await expect(page.locator('#dailyPrint')).toBeDisabled();
});
