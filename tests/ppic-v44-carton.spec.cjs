const {test,expect}=require('@playwright/test');
// Fixture synthetic only. Do not publish real BAL balances or private documents to this repo.
const API='https://jryfozndxpjymggevkgq.supabase.co';
const snap=(division,opening,tariff,entries)=>({period:'2026-11',division,version:'V001',status:'OPEN RECON',payload:{
opening_qty:opening,opening_nominal:tariff===null?null:opening*tariff,tariff,valid_through:'2026-11-17',cols:['day','in_qty','out_qty'],entries}});
const daily=[
snap('CUKAI 10.325',2201,12.5,[[2,20,10],[17,10,2]]),
snap('CUKAI 13.775',1600,22.75,[[2,40,5],[17,0,15]]),
snap('CUKAI REFILL',500,null,[[3,0,100]])];
async function login(page){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(API+'/**',route=>{const u=route.request().url();let value=[];
  if(u.includes('/auth/v1/token'))value={access_token:'fake-for-testing',expires_in:3600};
  else if(u.includes('/functions/v1/ppic-owner-check'))value={authorized:true,role:'owner'};
  else if(u.includes('/rest/v1/ppic_daily_owner_view'))value=daily;
  else if(u.includes('/auth/v1/logout'))value={};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
 });
 await page.goto('http://127.0.0.1:8765/');
 await expect(page.locator('#ppicMain')).toBeHidden();
 await page.locator('#ownerPassword').fill('synthetic-password');
 await page.locator('#loginButton').click();
 await expect(page.locator('#ppicMain')).toBeVisible();
 await page.locator('[data-view="excise"]').click();
 await expect(page.locator('#exCartonSummary tr')).toHaveCount(3);
 return errors;
}
test('carton balances use distinct packs-per-carton, with no automatic Refill conversion',async({page})=>{
 const errors=await login(page);
 await expect(page.locator('#exCartonSummary tr').nth(0).locator('td')).toHaveText(['10.325 / isi 12','2.219','1.000','2,219','2','219','SALDO BUKU / OPEN RECON']);
 await expect(page.locator('#exCartonSummary tr').nth(1).locator('td')).toHaveText(['13.775 / isi 16','1.620','800','2,025','2','20','SALDO BUKU / OPEN RECON']);
 await expect(page.locator('#exCartonSummary tr').nth(2).locator('td')).toHaveText(['10.500 / Refill','400','—','—','—','—','KONVERSI REFILL BELUM TERVERIFIKASI']);
 await expect(page.locator('#exCartonMetrics')).toContainText('4 karton (dua ukuran)');
 await expect(page.locator('#exCartonDaily tr')).toHaveCount(30);
 await expect(page.locator('#exCartonDaily tr').nth(16).locator('td').nth(4)).toHaveText('2');
 await expect(page.locator('#exCartonNote')).toContainText('bukan stok fisik');
 expect(errors).toEqual([]);
});
test('historical filter recalculates cartons; future and other periods do not invent capacity',async({page})=>{
 await login(page);
 await page.locator('#exDate').fill('2026-11-02');
 await page.locator('#exDate').dispatchEvent('change');
 await expect(page.locator('#exCartonSummary tr').nth(0).locator('td').nth(5)).toHaveText('211');
 await expect(page.locator('#exCartonSummary tr').nth(1).locator('td').nth(5)).toHaveText('35');
 await page.locator('#exDate').fill('2026-11-18');
 await page.locator('#exDate').dispatchEvent('change');
 await expect(page.locator('#exCartonSummary')).toContainText('BELUM ADA DATA');
 await expect(page.locator('#exCartonSummary tr').nth(0).locator('td').nth(4)).toHaveText('—');
 await page.locator('#exPeriod').fill('2026-12');
 await page.locator('#exPeriod').dispatchEvent('change');
 await expect(page.locator('#exCartonSummary tr')).toHaveCount(0);
 await expect(page.locator('#exCartonState')).toContainText('Belum ada saldo');
});
test('print PDF preview includes capacity and logout removes private figures',async({page})=>{
 await login(page);
 await page.locator('#exPrint').click();
 const html=await page.locator('#previewFrame').getAttribute('srcdoc');
 for(const x of ['Kapasitas karton dari saldo pita','10.325 / isi 12','13.775 / isi 16','2,219','2,025','2 karton penuh + 219 pack','KONVERSI REFILL BELUM TERVERIFIKASI','bukan HJE atau HPP'])expect(html).toContain(x);
 await page.locator('#closePreview').click();
 await page.locator('#logoutOwner').click();
 await expect(page.locator('#ppicMain')).toBeHidden();
 await expect(page.locator('#exCartonSummary tr')).toHaveCount(0);
 await expect(page.locator('#exCartonDaily tr')).toHaveCount(0);
 await expect(page.locator('#previewFrame')).toHaveAttribute('srcdoc','');
});
test('mobile carton panel is scrollable without widening the page',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await login(page);
 const g=await page.locator('#exCartonCapacity').evaluate(el=>({box:el.getBoundingClientRect().width,screen:window.innerWidth,wrap:[...el.querySelectorAll('.tablewrap')].map(w=>({box:w.getBoundingClientRect().width,scroll:w.scrollWidth}))}));
 expect(g.box).toBeLessThanOrEqual(g.screen);
 expect(g.wrap.every(x=>x.box<=g.box&&x.scroll>=x.box)).toBe(true);
});