const {test,expect}=require('@playwright/test');
const zlib=require('zlib');
const ROOT=process.env.PPIC_TEST_BASE_URL||'http://127.0.0.1:8765/';
const API='https://jryfozndxpjymggevkgq.supabase.co';
const divisions=['GILING','SDM GILING','SDM VERPACK','VERPACK'];
const ids=divisions.map((_,i)=>'SYNTHETIC_REVIEWED_'+i);
const archive='SYNTHETIC_LIBRARY_DETAIL';
function fixture(considered=ids){
 const data={w:[['GILING','PCS 990001','PEKERJA UJI GILING'],['VERPACK','P990100','PEKERJA UJI VERPACK']],b:['GCC 99','GCC 16'],s:['NORMAL'],r:[[0,19,0,1000,40000,0],[1,19,0,500,85000,0]],meta:{period:'2026-11',cutoff:'2026-11-19',documentIds:[ids[0],archive],consideredSources:considered.map((documentId,i)=>({documentId,division:divisions[i]||'GILING',decision:i===0?'ACCEPTED':'REJECTED_FORMAT'})),externalSourceRefs:[{libraryFileId:archive,notArchivedInPPIC:true}],payroll:{bonusPolicy:'OFF',periodStart:'2026-11-13',periodEnd:'2026-11-19',holds:[{div:'VERPACK',id:null,name:'PEKERJA HOLD UJI',date:'2026-11-19',brand:'GCC 16',qty:300,wage:63000,reason:'ID belum tersedia'}]}}};
 return {period:'2026-11',version:'V011',cutoff:'2026-11-19',status:'WORKING / OPEN RECON',source_document_ids:[ids[0],archive],payload:{codec:'zlib-base64',data:zlib.deflateSync(Buffer.from(JSON.stringify(data))).toString('base64')}};
}
async function login(page,{fresh=false}={}){
 let builds=0,snap=fixture();
 const sources=divisions.map((division,i)=>({division,document_id:fresh&&i===0?'SYNTHETIC_NEW_GILING':ids[i],period:'2026-11',version:'V011',ingested_at:'2026-11-19T12:00:00Z'}));
 await page.route(API+'/**',async route=>{
  const url=route.request().url();let body=[];
  if(url.includes('/auth/v1/token'))body={access_token:'fake-source-test-only',expires_in:3600};
  else if(url.includes('/functions/v1/ppic-owner-check'))body={authorized:true,role:'owner'};
  else if(url.includes('/rest/v1/ppic_source_catalog'))body=sources;
  else if(url.includes('/rest/v1/ppic_sdm_weekly_owner_view'))body=[snap];
  else if(url.includes('/functions/v1/ppic-sdm-rebuild')){builds++;snap=fixture(sources.map(s=>s.document_id));snap.version='V012';body={ok:true,rows:2,workers:2,cutoff:'2026-11-19',version:'V012'};}
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto(ROOT);await page.locator('#ownerPassword').fill('fake-only');await page.locator('#loginButton').click();await expect(page.locator('#ppicMain')).toBeVisible();
 if(await page.locator('#ppicDivisionsList').isHidden())await page.locator('#ppicDivisionsToggle').click();
 await page.locator('[data-view="sdm"]').click();
 return ()=>builds;
}
test('reviewed summary sources and external detail do not block valid reports or trigger a redundant rebuild',async({page})=>{
 const builds=await login(page);
 await expect(page.locator('#payrollSlips')).toBeEnabled();await expect(page.locator('#sdmPrintCombined')).toBeEnabled();
 expect(builds()).toBe(0);
 await expect(page.locator('#sdmVerpackQty')).toHaveText('800 pack');
 await expect(page.locator('#sdmVerpackWage')).toHaveText('Upah: Rp 148.000');
 await page.locator('#sdmDiv').selectOption('VERPACK');
 await expect(page.locator('#payrollGross')).toHaveText('Rp 148.000');await expect(page.locator('#payrollCashGross')).toHaveText('Rp 85.000');
 await expect(page.locator('#sdmRows')).toContainText('BELUM ADA ID');await expect(page.locator('#sdmRows')).toContainText('HOLD');
});
test('a genuinely newer GILING archive triggers one rebuild before printing',async({page})=>{
 const builds=await login(page,{fresh:true});
 await expect.poll(builds).toBe(1);await expect(page.locator('#payrollSlips')).toBeEnabled();
 await expect(page.locator('#sdmSourceAudit')).not.toContainText('SUMBER BARU TERDETEKSI');
});
