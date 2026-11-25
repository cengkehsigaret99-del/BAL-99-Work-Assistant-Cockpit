const {test,expect}=require('@playwright/test');
const {loginCukai}=require('./fixtures/cukai-browser.cjs');

// Canonical v1 has no verified carton master. Legacy HJE constants must not
// manufacture capacity or combine distinct source pools sharing the same HJE.
test('distinct source pools retain their balances without inferring carton factors from HJE',async({page})=>{
 const {errors}=await loginCukai(page);
 const rows=page.locator('#cukaiSourceTables tbody tr');
 await expect(rows).toHaveCount(3);
 await expect(rows.nth(0).locator('td').nth(1)).toHaveText('10.001');
 await expect(rows.nth(1).locator('td').nth(1)).toHaveText('10.001');
 await expect(rows.nth(0).locator('td').nth(5)).toHaveText('1.300');
 await expect(rows.nth(1).locator('td').nth(5)).toHaveText('90');
 for(let index=0;index<3;index++)await expect(rows.nth(index).locator('td').nth(9)).toHaveText('Belum tersedia');
 await expect(page.locator('#cukaiSourcePanel')).toContainText('faktor karton belum tersedia');
 await expect(page.locator('#exCartonCapacity')).toBeHidden();
 expect(errors).toEqual([]);
});

test('date filtering preserves cut-off quantities and never invents historical or future carton capacity',async({page})=>{
 await loginCukai(page);
 await page.locator('#cukaiSourcePool').selectOption('UJI-A');
 await page.locator('#cukaiSourceTo').fill('2026-11-02');
 await page.locator('#cukaiSourceTo').dispatchEvent('change');
 await expect(page.locator('#cukaiSourceUsage tbody tr')).toHaveCount(1);
 await expect(page.locator('#cukaiSourceTables tbody tr td').nth(5)).toHaveText('1.300');
 await expect(page.locator('#cukaiSourceTables tbody tr td').nth(9)).toHaveText('Belum tersedia');
 await page.locator('#cukaiSourceTo').fill('2026-11-26');
 await page.locator('#cukaiSourceTo').dispatchEvent('change');
 await expect(page.locator('#cukaiSourcePrint')).toBeDisabled();
 await expect(page.locator('#cukaiSourceTables')).toBeEmpty();
 await page.locator('#cukaiSourcePeriod').fill('2026-12');
 await page.locator('#cukaiSourcePeriod').dispatchEvent('change');
 await expect(page.locator('#cukaiSourceStatus')).toContainText('Belum ada publikasi');
 await expect(page.locator('#cukaiSourceMetrics')).toBeEmpty();
});

test('PDF explains unavailable conversion and logout removes every private figure',async({page})=>{
 await loginCukai(page);
 await page.locator('#cukaiSourcePrint').click();
 const html=await page.locator('#previewFrame').getAttribute('srcdoc');
 for(const text of ['Sumber: Robot Cukai','Pita Uji A / UJI-A','Pita Uji B, jenis berbeda / UJI-B','Refill Uji / UJI-REFILL','faktor karton belum tersedia','Belum tersedia'])expect(html).toContain(text);
 expect(html).not.toContain('karton penuh +');
 await page.locator('#closePreview').click();
 await page.locator('#logoutOwner').click();
 await expect(page.locator('#ppicMain')).toBeHidden();
 await expect(page.locator('#cukaiSourceTables')).toBeEmpty();
 await expect(page.locator('#cukaiSourceUsage')).toBeEmpty();
 await expect(page.locator('#previewFrame')).toHaveAttribute('srcdoc','');
});

test('mobile canonical balance tables scroll internally without widening the page',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await loginCukai(page);
 const geometry=await page.locator('#cukaiSourcePanel').evaluate(el=>({box:el.getBoundingClientRect().width,screen:innerWidth,page:document.documentElement.scrollWidth,wrap:[...el.querySelectorAll('.tablewrap')].map(w=>({box:w.getBoundingClientRect().width,scroll:w.scrollWidth}))}));
 expect(geometry.box).toBeLessThanOrEqual(geometry.screen);
 expect(geometry.page).toBeLessThanOrEqual(geometry.screen+2);
 expect(geometry.wrap.length).toBe(2);
 expect(geometry.wrap.every(x=>x.box<=geometry.box&&x.scroll+1>=x.box)).toBe(true);
});
