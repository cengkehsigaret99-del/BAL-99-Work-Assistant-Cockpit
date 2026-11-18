const {test,expect}=require('@playwright/test');
const zlib=require('zlib');
const API='https://jryfozndxpjymggevkgq.supabase.co',ROOT='http://127.0.0.1:8765/';
const sample={
 w:[['GILING','GTEST01','PEKERJA UJI GILING A'],['GILING','GTEST02','PEKERJA UJI GILING B'],['VERPACK','PTEST01','PEKERJA UJI VERPACK']],
 b:['—','GCC 99','CB 77'],s:['NORMAL','BELUM ADA HASIL · ABSENSI BELUM VERIFIKASI'],
 r:[[0,13,1,3200,128000,0],[0,14,1,2800,112000,0],[1,13,2,1500,60000,0],[1,14,0,0,0,1],[2,13,1,400,72000,0]],
 meta:{cutoff:'2026-11-17',summaries:{'SDM GILING':{upahTanpaHasil:0},'SDM VERPACK':{upahTanpaHasil:0}}}
};
const pack=d=>({codec:'zlib-base64',data:zlib.deflateSync(Buffer.from(JSON.stringify(d))).toString('base64'),meta:d.meta});
const snap=(data,version='V010')=>({period:'2026-11',version,cutoff:'2026-11-17',status:'WORKING / OPEN RECON',payload:pack(data)});
async function login(page,data=[snap(sample)],docs=[]){
 const errors=[];
 page.on('pageerror',x=>errors.push(x.message));
 await page.route(API+'/**',route=>{
  const u=route.request().url();
  let body=[];
  if(u.includes('/auth/v1/token'))body={access_token:'synthetic-test-token',expires_in:3600};
  else if(u.includes('/functions/v1/ppic-owner-check'))body={authorized:true,role:'owner'};
  else if(u.includes('/rest/v1/ppic_sdm_weekly_owner_view'))body=data;
  else if(u.includes('/rest/v1/ppic_source_catalog'))body=docs;
  else if(u.includes('/auth/v1/logout'))body={};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto(ROOT);
 await page.locator('#ownerPassword').fill('synthetic-test-password');
 await page.locator('#loginButton').click();
 await expect(page.locator('#ppicMain')).toBeVisible();
 await page.locator('[data-view="sdm"]').click();
 await expect(page.locator('#sdmPeople tr').first()).toBeVisible();
 return errors;
}
test('first print page shows per-brand wages and separate unit totals, next page employees',async({page})=>{
 const errors=await login(page);
 await expect(page.locator('#sdmByBrand tr')).toHaveCount(3);
 await expect(page.locator('#sdmByBrand')).toContainText('GCC 99');
 await expect(page.locator('#sdmByBrand')).toContainText('CB 77');
 await expect(page.locator('#sdmByBrand')).toContainText('7.500');
 await expect(page.locator('#sdmByBrand')).toContainText('300.000');
 await page.locator('#sdmPrint').click();
 const html=await page.locator('#previewFrame').getAttribute('srcdoc');
 expect(html.indexOf('summary-page')).toBeLessThan(html.indexOf('employees-page'));
 expect(html.indexOf('employees-page')).toBeLessThan(html.indexOf('daily-page'));
 expect(html).toContain('RINCIAN HASIL &amp; UPAH PER MEREK');
 expect(html).toContain('7.500');
 expect(html).toContain('300.000');
 expect(html).toContain('PEKERJA UJI GILING A');
 expect(html).not.toContain('[object Object]');
 expect(errors).toEqual([]);
});
test('combined report does not add pack and batang as a single physical quantity',async({page})=>{
 await login(page);
 await page.locator('#sdmDiv').selectOption('GABUNGAN');
 await expect(page.locator('#sdmByBrand tr')).toHaveCount(6);
 await expect(page.locator('#sdmMetrics')).toContainText('7.500 batang');
 await expect(page.locator('#sdmMetrics')).toContainText('400 pack');
 await expect(page.locator('#sdmMetrics')).toContainText('372.000');
 await page.locator('#sdmPrint').click();
 const html=await page.locator('#previewFrame').getAttribute('srcdoc');
 expect(html).toContain('TOTAL GILING');expect(html).toContain('TOTAL VERPACK');
 expect(html).toContain('TOTAL NOMINAL GABUNGAN');
 expect(html).toContain('7.500');expect(html).toContain('400');
 expect(html).toContain('372.000');
});
test('old worker name objects are not printed as raw Object placeholder',async({page})=>{
 const old=structuredClone(sample);old.w[0][2]='[object Object]';
 await login(page,[snap(old,'V009')],[]);
 await expect(page.locator('#sdmPeople')).toContainText('NAMA PERLU REPROSES (GTEST01)');
 await page.locator('#sdmPrint').click();
 const html=await page.locator('#previewFrame').getAttribute('srcdoc');
 expect(html).not.toContain('[object Object]');
 expect(html).toContain('NAMA PERLU REPROSES');
 await page.locator('#closePreview').click();
 await page.locator('#logoutOwner').click();
 await expect(page.locator('#sdmByBrand')).toBeEmpty();
 await expect(page.locator('#sdmPeople')).toBeEmpty();
 await expect(page.locator('#sdmPrint')).toBeDisabled();
});
test('changing brand filter recalculates first-page totals from only selected source rows',async({page})=>{
 await login(page);
 await page.locator('#sdmBrand').selectOption('CB 77');
 await expect(page.locator('#sdmByBrand tr')).toHaveCount(2);
 await expect(page.locator('#sdmByBrand')).toContainText('1.500');
 await expect(page.locator('#sdmByBrand')).toContainText('60.000');
 await expect(page.locator('#sdmByBrand')).not.toContainText('GCC 99');
 await page.locator('#sdmPrint').click();
 const html=await page.locator('#previewFrame').getAttribute('srcdoc');
 expect(html).toContain('Rp 60.000');
 expect(html).toContain('1.500');
 expect(html).toContain('CB 77');
});
