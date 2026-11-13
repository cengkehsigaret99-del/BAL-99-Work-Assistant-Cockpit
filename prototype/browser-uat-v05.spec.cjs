const { test, expect } = require('@playwright/test');
const base='http://127.0.0.1:8765/prototype/BAL_INTERACTIVE_WEBSITE_V05.html';
test('Dashboard navigation and sample data warning',async({page})=>{
 await page.goto(base);
 await expect(page.getByText('INTERACTIVE DEMO')).toBeVisible();
 await expect(page.getByText('307.775')).toBeVisible();
 await page.getByRole('button',{name:'Data Explorer'}).click();
 await expect(page.getByRole('heading',{name:'Jelajahi bank data'})).toBeVisible();
 await page.getByRole('button',{name:'Pusat Laporan'}).click();
 await expect(page.getByText('Laporan 01')).toBeVisible();
});
test('Explorer filters and document drill-down',async({page})=>{
 await page.goto(base);
 await page.getByRole('button',{name:'Data Explorer'}).click();
 await page.getByRole('textbox',{name:'Cari dokumen'}).fill('Packing');
 await expect(page.locator('#rows tr')).toHaveCount(1);
 await page.locator('#rows tr').first().click();
 await expect(page.locator('#detail')).toContainText('Contoh laporan Packing');
 await page.getByRole('textbox',{name:'Cari dokumen'}).fill('tidak-ada');
 await expect(page.locator('#rows tr')).toHaveCount(0);
});
test('Report catalog has 13 choices',async({page})=>{
 await page.goto(base);
 await page.getByRole('button',{name:'Pusat Laporan'}).click();
 await expect(page.locator('#reportlist button')).toHaveCount(13);
 await page.getByRole('button',{name:/07 · HPP Full Costing/}).click();
 await expect(page.locator('#reporttitle')).toHaveText('HPP Full Costing per SKU');
});
test('CSV download and PDF print rendering',async({page})=>{
 await page.goto(base);
 await page.getByRole('button',{name:'Pusat Laporan'}).click();
 const downloadPromise=page.waitForEvent('download');
 await page.getByRole('button',{name:'Ekspor katalog CSV'}).click();
 const download=await downloadPromise;
 expect(download.suggestedFilename()).toMatch(/BAL_REPORT_CATALOG_DEMO\.csv/);
 await page.pdf({path:'artifacts/BAL_PPIC_V05_PRINT_TEST.pdf',format:'A4',landscape:true,printBackground:true});
});
test('Mobile 360px layout and screenshot',async({page})=>{
 await page.setViewportSize({width:360,height:800});
 await page.goto(base);
 await expect(page.getByRole('button',{name:'Pusat Laporan'})).toBeVisible();
 await page.screenshot({path:'artifacts/BAL_PPIC_V05_MOBILE_360.png',fullPage:true});
});
