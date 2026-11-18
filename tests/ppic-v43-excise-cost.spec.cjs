const {test,expect}=require('@playwright/test');

// All business quantities, costs and document numbers below are synthetic fixtures.
// Production/private source documents must never be copied into this repository.
const API='https://jryfozndxpjymggevkgq.supabase.co';
const fixtureCost=()=>({
  schema_version:1,document_date:'2026-11-13',ck1_number:'TEST-CK1',sppr_number:'TEST-SPPR',
  status:'WORKING / OPEN RECON',valuation_label:'Biaya fiskal bruto pita',
  notice:'Acuan biaya dokumen 13 November. Tanggal saldo memfilter stok; dokumen ini bukan bukti pembayaran atau penerimaan fisik.',
  rows:[
    {division:'CUKAI 10.325',sku:'SKU UJI ISI 12',hje:10325,sticks_per_pack:12,sheets:500,stamps:60000,reams:1,stamps_per_sheet:120,sheets_per_ream:500,packs_per_carton:1000,excise_per_stamp:12.5,vat_per_stamp:1.375,tobacco_tax_per_stamp:1.25,gross_per_stamp:15.125,gross_per_ream:907500,gross_per_carton:15125,excise_total:750000,vat_total:82500,tobacco_tax_total:75000,gross_total:907500},
    {division:'CUKAI 13.775',sku:'SKU UJI ISI 16',hje:13775,sticks_per_pack:16,sheets:500,stamps:60000,reams:1,stamps_per_sheet:120,sheets_per_ream:500,packs_per_carton:800,excise_per_stamp:22.75,vat_per_stamp:2.525,tobacco_tax_per_stamp:2.275,gross_per_stamp:27.55,gross_per_ream:1653000,gross_per_carton:22040,excise_total:1365000,vat_total:151500,tobacco_tax_total:136500,gross_total:1653000}
  ],
  totals:{sheets:1000,stamps:120000,reams:2,excise:2115000,vat:234000,tobacco_tax:211500,gross:2560500},
  reconciliation:[{label:'Cukai',source:2115000,calculated:2115000,difference:0},{label:'PPN HT',source:234000,calculated:234000,difference:0},{label:'Pajak rokok',source:211500,calculated:211500,difference:0},{label:'Total bruto',source:2560500,calculated:2560500,difference:0}],
  sources:[{title:'CK-1 uji privat',date:'2026-11-13',url:'https://example.invalid/ck1'},{title:'SPPR uji privat',date:'2026-11-13',url:'https://example.invalid/sppr'}],
  evidence_status:[{stage:'CK-1 / SPPR',status:'DOKUMEN TERSEDIA',note:'Angka uji sintetis'},{stage:'Pembayaran',status:'BELUM DIVERIFIKASI',note:'Tunai adalah cara pembayaran.'},{stage:'Penerimaan fisik',status:'BELUM DIVERIFIKASI',note:'Jumlah pesanan tidak membuktikan stok diterima.'}],
  exclusions:['Belum termasuk biaya potong, bahan baku, upah dan overhead.','Perlakuan PPN memerlukan rekonsiliasi.']
});
const fixtureReport=()=>({report_key:'05',period:'2026-11',title:'Kontrol Pita Uji',cutoff:'2026-11-17',version:'V002',status:'OPEN RECON',basis:'MIXED',created_at:'2026-11-18T00:00:00Z',source_refs:[],payload:{notice:'Fixture sintetis',tables:[{title:'Biaya uji',headers:['Jenis','Status'],rows:[['Pita','WORKING']]}],excise_costing:fixtureCost()}});
const snap=(division,opening,tariff,entries)=>({period:'2026-11',division,version:'V001',status:'OPEN RECON',cutoff:'2026-11-17',payload:{opening_qty:opening,opening_nominal:tariff===null?null:opening*tariff,tariff,valid_through:'2026-11-17',cols:['day','in_qty','out_qty'],entries}});
const fixtureDaily=()=>[
  snap('CUKAI 10.325',1000,12.5,[[2,240,30],[3,0,40],[17,0,50]]),
  snap('CUKAI 13.775',900,22.75,[[2,120,20],[4,0,60]]),
  snap('CUKAI REFILL',80,null,[[3,0,10]])
];
async function setup(page,{reports=[fixtureReport()],daily=fixtureDaily()}={}){
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route(API+'/**',route=>{
    const url=route.request().url();let data=[];
    if(url.includes('/auth/v1/token'))data={access_token:'fixture-token',expires_in:3600};
    else if(url.includes('/functions/v1/ppic-owner-check'))data={authorized:true,role:'owner'};
    else if(url.includes('/rest/v1/ppic_reports_owner_view'))data=reports;
    else if(url.includes('/rest/v1/ppic_daily_owner_view'))data=daily;
    else if(url.includes('/auth/v1/logout'))data={};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('http://127.0.0.1:8765/');
  await expect(page.locator('#ppicMain')).toBeHidden();
  await expect(page.locator('#exCostRows tr')).toHaveCount(0);
  await page.locator('#ownerPassword').fill('fixture-password');
  await page.locator('#loginButton').click();
  await expect(page.locator('#ppicMain')).toBeVisible();
  await page.locator('[data-view="excise"]').click();
  await expect(page.locator('#exCostContent')).toBeVisible();
  await expect(page.locator('#exSummary tr')).toHaveCount(3);
  return errors;
}

test('private costing keeps three decimals and source conversions without revaluing stock',async({page})=>{
  const errors=await setup(page);
  await expect(page.locator('#exCostRows tr')).toHaveCount(2);
  await expect(page.locator('#exCostRows tr').nth(0).locator('td')).toHaveText(['10.325 / isi 12','SKU UJI ISI 12','12,500','1,375','1,250','15,125']);
  await expect(page.locator('#exCostMetrics .metric').nth(0)).toContainText('Rp 15,125');
  await expect(page.locator('#exCostConversions tr').nth(0).locator('td')).toHaveText(['10.325 / isi 12','60.000','1','1.000','907.500','15.125','907.500']);
  await expect(page.locator('#exCostConversions tr').nth(1).locator('td')).toHaveText(['13.775 / isi 16','60.000','1','800','1.653.000','22.040','1.653.000']);
  await expect(page.locator('#exCostTotals')).toContainText('Rp 2.560.500');
  await expect(page.locator('#exCostReconciliation tr[data-state="sesuai"]')).toHaveCount(4);
  await expect(page.locator('#exCostState')).toContainText('dokumen 2026-11-13');
  await expect(page.locator('#exStatus')).toContainText('saldo tanggal 2026-11-17');
  await expect(page.locator('#exSummary tr').nth(0).locator('td').nth(1)).toHaveText('1.120');
  await expect(page.locator('#exSummary tr').nth(0).locator('td').nth(3)).toHaveText('14.000');
  await expect(page.locator('#exDaily tr')).toHaveCount(30);
  await expect(page.locator('#exCostEvidence')).toContainText('BELUM DIVERIFIKASI');
  await page.locator('#exHje').selectOption('CUKAI 13.775');
  await expect(page.locator('#exCostMetrics .metric').nth(0)).toContainText('Rp 27,550');
  expect(errors).toEqual([]);
});

test('Refill retains unknown costs and does not borrow a verified HJE cost',async({page})=>{
  await setup(page);
  await page.locator('#exHje').selectOption('CUKAI REFILL');
  for(let i=0;i<3;i++)await expect(page.locator('#exCostMetrics .metric').nth(i)).toContainText('Belum terverifikasi');
  await expect(page.locator('#exCostRows tr[data-selected="true"]')).toHaveCount(0);
  await expect(page.locator('#exMetrics')).toContainText('Belum terverifikasi');
  await expect(page.locator('#exSummary tr').nth(2).locator('td').nth(3)).toHaveText('—');
});

test('historical capacity excludes future usage and rejects a mismatched stock date',async({page})=>{
  await setup(page);
  await page.locator('#exDate').fill('2026-11-02');
  await page.locator('#exDate').dispatchEvent('change');
  await expect(page.locator('#exSummary tr').nth(0).locator('td').nth(4)).toHaveText('30');
  await expect(page.locator('#exSummary tr').nth(0).locator('td').nth(1)).toHaveText('1.210');
  await expect(page.locator('#exCostState')).toContainText('dokumen 2026-11-13');
  await page.locator('#exDate').fill('2026-11-18');
  await page.locator('#exDate').dispatchEvent('change');
  await expect(page.locator('#exSummary')).toContainText('BELUM ADA DATA');
  await expect(page.locator('#exMetrics')).toContainText('Belum ada data');
  await page.locator('#exDate').fill('2026-12-02');
  await page.locator('#exDate').dispatchEvent('change');
  await expect(page.locator('#exStatus')).toContainText('tanggal saldo yang valid');
  await expect(page.locator('#exSummary tr')).toHaveCount(0);
  await expect(page.locator('#exDaily tr')).toHaveCount(0);
  await expect(page.locator('#exPrint')).toBeDisabled();
});

test('period changes clear private cost data; newest report cannot fall back to stale costing',async({page})=>{
  await setup(page);
  await page.locator('#exPeriod').fill('2026-12');
  await page.locator('#exPeriod').dispatchEvent('change');
  await expect(page.locator('#exDate')).toHaveValue('2026-12-17');
  await expect(page.locator('#exCostContent')).toBeHidden();
  await expect(page.locator('#exCostRows tr')).toHaveCount(0);
  await expect(page.locator('#exCostTotals')).toHaveText('');
  await expect(page.locator('#exSummary tr')).toHaveCount(0);
  await expect(page.locator('#exPrint')).toBeDisabled();
  await page.locator('#exPeriod').fill('2026-11');
  await page.locator('#exPeriod').dispatchEvent('change');
  const old=fixtureReport(),latest={...fixtureReport(),version:'V003',payload:{tables:[]}};
  await page.evaluate(reports=>window.ppicSetReports(reports),[old,latest]);
  await expect(page.locator('#exCostContent')).toBeHidden();
  await expect(page.locator('#exCostRows tr')).toHaveCount(0);
  await expect(page.locator('#exCostState')).toContainText('versi laporan terbaru');
});

test('PDF includes cost, sources and all HJE; print works without another selected report and logout clears it',async({page})=>{
  const errors=await setup(page);
  await page.locator('#exPrint').click();
  const html=await page.locator('#previewFrame').getAttribute('srcdoc');
  for(const text of ['15,125','27,550','2026-11-13','CK-1 uji privat','SPPR uji privat','BELUM DIVERIFIKASI','CUKAI 10.325','CUKAI 13.775','CUKAI REFILL','2026-11-30','bukan HJE atau HPP'])expect(html).toContain(text);
  const frame=page.frameLocator('#previewFrame');
  await expect(frame.locator('#exCostRows tr')).toHaveCount(2);
  await page.evaluate(()=>{
    window.__fixturePrints=0;
    document.getElementById('previewFrame').contentWindow.print=()=>window.__fixturePrints++;
  });
  await page.locator('#printPreview').click();
  expect(await page.evaluate(()=>window.__fixturePrints)).toBe(1);
  await page.locator('#closePreview').click();
  await page.locator('#logoutOwner').click();
  await expect(page.locator('#ppicMain')).toBeHidden();
  await expect(page.locator('#exCostRows tr')).toHaveCount(0);
  await expect(page.locator('#exCostSources li')).toHaveCount(0);
  await expect(page.locator('#exCostTotals')).toHaveText('');
  await expect(page.locator('#previewModal')).toBeHidden();
  await expect(page.locator('#previewFrame')).toHaveAttribute('srcdoc','');
  expect(errors).toEqual([]);
});

test('source references and source labels are escaped in screen and PDF',async({page})=>{
  const report=fixtureReport();
  report.payload.excise_costing.sources.push({title:'Unsafe URL fixture',url:'javascript:alert(1)'});
  report.payload.excise_costing.rows[0].sku='<img src=x onerror=alert(1)>';
  await setup(page,{reports:[report]});
  await expect(page.locator('#exCostSources a')).toHaveCount(2);
  await expect(page.locator('#exCostRows img')).toHaveCount(0);
  await expect(page.locator('#exCostRows tr').nth(0).locator('td').nth(1)).toHaveText('<img src=x onerror=alert(1)>');
  await page.locator('#exPrint').click();
  const html=await page.locator('#previewFrame').getAttribute('srcdoc');
  expect(html).not.toContain('href="javascript:');
  expect(html).not.toContain('<img src="x"');
  expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
});

test('desktop and mobile layouts keep controls and tables within the excise panel',async({page},testInfo)=>{
  await page.setViewportSize({width:1440,height:1080});
  await setup(page);
  await page.locator('#excise').screenshot({path:testInfo.outputPath('pita-desktop-synthetic.png')});
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('#exCostPanel')).toBeVisible();
  const geometry=await page.locator('#excise').evaluate(el=>({width:el.getBoundingClientRect().width,viewport:window.innerWidth,wrappers:[...el.querySelectorAll('.tablewrap')].map(x=>({width:x.getBoundingClientRect().width,scroll:x.scrollWidth}))}));
  expect(geometry.width).toBeLessThanOrEqual(geometry.viewport);
  for(const table of geometry.wrappers)expect(table.width).toBeLessThanOrEqual(geometry.width);
  await page.locator('#excise').screenshot({path:testInfo.outputPath('pita-mobile-synthetic.png')});
});
