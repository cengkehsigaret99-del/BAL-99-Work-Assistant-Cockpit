const {test,expect}=require('@playwright/test');
const API='https://jryfozndxpjymggevkgq.supabase.co',ROOT='http://127.0.0.1:8765/';
// Synthetic fixtures only: no real company/customer/sales data committed.
const base=[
{sj:401,date:'2026-11-08',customer:'PELANGGAN UJI A',destination:'AREA UJI A',area:'AREA UJI',sku:'SKU-UJI-12',brand:'PRODUK UJI ISI 12',hje:10325,kind:'REGULER',pack:10,price:6500,nominal:65000,basis:'KONFIRMASI USER V11'},
{sj:401,date:'2026-11-08',customer:'PELANGGAN UJI A',destination:'AREA UJI A',area:'AREA UJI',sku:'SKU-UJI-16',brand:'PRODUK UJI ISI 16',hje:13775,kind:'REGULER',pack:20,price:8400,nominal:168000,basis:'HISTORIS'},
{sj:401,date:'2026-11-08',customer:'PELANGGAN UJI A',destination:'AREA UJI A',area:'AREA UJI',sku:'SKU-SAMPLE',brand:'SAMPLE UJI',hje:10325,kind:'SAMPEL',pack:5,price:0,nominal:0,basis:'SAMPEL'},
{sj:402,date:'2026-11-09',customer:'PELANGGAN UJI B',destination:'AREA UJI B',area:'AREA UJI',sku:'SKU-UJI-R',brand:'REFILL UJI',hje:10500,kind:'REGULER',pack:4,price:10500,nominal:42000,basis:'JURNAL'}
];
const makeSnap=(version,rows)=>({period:'2026-11',cutoff:'2026-11-17',version,status:'OPEN RECON',rows,source_document_id:'SYNTHETIC_TEST_DOC'});
async function enter(page,snaps=[makeSnap('V011',base),makeSnap('V010',base)]){
 const errs=[];page.on('pageerror',x=>errs.push(x.message));
 await page.route(API+'/**',route=>{
  let v=[];const url=route.request().url();
  if(url.includes('/auth/v1/token'))v={access_token:'test-token',expires_in:3600};
  else if(url.includes('/functions/v1/ppic-owner-check'))v={authorized:true,role:'owner'};
  else if(url.includes('/rest/v1/ppic_do_customer_owner_view'))v=snaps;
  else if(url.includes('/auth/v1/logout'))v={};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(v)});
 });
 await page.goto(ROOT);
 await expect(page.locator('#ppicMain')).toBeHidden();
 await page.locator('#ownerPassword').fill('test-only');
 await page.locator('#loginButton').click();
 await expect(page.locator('#ppicMain')).toBeVisible();
 await page.locator('[data-view="customers"]').click();
 await expect(page.locator('#doDetails tr')).toHaveCount(snaps.at(0)?.rows?.length||0);
 return errs;
}
test('latest priced V011 shows distinct DO nominal and HJE values',async({page})=>{
 const errs=await enter(page);
 await expect(page.locator('#doStatus')).toContainText('V011');
 await expect(page.locator('#doStatus')).toContainText('0 pack tanpa harga kerja');
 await expect(page.locator('#doMetrics')).toContainText('Rp 275.000');
 await expect(page.locator('#doMetrics')).toContainText('Rp 472.375');
 await expect(page.locator('#doSummary tr')).toHaveCount(2);
 await expect(page.locator('#doSJSummary tr')).toHaveCount(2);
 await expect(page.locator('#doSummary tr').first().locator('td').nth(5)).toHaveText('233.000');
 await expect(page.locator('#doDetails tr').first().locator('td').nth(12)).toHaveText('103.250');
 await expect(page.locator('#doCharts svg')).toHaveCount(2);
 expect(errs).toEqual([]);
});
test('PDF includes nominal per customer and SJ; filters and sample Rp0 are retained',async({page})=>{
 await enter(page);
 await page.locator('#doPrint').click();
 const src=await page.locator('#previewFrame').getAttribute('srcdoc');
 for(const x of ['Nominal DO harga kerja: Rp 275.000','Nilai HJE pembanding: Rp 472.375','Rekap per Surat Jalan','Nominal DO (Rp)','Harga kerja','KONFIRMASI USER V11','SAMPEL'])expect(src).toContain(x);
 await page.locator('#closePreview').click();
 await page.locator('#doCustomer').selectOption('PELANGGAN UJI B');
 await expect(page.locator('#doSummary tr')).toHaveCount(1);
 await expect(page.locator('#doSJSummary tr')).toHaveCount(1);
 await page.locator('#doPrint').click();
 const filtered=await page.locator('#previewFrame').getAttribute('srcdoc');
 expect(filtered).toContain('PELANGGAN UJI B');expect(filtered).not.toContain('PELANGGAN UJI A');
});
test('old incomplete price snapshots remain partial and do not create imaginary sales values',async({page})=>{
 const old=base.map(x=>x.sj===401&&x.sku==='SKU-UJI-12'?{...x,price:null,nominal:null,basis:'BELUM ADA HARGA'}:x);
 await enter(page,[makeSnap('V010',old)]);
 await expect(page.locator('#doStatus')).toContainText('10 pack tanpa harga kerja');
 await expect(page.locator('#doMetrics')).toContainText('Nominal DO kerja parsial');
 await expect(page.locator('#doMetrics')).toContainText('Rp 210.000');
 await expect(page.locator('#doDetails tr').first().locator('td').nth(11)).toHaveText('—');
 await expect(page.locator('#doDetails tr').first().locator('td').nth(12)).toHaveText('103.250');
});
test('logout and missing period clear nominal from DOM and close PDF',async({page})=>{
 await enter(page);
 await page.locator('#doPeriod').fill('2026-10');
 await page.locator('#doPeriod').dispatchEvent('change');
 await expect(page.locator('#doDetails')).toBeEmpty();
 await expect(page.locator('#doSJSummary')).toBeEmpty();
 await expect(page.locator('#doPrint')).toBeDisabled();
 await page.locator('#doPeriod').fill('2026-11');
 await page.locator('#doPeriod').dispatchEvent('change');
 await page.locator('#doPrint').click();
 await page.locator('#logoutOwner').click();
 await expect(page.locator('#ppicMain')).toBeHidden();
 await expect(page.locator('#doDetails')).toBeEmpty();
 await expect(page.locator('#doSJSummary')).toBeEmpty();
 await expect(page.locator('#previewFrame')).toHaveAttribute('srcdoc','');
});
test('mobile report tables scroll instead of widening viewport',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await enter(page);
 const view=await page.locator('#customers').evaluate(el=>({panel:el.getBoundingClientRect().width,viewport:window.innerWidth,tables:[...el.querySelectorAll('.tablewrap')].map(w=>({width:w.getBoundingClientRect().width,scroll:w.scrollWidth}))}));
 expect(view.panel).toBeLessThanOrEqual(view.viewport);
 for(const item of view.tables)expect(item.width).toBeLessThanOrEqual(view.panel);
});