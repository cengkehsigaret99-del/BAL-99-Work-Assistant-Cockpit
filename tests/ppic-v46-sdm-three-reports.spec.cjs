const {test,expect}=require('@playwright/test');
const zlib=require('zlib');
const ROOT='http://127.0.0.1:8765/';
const API='https://jryfozndxpjymggevkgq.supabase.co';
const docG='SYNTHETIC_SDM_GILING_A',docV='SYNTHETIC_SDM_VERPACK_B';
const rows=[
 ['GILING','GTEST001','PEKERJA UJI GILING'],
 ['VERPACK','PTEST001','PEKERJA UJI VERPACK']
];
const compact={w:rows,b:['—','GCC 99','GCC 16'],s:['NORMAL'],r:[[0,13,1,3200,128000,0],[1,13,1,500,85000,0],[1,14,2,100,21000,0]],meta:{cutoff:'2026-11-17',documentIds:[docG,docV],summaries:{'SDM GILING':{upahTanpaHasil:0},'SDM VERPACK':{upahTanpaHasil:0}}}};
const zip=data=>({codec:'zlib-base64',data:zlib.deflateSync(Buffer.from(JSON.stringify(data))).toString('base64')});
const sdmSnap=(data=compact,ids=[docG,docV])=>({period:'2026-11',version:'V010',cutoff:'2026-11-17',status:'WORKING / OPEN RECON',payload:zip(data),source_document_ids:ids});
async function enter(page,{sources=[docG,docV],snapshots=[sdmSnap()],onRebuild=()=>null}={}){
 const errs=[];
 page.on('pageerror',e=>errs.push(e.message));
 await page.route(API+'/**',async route=>{
  const u=route.request().url();
  let result=[];
  if(u.includes('/auth/v1/token'))result={access_token:'fake-in-test-only',expires_in:3600};
  else if(u.includes('/functions/v1/ppic-owner-check'))result={authorized:true,role:'owner'};
  else if(u.includes('/rest/v1/ppic_source_catalog'))result=['SDM GILING','SDM VERPACK'].map((division,i)=>({division,document_id:sources[i],period:'2026-11',version:'V009',ingested_at:'2026-11-18T11:00:00Z'}));
  else if(u.includes('/rest/v1/ppic_sdm_weekly_owner_view'))result=snapshots;
  else if(u.includes('/functions/v1/ppic-sdm-rebuild'))result=await onRebuild();
  else if(u.includes('/auth/v1/logout'))result={};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.goto(ROOT);
 await page.locator('#ownerPassword').fill('fake-only');
 await page.locator('#loginButton').click();
 await expect(page.locator('#ppicMain')).toBeVisible();
 await page.locator('[data-view="sdm"]').click();
 return errs;
}
test('three SDM reports show separate quantity units and combined wage without double-counting',async({page})=>{
 const errors=await enter(page);
 await expect(page.locator('#sdmGilingQty')).toHaveText('3.200 batang');
 await expect(page.locator('#sdmVerpackQty')).toHaveText('600 pack');
 await expect(page.locator('#sdmCombinedQty')).toContainText('3.200 batang + 600 pack');
 await expect(page.locator('#sdmCombinedWage')).toHaveText('Upah gabungan: Rp 234.000');
 for(const id of ['sdmPrintGiling','sdmPrintVerpack','sdmPrintCombined'])await expect(page.locator('#'+id)).toBeEnabled();
 await page.locator('#sdmPrintCombined').click();
 const html=await page.locator('#previewFrame').getAttribute('srcdoc');
 for(const x of ['RINCIAN HASIL & UPAH PER MEREK','RINCIAN PER KARYAWAN','RINCIAN HARIAN PER KARYAWAN','PEKERJA UJI GILING','PEKERJA UJI VERPACK','GILING dan VERPACK','234.000'])expect(html).toContain(x);
 expect(html.indexOf('RINCIAN HASIL & UPAH PER MEREK')).toBeLessThan(html.indexOf('RINCIAN PER KARYAWAN'));
 expect(errors).toEqual([]);
});
test('single division print buttons do not carry over employee, status, brand filters',async({page})=>{
 await enter(page);
 await page.locator('#sdmSearch').fill('GTEST001');
 await expect(page.locator('#sdmRows tr')).toHaveCount(1);
 await expect(page.locator('#sdmVerpackQty')).toHaveText('600 pack');
 await page.locator('#sdmPrintVerpack').click();
 await expect(page.locator('#sdmSearch')).toHaveValue('');
 await expect(page.locator('#sdmDiv')).toHaveValue('VERPACK');
 let html=await page.locator('#previewFrame').getAttribute('srcdoc');
 expect(html).toContain('PEKERJA UJI VERPACK');expect(html).not.toContain('PEKERJA UJI GILING');
 await page.locator('#closePreview').click();
 await page.locator('#sdmPrintGiling').click();
 html=await page.locator('#previewFrame').getAttribute('srcdoc');
 expect(html).toContain('PEKERJA UJI GILING');expect(html).not.toContain('PEKERJA UJI VERPACK');
});
test('newer SDM Giling upload is detected, old snapshot is rebuilt before PDF',async({page})=>{
 const freshG='SYNTHETIC_SDM_GILING_FRESH';
 const newCompact={...compact,meta:{...compact.meta,documentIds:[freshG,docV]},r:[[0,13,1,4200,168000,0],[1,13,1,500,85000,0],[1,14,2,100,21000,0]]};
 let rebuilt=0,actualSources=[freshG,docV],snapshotSet=[sdmSnap()];
 const errors=await enter(page,{sources:actualSources,snapshots:snapshotSet,onRebuild:()=>{rebuilt++;snapshotSet=[sdmSnap(newCompact,actualSources)];return {ok:true,version:'V011',rows:3,workers:2,cutoff:'2026-11-17'};}});
 await expect.poll(()=>rebuilt).toBe(1);
 await expect(page.locator('#sdmGilingQty')).toHaveText('4.200 batang');
 await expect(page.locator('#sdmCombinedWage')).toHaveText('Upah gabungan: Rp 274.000');
 await expect(page.locator('#sdmPrintCombined')).toBeEnabled();
 await expect(page.locator('#sdmSourceAudit')).not.toContainText('SUMBER BARU TERDETEKSI');
 expect(errors).toEqual([]);
});
test('logout clears all three report totals and print buttons',async({page})=>{
 await enter(page);
 await page.locator('#logoutOwner').click();
 await expect(page.locator('#ppicMain')).toBeHidden();
 for(const id of ['sdmGilingQty','sdmVerpackQty','sdmCombinedQty'])await expect(page.locator('#'+id)).toHaveText('—');
 for(const id of ['sdmPrintGiling','sdmPrintVerpack','sdmPrintCombined'])await expect(page.locator('#'+id)).toBeDisabled();
});
test('mobile three report cards stay inside viewport',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await enter(page);
 const widths=await page.locator('#sdmThreeReports').evaluate(root=>({parent:root.getBoundingClientRect().width,screen:window.innerWidth,cards:[...root.querySelectorAll('.sdm-report-card')].map(c=>c.getBoundingClientRect().width)}));
 expect(widths.parent).toBeLessThanOrEqual(widths.screen);
 expect(widths.cards.every(w=>w<=widths.parent)).toBe(true);
});