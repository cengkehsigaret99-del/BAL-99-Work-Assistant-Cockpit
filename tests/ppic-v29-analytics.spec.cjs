const {test,expect}=require('@playwright/test');
const ROOT='http://127.0.0.1:8765/',API='https://jryfozndxpjymggevkgq.supabase.co';
const reports=[
 {report_key:'01',period:'2026-11',title:'Supply Demand',cutoff:'2026-11-12',version:'V001',status:'OPEN RECON',basis:'MIXED',payload:{tables:[{title:'Stok SKU',headers:['SKU','Stok akhir pack','Keluar pack'],rows:[['C-033','58.510','355.210'],['C-036','136.950','228.800'],['C-035','42.950','0']]}]},source_refs:[]},
 {report_key:'09',period:'2026-11',title:'DO Surat Jalan',cutoff:'2026-11-12',version:'V001',status:'OPEN RECON',basis:'MIXED',payload:{tables:[{title:'Ringkasan DO',headers:['Indikator','Jumlah','Status'],rows:[['Surat Jalan','14','Buku DO'],['Pack','386.335','Buku']]}]},source_refs:[]}
];
async function login(page){
 await page.route(API+'/**',route=>{
  const u=route.request().url();
  if(u.includes('/auth/v1/token'))return route.fulfill({status:200,contentType:'application/json',body:'{"access_token":"synthetic","expires_in":3600}'});
  if(u.includes('/functions/v1/ppic-owner-check'))return route.fulfill({status:200,contentType:'application/json',body:'{"authorized":true,"role":"owner"}'});
  if(u.includes('/rest/v1/ppic_reports_owner_view'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(reports)});
  if(u.includes('/rest/v1/ppic_source_catalog'))return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  if(u.includes('/auth/v1/logout'))return route.fulfill({status:204,body:''});
  return route.fulfill({status:404,body:'{}'});
 });
 await page.goto(ROOT);await page.locator('#ownerPassword').fill('fake');await page.locator('#loginButton').click();await expect(page.locator('#ppicMain')).toBeVisible();
}
test('division analytics draws graph only from sourced report and labels cutoff',async({page})=>{
 await login(page);await page.locator('[data-view="analytics"]').click();
 await expect(page.locator('#analytics')).toBeVisible();
 await expect(page.locator('#analyticsStatus')).toContainText('cut-off 2026-11-12');
 await expect(page.locator('#analyticsCharts svg')).toHaveCount(2);
 await expect(page.locator('#analyticsCharts')).toContainText('OPEN RECON');
 await expect(page.locator('#sjSummary')).toContainText('Surat Jalan');
 await expect(page.locator('#sjNotice')).toContainText('rincian per nomor SJ belum diimpor');
});
test('division selection switches report and print navigation',async({page})=>{
 await login(page);await page.locator('[data-view="analytics"]').click();
 await page.locator('#analyticsDivision').selectOption('DO');
 await expect(page.locator('#analyticsReport')).toHaveValue('9');
 await expect(page.locator('#analyticsSummary')).toContainText('Ringkasan DO');
 await page.locator('#analyticsOpenReport').click();
 await expect(page.locator('#reports')).toBeVisible();
 await expect(page.locator('#reporttitle')).toContainText('DO');
});
test('period without snapshots cannot show stale charts',async({page})=>{
 await login(page);await page.locator('[data-view="analytics"]').click();
 await page.locator('#analyticsPeriod').fill('2026-10');
 await expect(page.locator('#analyticsCharts svg')).toHaveCount(0);
 await expect(page.locator('#analyticsOpenReport')).toBeDisabled();
 await expect(page.locator('#analyticsStatus')).toContainText('Belum ada snapshot');
});
test('logout removes analytics data from private DOM',async({page})=>{
 await login(page);await page.locator('[data-view="analytics"]').click();
 await expect(page.locator('#analyticsCharts svg')).toHaveCount(2);
 await page.locator('#logoutOwner').click();
 await expect(page.locator('#ppicMain')).toBeHidden();
 await expect(page.locator('#analyticsCharts svg')).toHaveCount(0);
 await expect(page.locator('#analyticsSummary')).toBeEmpty();
});
