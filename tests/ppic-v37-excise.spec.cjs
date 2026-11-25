const {test,expect}=require('@playwright/test');
const {browserSnapshot,loginCukai}=require('./fixtures/cukai-browser.cjs');

// V3.7 smoke coverage follows the active canonical screen; no legacy figures or
// fabricated full-month rows are used when the publication lacks daily receipts.
test('source pool balances and unknown Refill values survive filtering without invented capacity',async({page})=>{
 const source=browserSnapshot();
 source.daily_usage.push({date:'2026-11-04',hje:10500,source_hje_id:'UJI-REFILL',quantity:null});
 const {errors}=await loginCukai(page,{source});
 await expect(page.locator('#cukaiSourceTables tbody tr')).toHaveCount(3);
 await expect(page.locator('#cukaiSourceMetrics')).toContainText('1.460 keping');
 await expect(page.locator('#cukaiSourceUsage tbody tr')).toHaveCount(5);
 await page.locator('#cukaiSourcePool').selectOption('UJI-REFILL');
 await expect(page.locator('#cukaiSourceTables tbody tr td').nth(5)).toHaveText('70');
 await expect(page.locator('#cukaiSourceTables tbody tr td').nth(9)).toHaveText('Belum tersedia');
 await expect(page.locator('#cukaiSourceUsage tbody tr')).toHaveCount(2);
 await expect(page.locator('#cukaiSourceUsage tbody tr').nth(1).locator('td').nth(3)).toHaveText('Belum tersedia');
 await page.locator('#cukaiSourceTo').fill('2026-11-26');
 await page.locator('#cukaiSourceTo').dispatchEvent('change');
 await expect(page.locator('#cukaiSourceStatus')).toContainText('Rentang tanggal pemakaian tidak valid');
 await expect(page.locator('#cukaiSourcePrint')).toBeDisabled();
 expect(errors).toEqual([]);
});

test('PDF prints every source pool and only supplied usage dates with valuation caveats',async({page})=>{
 const {state,errors}=await loginCukai(page);
 await page.locator('#cukaiSourcePrint').click();
 const html=await page.locator('#previewFrame').getAttribute('srcdoc');
 for(const text of ['Pita Uji A / UJI-A','Pita Uji B, jenis berbeda / UJI-B','Refill Uji / UJI-REFILL','Saldo buku per 2026-11-25','Nominal sesuai sumber','Penerimaan harian belum tersedia','Tanggal tanpa catatan tidak berarti pemakaian nol',state.source.source_snapshot_id])expect(html).toContain(text);
 expect(html).not.toContain('2026-11-30');
 await expect(page.frameLocator('#previewFrame').locator('table').nth(2).locator('tbody tr')).toHaveCount(state.source.daily_usage.length);
 expect(errors).toEqual([]);
});
