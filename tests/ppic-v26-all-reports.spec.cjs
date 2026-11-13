const {test,expect}=require('@playwright/test');
const API='https://jryfozndxpjymggevkgq.supabase.co',WEB='http://127.0.0.1:8765/';
const fakeReports=Array.from({length:13},(_,i)=>({
  report_key:String(i+1).padStart(2,'0'),period:'2026-11',title:'QA synthetic report '+String(i+1),
  cutoff:'2026-11-12',version:'V001',status:'OPEN RECON',basis:i===9||i===12?'PROVISIONAL':'MIXED',
  payload:{report_state:'SYNTHETIC QA / not operational data',notice:'OPEN RECON — not final',
    tables:[{title:'Synthetic evidence',headers:['SKU','Kuantitas','Catatan'],rows:[['QA-SKU-'+i,String(100+i),'Data sintetik; bukan BAL']]}],
    missing_inputs:['Bukti sumber final belum tersedia'],disclaimer:'SYNTHETIC UAT — bukan laporan operasional'},
  source_refs:[{title:'Source fixture',date:'2026-11-12',scope:'synthetic QA only'}],
  created_at:'2026-11-13T12:00:00Z'
}));
fakeReports.push({...fakeReports[6],version:'V002',payload:{...fakeReports[6].payload,tables:[{title:'Newest version',headers:['Kode','Nilai'],rows:[['V002 latest','202']] }]},created_at:'2026-11-13T12:01:00Z'});
async function signIn(page,records=fakeReports){
 await page.route(API+'/**',async route=>{
  const u=route.request().url();
  if(u.includes('/auth/v1/token'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:'synthetic-token',expires_in:3600})});
  if(u.includes('/functions/v1/ppic-owner-check'))return route.fulfill({status:200,contentType:'application/json',body:'{"authorized":true,"role":"owner"}'});
  if(u.includes('/rest/v1/ppic_source_catalog'))return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  if(u.includes('/rest/v1/ppic_reports_owner_view'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(records)});
  if(u.includes('/auth/v1/logout'))return route.fulfill({status:204,body:''});
  return route.fulfill({status:404,body:'{}'});
 });
 await page.goto(WEB);
 await page.locator('#ownerPassword').fill('synthetic-not-secret');
 await page.locator('#loginButton').click();
 await expect(page.locator('#ppicMain')).toBeVisible();
}
test('all 13 report menus show sourced data and nonempty A4 PDF',async({page})=>{
 await signIn(page);
 await expect(page.locator('#nReportSnapshots')).toHaveText('13');
 await expect(page.locator('#overallDataStatus')).toHaveText('OPEN RECON');
 await page.locator('button[data-view="reports"]').click();
 await expect(page.locator('#catalog .report')).toHaveCount(13);
 await expect(page.locator('#reportCoverage')).toContainText('13 dari 13');
 const pdfPage=await page.context().newPage();
 for(let i=0;i<13;i++){
  await page.locator('#catalog .report').nth(i).click();
  await expect(page.locator('#reportData table')).toHaveCount(1);
  await expect(page.locator('#reportValidity')).toContainText('OPEN RECON');
  await expect(page.locator('#preview')).toBeEnabled();
  await page.locator('#preview').click();
  await expect(page.locator('#previewModal')).toBeVisible();
  const html=await page.locator('#previewFrame').getAttribute('srcdoc');
  expect(html).toContain('<table>');
  expect(html).toContain('size:A4 portrait');
  expect(html).toContain('SYNTHETIC QA');
  if(i===6){expect(html).toContain('V002 latest');expect(html).not.toContain('QA-SKU-6')}
  else expect(html).toContain('QA-SKU-'+i);
  await pdfPage.setContent(html);
  const pdf=await pdfPage.pdf({format:'A4',printBackground:true});
  expect(pdf.subarray(0,4).toString()).toBe('%PDF');
  expect(pdf.length).toBeGreaterThan(6000);
  await page.locator('#closePreview').click();
 }
 await pdfPage.close();
});
test('absent period disables all 13 PDFs and reflects zero coverage',async({page})=>{
 await signIn(page);
 await page.locator('button[data-view="reports"]').click();
 await page.locator('#reportPeriod').fill('2026-10');
 await expect(page.locator('#reportCoverage')).toContainText('0 dari 13');
 for(let i=0;i<13;i++){
  await page.locator('#catalog .report').nth(i).click();
  await expect(page.locator('#preview')).toBeDisabled();
  await expect(page.locator('#reportData table')).toHaveCount(0);
 }
});
test('logout clears the private preview and all report contents',async({page})=>{
 await signIn(page);
 await page.locator('button[data-view="reports"]').click();
 await page.locator('#catalog .report').nth(7).click();
 await page.locator('#preview').click();
 await page.locator('#logoutOwner').evaluate(button=>button.click());
 await expect(page.locator('#ppicMain')).toBeHidden();
 await expect(page.locator('#previewModal')).toBeHidden();
 await expect(page.locator('#nReportSnapshots')).toHaveText('0');
 await expect(page.locator('#reportData')).toBeEmpty();
 const srcdoc=await page.locator('#previewFrame').getAttribute('srcdoc');
 expect(srcdoc).toBe('');
});
test('mobile layout shows 13/13 count and selected snapshot',async({page})=>{
 await page.setViewportSize({width:360,height:800});
 await signIn(page);
 await page.locator('button[data-view="reports"]').click();
 await expect(page.locator('#reportCoverage')).toContainText('13 dari 13');
 await page.locator('#catalog .report').nth(4).click();
 await expect(page.locator('#reportData')).toContainText('QA-SKU-4');
 await expect(page.locator('#catalog .report').nth(4)).toContainText('OPEN RECON');
 await page.screenshot({path:'ppic-v26-mobile-qa.png',fullPage:true});
});
