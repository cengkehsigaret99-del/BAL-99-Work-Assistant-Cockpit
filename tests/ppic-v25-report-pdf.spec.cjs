const {test,expect}=require('@playwright/test');
const ROOT='http://127.0.0.1:8765/';
const API='https://jryfozndxpjymggevkgq.supabase.co';
const report={
 report_key:'07',period:'2026-11',title:'HPP Full Costing per SKU — Tinjauan Sumber',
 cutoff:'2026-11-12',version:'V001',status:'OPEN RECON',basis:'MIXED',created_at:'2026-11-13T12:00:00Z',
 payload:{report_state:'HPP November belum final',notice:'HISTORIS OKTOBER, BUKAN HPP NOVEMBER',
 tables:[{title:'Pembanding historis',headers:['Produk','Rp/pack','Status'],rows:[['CB77','5.216,05','HISTORIS'],['Refill','4.260,03','HISTORIS']]}],
 missing_inputs:['BOP aktual belum tersedia'],disclaimer:'Bukan HPP akhir November'},
 source_refs:[{title:'HPP OCT V001',date:'2026-10-27',scope:'HPP historis'}]
};
async function mockAuth(page,rows=[report]){
 await page.route(API+'/**',async route=>{
  const url=route.request().url();
  if(url.includes('/auth/v1/token'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:'test-token',expires_in:3600})});
  if(url.includes('/functions/v1/ppic-owner-check'))return route.fulfill({status:200,contentType:'application/json',body:'{"authorized":true,"role":"owner"}'});
  if(url.includes('/rest/v1/ppic_reports_owner_view'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(rows)});
  if(url.includes('/rest/v1/ppic_source_catalog'))return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  if(url.includes('/auth/v1/logout'))return route.fulfill({status:204,body:''});
  return route.fulfill({status:404,body:'{}'});
 });
 await page.goto(ROOT);
 await page.locator('#ownerPassword').fill('synthetic-password');
 await page.locator('#loginButton').click();
 await expect(page.locator('#ppicMain')).toBeVisible();
 await page.locator('button[data-view="reports"]').click();
}
test('actual sourced report tables replace old blank specification',async({page})=>{
 await mockAuth(page);
 await page.locator('#catalog .report').nth(6).click();
 await expect(page.locator('#reportData table')).toHaveCount(1);
 await expect(page.locator('#reportData')).toContainText('5.216,05');
 await expect(page.locator('#reportValidity')).toContainText('OPEN RECON');
 await expect(page.locator('#preview')).toBeEnabled();
 await page.locator('#preview').click();
 await expect(page.locator('#previewModal')).toBeVisible();
 const html=await page.locator('#previewFrame').getAttribute('srcdoc');
 expect(html).toContain('5.216,05');
 expect(html).toContain('HISTORIS OKTOBER');
 expect(html).toContain('<table>');
 expect(html).toContain('size:A4 portrait');
 expect(html).not.toContain('position:fixed');
 expect(html).not.toContain('REPORT SPECIFICATION');
});
test('reports without a sourced snapshot cannot print blank PDF',async({page})=>{
 await mockAuth(page);
 await expect(page.locator('#preview')).toBeDisabled();
 await expect(page.locator('#missingReportData')).toBeVisible();
 await page.locator('#catalog .report').nth(6).click();
 await expect(page.locator('#preview')).toBeEnabled();
 await page.locator('#reportPeriod').fill('2026-10');
 await expect(page.locator('#preview')).toBeDisabled();
});
test('logout clears report data and any open A4 preview',async({page})=>{
 await mockAuth(page);
 await page.locator('#catalog .report').nth(6).click();
 await page.locator('#preview').click();
 await page.evaluate(()=>document.querySelector('#logoutOwner').click());
 await expect(page.locator('#ppicMain')).toBeHidden();
 await expect(page.locator('#previewModal')).toBeHidden();
 await expect(page.locator('#reportData')).toBeEmpty();
 const html=await page.locator('#previewFrame').getAttribute('srcdoc');
 expect(html).toBe('');
});
test('HTML in private report cells is escaped when rendering',async({page})=>{
 const altered=JSON.parse(JSON.stringify(report));altered.payload.tables[0].rows[0][1]='<img src=x onerror=alert(1)>';
 await mockAuth(page,[altered]);
 await page.locator('#catalog .report').nth(6).click();
 await page.locator('#preview').click();
 const html=await page.locator('#previewFrame').getAttribute('srcdoc');
 expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
 expect(html).not.toContain('<img src=x onerror=alert(1)>');
});
