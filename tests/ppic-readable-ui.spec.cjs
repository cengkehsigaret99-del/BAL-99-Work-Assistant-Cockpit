const {test,expect}=require('@playwright/test');
const {status}=require('./fixtures/robot-synthetic.cjs');
const ROOT=process.env.PPIC_TEST_BASE_URL||'http://127.0.0.1:8765/';
const API='https://jryfozndxpjymggevkgq.supabase.co';
const daily=()=>({ok:true,period:'2026-11',ready:true,latest:{
 as_of:'2026-11-24',created_at:'2026-11-24T12:50:36Z',state:'WORKING_OPEN_RECON',posting_done:false,
 skt_revision_current:true,ppic_evidence_current:true,
 source_rows:[{division:'BARANG JADI',source_status:'CANDIDATE_OPEN_RECON',
 source_label:'Barang Jadi V016',book_cutoff:'2026-11-23',active_cutoff:'2026-11-18',
 note:'Stok proyeksi bukan tersedia untuk dijual',source_binary_verified:true,
 metrics:[{label:'Saldo buku',value:481125,unit:'pack',quality:'REFERENCE'}]}],
 kpi_rows:[
  {label:'Saldo buku BJ',value:481125,unit:'pack',quality:'REFERENCE'},
  {label:'Kas Bank indikatif',value:5326364213.42,unit:'Rp',quality:'ESTIMATE'},
  {label:'Pita Cukai',value:619945,unit:'keping',quality:'SOURCE'}],
 exceptions:[{code:'MUTASI_QC',priority:'P1',division:'BARANG JADI',title:'QC fisik perlu verifikasi'}],
 next_actions:[{owner:'Gudang BJ',priority:'P1',action:'Periksa tanda terima gudang 24 November'}]
}});
async function setup(page){
 const errors=[],observed={writes:[]};
 page.on('pageerror',e=>errors.push(e.message));
 await page.route(API+'/**',async route=>{
  const req=route.request(),url=req.url();let data={};
  if(/ppic-owner-upload|ppic-sdm-rebuild|ppic-bulk-sync|ppic-post-snapshot/.test(url))observed.writes.push(url);
  if(url.includes('/auth/v1/token'))data={access_token:'SYNTHETIC_READABLE_OWNER',expires_in:3600};
  else if(url.includes('/ppic-owner-check'))data={authorized:true,role:'owner'};
  else if(url.includes('/ppic-daily-intelligence'))data=daily();
  else if(url.includes('/ppic-robot-status'))data=status('2026-11');
  else if(url.includes('/ppic-auto-import-status'))data={ok:true,period:'2026-11',config:{enabled:false},jobs:[]};
  else if(url.includes('/ppic-owner-assistant'))data={ok:true,period:'2026-11',live_gpt_configured:true,questions:[]};
  else if(url.includes('/ppic-sj-recon-status')||url.includes('/ppic-do-sync-health')||
    url.includes('/ppic-plan-status')||url.includes('/ppic-stage3-status')||
    url.includes('/ppic-stage2-status')||url.includes('/ppic-skt-watch-status'))
    data={ok:true,period:'2026-11',ready:false,latest:null};
  else if(url.includes('/auth/v1/logout'))data={};
  else data=[];
  try{await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});}
  catch(e){if(!page.isClosed()&&!/closed|handled|canceled|Invalid InterceptionId/.test(e.message))throw e;}
 });
 await page.goto(ROOT);
 await expect(page.locator('#ownerLogin')).toBeVisible();
 await expect(page.locator('#ppicMain')).toBeHidden();
 await page.locator('#ownerPassword').fill('SYNTHETIC_PASSWORD');
 await page.locator('#loginButton').click();
 await expect(page.locator('#ppicMain')).toBeVisible();
 await expect(page.locator('#ppicDailyIntelKpis .ppic-daily-kpi')).toHaveCount(3);
 return {errors,observed};
}
async function computed(page){
 return page.evaluate(()=>{
  const css=(s)=>getComputedStyle(document.querySelector(s));
  return{
   base:parseFloat(css('body').fontSize),
   heading:parseFloat(css('#robotTitle').fontSize),
   dailyHeading:parseFloat(css('#ppicDailyIntelTitle').fontSize),
   kpi:parseFloat(css('#ppicDailyIntelKpis .ppic-daily-kpi strong').fontSize),
   kpiLabel:parseFloat(css('#ppicDailyIntelKpis .ppic-daily-kpi>span').fontSize),
   tab:parseFloat(css('.ppic-nav-primary .btn').fontSize),
   tabMinHeight:document.querySelector('.ppic-nav-primary .btn').getBoundingClientRect().height,
   bodyWidth:document.documentElement.scrollWidth,
   viewport:window.innerWidth
  };
 });
}
test('Desktop: large by default, hierarchy is bolder, controls persist and no data writes',async({page})=>{
 await page.setViewportSize({width:1366,height:900});
 const s=await setup(page);
 await expect(page.locator('link[href="ppic-readable-ui.css"]')).toHaveCount(1);
 await expect(page.locator('#ppicReadingControls')).toBeVisible();
 await expect(page.locator('html')).toHaveAttribute('data-ppic-reading','large');
 await expect(page.locator('[data-reading-choice=large]')).toHaveAttribute('aria-pressed','true');
 const large=await computed(page);
 expect(large.base).toBeGreaterThanOrEqual(16.5);
 expect(large.heading).toBeGreaterThanOrEqual(34);
 expect(large.dailyHeading).toBeGreaterThanOrEqual(22);
 expect(large.kpi).toBeGreaterThanOrEqual(25);
 expect(large.tabMinHeight).toBeGreaterThanOrEqual(48);
 await page.locator('[data-reading-choice=xlarge]').click();
 await expect(page.locator('html')).toHaveAttribute('data-ppic-reading','xlarge');
 await expect(page.locator('[data-reading-choice=xlarge]')).toHaveAttribute('aria-pressed','true');
 const xl=await computed(page);
 expect(xl.base).toBeGreaterThan(large.base);
 expect(xl.kpi).toBeGreaterThan(large.kpi);
 expect(xl.dailyHeading).toBeGreaterThan(large.dailyHeading);
 await expect(page.locator('#ppicReadingStatus')).toContainText('Sangat besar');
 await page.reload();
 await expect(page.locator('html')).toHaveAttribute('data-ppic-reading','xlarge');
 await expect(page.locator('[data-reading-choice=xlarge]')).toHaveAttribute('aria-pressed','true');
 await page.locator('#ownerPassword').fill('SYNTHETIC_PASSWORD');
 await page.locator('#loginButton').click();
 await expect(page.locator('#ppicMain')).toBeVisible();
 await page.locator('[data-reading-choice=normal]').click();
 const normal=await computed(page);
 expect(normal.base).toBeLessThan(large.base);
 expect(normal.kpi).toBeLessThan(large.kpi);
 expect(s.errors).toEqual([]);
 expect(s.observed.writes).toEqual([]);
});
test('Android 360: readable type, one-column metrics, large touch controls and no global overflow',async({page})=>{
 await page.setViewportSize({width:360,height:800});
 const s=await setup(page);
 await expect(page.locator('#ppicDailyIntelKpis')).toContainText('5.326.364.213');
 const info=await computed(page);
 expect(info.base).toBeGreaterThanOrEqual(16);
 expect(info.kpi).toBeGreaterThanOrEqual(25);
 expect(info.tabMinHeight).toBeGreaterThanOrEqual(48);
 const size=await page.locator('#ppicReadingControls').boundingBox();
 expect(size.height).toBeGreaterThanOrEqual(48);
 expect(info.bodyWidth).toBeLessThanOrEqual(info.viewport+7);
 const layout=await page.locator('#ppicDailyIntelKpis').evaluate(el=>{
  const grid=getComputedStyle(el);return{columns:grid.gridTemplateColumns.split(' ').length,width:el.clientWidth};
 });
 expect(layout.columns).toBe(1);
 await page.locator('[data-reading-choice=xlarge]').click();
 await expect(page.locator('[data-reading-choice=xlarge]')).toHaveAttribute('aria-pressed','true');
 const extra=await computed(page);
 expect(extra.base).toBeGreaterThan(info.base);
 expect(extra.bodyWidth).toBeLessThanOrEqual(extra.viewport+7);
 await expect(page.locator('.bal-brand-mark')).toBeVisible();
 expect(s.observed.writes).toEqual([]);
 expect(s.errors).toEqual([]);
});
test('Print remains white independent of large typography selection',async({page})=>{
 await page.setViewportSize({width:900,height:900});
 const s=await setup(page);
 await page.locator('[data-reading-choice=xlarge]').click();
 await page.emulateMedia({media:'print'});
 const result=await page.evaluate(()=>{
  const style=s=>getComputedStyle(document.querySelector(s));
  return{background:style('body').backgroundColor,
    paper:style('#ppicMain .paper').backgroundColor,
    control:style('#ppicReadingControls').display,
    bodyFont:style('body').fontSize};
 });
 expect(result.background).toBe('rgb(255, 255, 255)');
 expect(result.paper).toBe('rgb(255, 255, 255)');
 expect(result.control).toBe('none');
 expect(parseFloat(result.bodyFont)).toBeLessThanOrEqual(13);
 expect(s.errors).toEqual([]);
});
