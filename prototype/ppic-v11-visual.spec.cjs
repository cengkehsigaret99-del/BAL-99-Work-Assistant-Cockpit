const {test,expect}=require('@playwright/test');
const base='http://127.0.0.1:8765/';
test('mobile navigation and layout',async({page})=>{
 await page.setViewportSize({width:360,height:800});await page.goto(base);
 await expect(page.getByText('BAL / PPIC Control Tower')).toBeVisible();
 await page.getByRole('button',{name:'Laporan & Cetak'}).click();
 await expect(page.locator('#catalog .report')).toHaveCount(13);
 await expect(page.locator('#reporttitle')).toContainText('Supply');
 await page.screenshot({path:'artifacts/ppic-mobile-360.png',fullPage:true});
});
test('preview A4 and print',async({page})=>{
 await page.goto(base);await page.getByRole('button',{name:'Laporan & Cetak'}).click();
 await page.getByRole('button',{name:'Preview PDF / Cetak'}).click();
 await expect(page.getByRole('dialog',{name:'Pratinjau laporan sebelum cetak'})).toBeVisible();
 const html=await page.locator('#previewFrame').getAttribute('srcdoc');
 expect(html).toContain('size:A4 portrait');
 expect(html).toContain('Belum tersedia');
 await page.screenshot({path:'artifacts/ppic-preview-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Tutup'}).click();
 await expect(page.locator('#previewModal')).toBeHidden();
});
test('WhatsApp shares only public catalog link',async({page})=>{
 await page.goto(base);await page.getByRole('button',{name:'Laporan & Cetak'}).click();
 await page.evaluate(()=>{window.__opened=[];window.open=(...args)=>{window.__opened.push(args);return null}});
 await page.getByRole('button',{name:'Kirim via WhatsApp'}).click();
 const u=await page.evaluate(()=>window.__opened[0][0]);
 expect(u).toMatch(/^https:\/\/wa\.me\/\?text=/);
 expect(decodeURIComponent(u)).toContain('rincian aktual belum tersedia');
});
test('no invented operational figures and empty bank data',async({page})=>{
 await page.goto(base);
 await expect(page.getByText('Belum terhubung').first()).toBeVisible();
 await page.getByRole('button',{name:'Bank Data'}).click();
 await expect(page.locator('#docs tr')).toHaveCount(0);
});
