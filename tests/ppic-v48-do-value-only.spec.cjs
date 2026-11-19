const {test,expect}=require('@playwright/test');
const ROOT='http://127.0.0.1:8765/';
const API='https://jryfozndxpjymggevkgq.supabase.co';
// Synthetic customer and product fixtures. No real BAL DO documents are embedded.
const current=[
 {sj:901,date:'2026-11-02',customer:'PELANGGAN CONTOH',destination:'AREA UJI',area:'AREA UJI',sku:'UJI-016',brand:'MEREK CONTOH 16',hje:13775,kind:'REGULER',pack:4,price:9100,nominal:36400,basis:'KONFIRMASI USER'},
 {sj:902,date:'2026-11-03',customer:'PELANGGAN CONTOH',destination:'AREA UJI',area:'AREA UJI',sku:'UJI-012',brand:'MEREK CONTOH 12',hje:10325,kind:'REGULER',pack:10,price:6300,nominal:63000,basis:'HISTORIS'},
 {sj:903,date:'2026-11-04',customer:'PELANGGAN CONTOH',destination:'AREA UJI',area:'AREA UJI',sku:'UJI-SAMPLE',brand:'SAMPEL CONTOH',hje:10325,kind:'SAMPEL',pack:2,price:0,nominal:0,basis:'SAMPEL'}
];
const older=current.map(x=>x.sku==='UJI-016'?{...x,price:7000,nominal:28000}:x);
const sn=(version,rows)=>({period:'2026-11',version,cutoff:'2026-11-17',status:'OPEN RECON',rows});
const report=(version,withHje)=>({period:'2026-11',report_key:'09',title:'DO, Piutang & Forecast',version,cutoff:'2026-11-17',status:'OPEN RECON',basis:'MIXED',
 payload:{report_state:'Dokumen sumber sintetik',notice:'Harga kerja bukan piutang final',disclaimer:'OPEN RECON',tables:[{title:'Rincian Nilai DO per SKU',headers:withHje?['SKU','Nilai DO (Rp)','Nilai HJE (Rp)']:['SKU','Nilai DO (Rp)'],rows:withHje?[['UJI-016','28.000','55.100']]:[['UJI-016','36.400']]}]},source_refs:[]});
async function setup(page){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(API+'/**',route=>{
  const u=route.request().url();let body=[];
  if(u.includes('/auth/v1/token'))body={access_token:'fake-login',expires_in:3600};
  else if(u.includes('/functions/v1/ppic-owner-check'))body={authorized:true,role:'owner'};
  else if(u.includes('/rest/v1/ppic_do_customer_owner_view'))body=[sn('V012',current),sn('V011',older)];
  else if(u.includes('/rest/v1/ppic_reports_owner_view'))body=[report('V003',false),report('V002',true)];
  else if(u.includes('/auth/v1/logout'))body={};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto(ROOT);await page.locator('#ownerPassword').fill('fake-password');
 await page.locator('#loginButton').click();await expect(page.locator('#ppicMain')).toBeVisible();
 if(await page.locator('#ppicDivisionsList').isHidden())await page.locator('#ppicDivisionsToggle').click();
 await page.locator('[data-view="customers"]').click();
 await expect(page.locator('#doDetails tr')).toHaveCount(3);
 return errors;
}
test('latest V012 determines sales value; no HJE nominal is shown',async({page})=>{
 const errors=await setup(page);
 await expect(page.locator('#doStatus')).toContainText('V012');
 await expect(page.locator('#doMetrics')).toContainText('Rp 99.400');
 await expect(page.locator('#doMetrics')).not.toContainText('Nilai HJE');
 await expect(page.locator('#doSummary tr')).toHaveCount(1);
 await expect(page.locator('#doSummary').locator('xpath=..').locator('thead')).not.toContainText('Nilai HJE');
 await expect(page.locator('#doDetails')).toContainText('9.100');
 await expect(page.locator('#doDetails')).toContainText('36.400');
 await expect(page.locator('#doHje')).toHaveValue('');
 expect(errors).toEqual([]);
});
test('DO preview PDF contains only DO sale amounts and correct filtered transaction',async({page})=>{
 await setup(page);
 await page.locator('#doPrint').click();
 let html=await page.locator('#previewFrame').getAttribute('srcdoc');
 expect(html).toContain('TOTAL NILAI DO: Rp 99.400');
 expect(html).toContain('36.400');
 expect(html).toContain('Nilai DO (Rp)');
 expect(html).not.toContain('HJE');
 await page.locator('#closePreview').click();
 await page.locator('#doSku').selectOption('UJI-016');
 await page.locator('#doPrint').click();
 html=await page.locator('#previewFrame').getAttribute('srcdoc');
 expect(html).toContain('TOTAL NILAI DO: Rp 36.400');
 expect(html).toContain('Harga jual (Rp/pack)');
 expect(html).not.toContain('UJI-012');
 expect(html).not.toContain('HJE');
});
test('report catalog 09 selects V003 and PDF has no old HJE columns',async({page})=>{
 await setup(page);
 await page.locator('#closePreview').isVisible().then(async visible=>{if(visible)await page.locator('#closePreview').click()});
 await page.locator('[data-view="reports"]').click();
 const option=page.locator('#catalog button.report').nth(8);
 await option.click();
 await expect(option).toContainText('V003');
 await expect(page.locator('#reportData')).toContainText('36.400');
 await expect(page.locator('#reportData')).not.toContainText('Nilai HJE');
 await page.locator('#preview').click();
 const html=await page.locator('#previewFrame').getAttribute('srcdoc');
 expect(html).toContain('36.400');
 expect(html).not.toContain('HJE');
 expect(html).not.toContain('55.100');
});
test('logout clears DO and private report snapshots',async({page})=>{
 await setup(page);
 await page.locator('#logoutOwner').click();
 await expect(page.locator('#ppicMain')).toBeHidden();
 await expect(page.locator('#doDetails')).toBeEmpty();
 await expect(page.locator('#doPrint')).toBeDisabled();
});
