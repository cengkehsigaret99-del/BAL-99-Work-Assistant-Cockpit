const {test,expect}=require('@playwright/test');
const {loginCukai}=require('./fixtures/cukai-browser.cjs');

// The old report is retained for historical reference, but must never override
// the authoritative Cukai screen or manufacture a tariff or a carton factor.
test('legacy HJE controls are hidden; canonical source keeps unknown refill values',async({page})=>{
 const {state,errors}=await loginCukai(page);
 await expect(page.locator('#exHje')).toBeHidden();
 await expect(page.locator('#exPrint')).toBeHidden();
 await expect(page.locator('#cukaiSourcePanel')).toBeVisible();
 expect(state.hits).toBeGreaterThan(0);
 await expect(page.locator('#cukaiSourceMetrics')).toContainText('1.460 keping');
 await expect(page.locator('#cukaiSourcePanel')).not.toContainText('88.888');
 await page.locator('#cukaiSourcePool').selectOption('UJI-REFILL');
 const row=page.locator('#cukaiSourceTables tbody tr');
 await expect(row).toHaveCount(1);
 await expect(row.locator('td').nth(5)).toHaveText('70');
 for(const i of [6,7,8,9])await expect(row.locator('td').nth(i)).toHaveText('Belum tersedia');
 expect(errors).toEqual([]);
});

test('canonical PDF identifies the source and never substitutes legacy values',async({page})=>{
 const {state,errors}=await loginCukai(page);
 await expect(page.locator('#exPrint')).toBeHidden();
 await page.locator('#cukaiSourcePrint').click();
 const html=await page.locator('#previewFrame').getAttribute('srcdoc');
 for(const value of ['Sumber: Robot Cukai','Pita Uji A / UJI-A','Pita Uji B, jenis berbeda / UJI-B','Refill Uji / UJI-REFILL','Belum tersedia',state.source.source_snapshot_id,state.source.payload_hash])expect(html).toContain(value);
 expect(html).not.toContain('LEGACY MUST NOT REPLACE CANONICAL');
 expect(html).not.toContain('88.888');
 expect(errors).toEqual([]);
});
