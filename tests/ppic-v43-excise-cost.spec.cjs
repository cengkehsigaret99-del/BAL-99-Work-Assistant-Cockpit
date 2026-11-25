const {test,expect}=require('@playwright/test');
const {browserSnapshot,loginCukai}=require('./fixtures/cukai-browser.cjs');

// The active Pita Cukai screen now uses the canonical RPC. Legacy fiscal reports
// cannot supply or revalue its balances; decimal source values and unknowns survive.
test('canonical source preserves three-decimal valuation without legacy revaluation',async({page})=>{
 const source=browserSnapshot();source.hjes[0].closingValue=19662.555;
 const {errors}=await loginCukai(page,{source});
 await expect(page.locator('#cukaiSourceTables tbody tr').nth(0).locator('td').nth(5)).toHaveText('1.300');
 await expect(page.locator('#cukaiSourceTables tbody tr').nth(1).locator('td').nth(5)).toHaveText('90');
 await expect(page.locator('#cukaiSourceMetrics')).toContainText('1.460 keping');
 await expect(page.locator('#cukaiSourcePanel')).not.toContainText('88.888');
 await expect(page.locator('#cukaiSourceMeta')).toContainText('WORKING / OPEN RECON');
 await page.locator('#cukaiSourcePrint').click();
 const html=await page.locator('#previewFrame').getAttribute('srcdoc');
 for(const value of ['Nominal sesuai sumber','19.662,555','SYNTHETIC COST',source.source_snapshot_id,source.payload_hash])expect(html).toContain(value);
 expect(html).not.toContain('LEGACY MUST NOT REPLACE CANONICAL');
 expect(errors).toEqual([]);
});

test('Refill retains unknown valuation, physical count and carton conversion',async({page})=>{
 await loginCukai(page);
 await page.locator('#cukaiSourcePool').selectOption('UJI-REFILL');
 const cells=page.locator('#cukaiSourceTables tbody tr').locator('td');
 await expect(cells.nth(5)).toHaveText('70');
 for(const index of [6,7,8,9])await expect(cells.nth(index)).toHaveText('Belum tersedia');
 await page.locator('#cukaiSourcePrint').click();
 const frame=page.frameLocator('#previewFrame');
 const values=frame.locator('table').nth(1).locator('tbody tr td');
 for(const index of [1,2,3,4])await expect(values.nth(index)).toHaveText('Belum tersedia');
});

test('usage date filters exclude later rows while balances stay pinned to the source cut-off',async({page})=>{
 await loginCukai(page);
 await page.locator('#cukaiSourcePool').selectOption('UJI-A');
 await page.locator('#cukaiSourceTo').fill('2026-11-02');
 await page.locator('#cukaiSourceTo').dispatchEvent('change');
 await expect(page.locator('#cukaiSourceUsage tbody tr')).toHaveCount(1);
 await expect(page.locator('#cukaiSourceUsage tbody tr td').nth(3)).toHaveText('100');
 await expect(page.locator('#cukaiSourceTables tbody tr td').nth(5)).toHaveText('1.300');
 await expect(page.locator('#cukaiSourceMeta')).toContainText('Saldo buku per 2026-11-25');
 await page.locator('#cukaiSourceTo').fill('2026-11-26');
 await page.locator('#cukaiSourceTo').dispatchEvent('change');
 await expect(page.locator('#cukaiSourceStatus')).toContainText('Rentang tanggal pemakaian tidak valid');
 await expect(page.locator('#cukaiSourcePrint')).toBeDisabled();
 await expect(page.locator('#cukaiSourceTables')).toBeEmpty();
});

test('missing period clears current values and cannot fall back to legacy costing',async({page})=>{
 const {state}=await loginCukai(page);
 await page.locator('#cukaiSourcePeriod').fill('2026-12');
 await page.locator('#cukaiSourcePeriod').dispatchEvent('change');
 await expect(page.locator('#cukaiSourceStatus')).toContainText('Belum ada publikasi Robot Cukai');
 await expect(page.locator('#cukaiSourceTables')).toBeEmpty();
 await expect(page.locator('#cukaiSourceMetrics')).toBeEmpty();
 await expect(page.locator('#cukaiSourcePrint')).toBeDisabled();
 await expect(page.locator('#exCostContent')).toBeHidden();
 state.source=browserSnapshot(2);state.source.hjes[0].closingValue=null;
 await page.locator('#cukaiSourcePeriod').fill('2026-11');
 await page.locator('#cukaiSourcePeriod').dispatchEvent('change');
 await expect(page.locator('#cukaiSourceMeta')).toContainText('revisi 2');
 await page.locator('#cukaiSourcePrint').click();
 await expect(page.frameLocator('#previewFrame').locator('table').nth(1).locator('tbody tr').first().locator('td').nth(4)).toHaveText('Belum tersedia');
});

test('PDF uses one source revision and selected usage range; refresh cannot mutate it and logout clears it',async({page})=>{
 const {state,errors}=await loginCukai(page);
 await page.locator('#cukaiSourcePool').selectOption('UJI-A');
 await page.locator('#cukaiSourceTo').fill('2026-11-02');
 await page.locator('#cukaiSourceTo').dispatchEvent('change');
 await page.locator('#cukaiSourcePrint').click();
 const html=await page.locator('#previewFrame').getAttribute('srcdoc');
 for(const text of ['revisi 1','2026-11-01 sampai 2026-11-02','Pita Uji A / UJI-A','1.300',state.source.source_snapshot_id])expect(html).toContain(text);
 expect(html).not.toContain('Refill Uji');
 state.source=browserSnapshot(2,50);
 await page.evaluate(()=>window.ppicRefreshCukaiSource());
 await expect(page.locator('#cukaiSourceMeta')).toContainText('revisi 2');
 await expect(page.locator('#previewFrame')).toHaveAttribute('srcdoc',html);
 await page.evaluate(()=>{window.__fixturePrints=0;document.getElementById('previewFrame').contentWindow.print=()=>window.__fixturePrints++;});
 await page.locator('#printPreview').click();
 expect(await page.evaluate(()=>window.__fixturePrints)).toBe(1);
 await page.locator('#closePreview').click();
 await page.locator('#logoutOwner').click();
 await expect(page.locator('#ppicMain')).toBeHidden();
 await expect(page.locator('#cukaiSourceTables')).toBeEmpty();
 await expect(page.locator('#cukaiSourceMeta')).toBeEmpty();
 await expect(page.locator('#previewModal')).toBeHidden();
 await expect(page.locator('#previewFrame')).toHaveAttribute('srcdoc','');
 expect(errors).toEqual([]);
});

test('source labels are escaped in both the active screen and pinned PDF',async({page})=>{
 const source=browserSnapshot();source.hjes[0].label='<img src=x onerror=alert(1)>';
 source.valuation_method='<script>alert(1)</script>';
 await loginCukai(page,{source});
 await expect(page.locator('#cukaiSourceTables img')).toHaveCount(0);
 await expect(page.locator('#cukaiSourceTables tbody tr').first().locator('td').first()).toHaveText('<img src=x onerror=alert(1)> / UJI-A');
 await page.locator('#cukaiSourcePrint').click();
 const html=await page.locator('#previewFrame').getAttribute('srcdoc');
 expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
 expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
 expect(html).not.toContain('<img src=x');
 await expect(page.frameLocator('#previewFrame').locator('script')).toHaveCount(0);
});

test('desktop and mobile canonical tables remain contained inside the excise panel',async({page},testInfo)=>{
 await page.setViewportSize({width:1440,height:1080});
 await loginCukai(page);
 await page.locator('#cukaiSourcePanel').screenshot({path:testInfo.outputPath('cukai-desktop-synthetic.png')});
 await page.setViewportSize({width:390,height:844});
 await expect(page.locator('#cukaiSourcePanel')).toBeVisible();
 const geometry=await page.locator('#cukaiSourcePanel').evaluate(el=>({width:el.getBoundingClientRect().width,viewport:innerWidth,page:document.documentElement.scrollWidth,wrappers:[...el.querySelectorAll('.tablewrap')].map(x=>x.getBoundingClientRect().width)}));
 expect(geometry.width).toBeLessThanOrEqual(geometry.viewport);
 expect(geometry.page).toBeLessThanOrEqual(geometry.viewport+2);
 for(const width of geometry.wrappers)expect(width).toBeLessThanOrEqual(geometry.width);
 await page.locator('#cukaiSourcePanel').screenshot({path:testInfo.outputPath('cukai-mobile-synthetic.png')});
});
