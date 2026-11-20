const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const {status}=require('./fixtures/robot-synthetic.cjs');
const ROOT=process.env.PPIC_TEST_BASE_URL||'http://127.0.0.1:8765/';
const API=fs.readFileSync(path.join(__dirname,'../auth.js'),'utf8').match(/const ROOT="([^"]+)"/)[1];
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function enter(page,{handler=async p=>({status:200,body:status(p.period)})}={}){
 const errors=[],requests=[];let count=0;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route(API+'/**',async route=>{
  const req=route.request(),url=req.url();let body=[],code=200;
  if(url.includes('/auth/v1/token'))body={access_token:'SYNTHETIC_OWNER_ONLY',expires_in:3600};
  else if(url.includes('/ppic-owner-check'))body={authorized:true,role:'owner'};
  else if(url.includes('/ppic-robot-status')){requests.push(req);const result=await handler(req.postDataJSON(),++count);body=result.body;code=result.status;}
  else if(url.includes('/ppic-auto-import-status'))body={ok:true,config:{enabled:false},jobs:[]};
  else if(url.includes('/ppic_source_catalog'))body=[{document_id:'SYNTHETIC_SOURCE_A',division:'BARANG JADI',period:'2026-11',cutoff:'2026-11-19',version:'V002',reconciliation_status:'OPEN RECON',access_class:'CONFIDENTIAL',ingested_at:'2026-11-20T02:00:00Z'}];
  else if(url.includes('/auth/v1/logout'))body={};
  try{await route.fulfill({status:code,contentType:'application/json',body:JSON.stringify(body)});}catch(e){if(!page.isClosed()&&!/handled|closed|canceled|Invalid InterceptionId/i.test(e.message))throw e;}
 });
 await page.goto(ROOT);await expect(page.locator('#ppicMain')).toBeHidden();await page.locator('#ownerPassword').fill('SYNTHETIC_PASSWORD');await page.locator('#loginButton').click();await expect(page.locator('#ppicMain')).toBeVisible();
 return {errors,requests};
}
test('Owner opens manager first with top3 proposals, confidence and inspectable provenance',async({page})=>{
 const state=await enter(page);
 await expect(page.locator('#dashboard')).toBeVisible();await expect(page.locator('[data-view="dashboard"]')).toHaveText('Robot Manajer');await expect(page.locator('#robotTopDecisions>.robot-decision')).toHaveCount(3);await expect(page.locator('#robotOtherDecisions')).toBeHidden();
 await expect(page.locator('#robotTopDecisions')).toContainText('Keyakinan sedang');await expect(page.locator('#robotTopDecisions')).toContainText('Usulan · Admin Divisi Uji');
 await page.locator('#robotTopDecisions .robot-evidence summary').first().click();await expect(page.locator('#robotTopDecisions .robot-evidence-source').first()).toContainText('DATA_UJI · B7');await expect(page.locator('#robotTopDecisions .robot-evidence-source').first()).toContainText('12 karton');
 await expect(page.locator('#robotCoverage')).toContainText('19 Nov 2026');await expect(page.locator('#robotCoverage')).toContainText('18 Nov 2026');
 await page.locator('#robotMoreDecisions>summary').click();await expect(page.locator('#robotOtherDecisions>.robot-decision')).toHaveCount(2);await expect(page.locator('#robotOtherDecisions')).toBeVisible();
 await expect(page.locator('#robotPanel form#ppicAskForm')).toHaveCount(1);await expect(page.locator('#robotPanel form:not(#ppicAskForm)')).toHaveCount(0);await expect(page.locator('#robotPanel button:not(#ppicAskSend)').filter({hasText:/setujui|bayar|transfer|closing|kirim/i})).toHaveCount(0);expect(state.errors).toEqual([]);
});
test('source markup stays plain text and evidence source link only navigates to Bank Data',async({page})=>{
 const p=status();p.latest_brief.payload.decisions[0].title='<img src=x onerror=alert(1)>';p.evidence_sources[0].facts[0].note='<script>window.syntheticInjected=true</script>';
 const state=await enter(page,{handler:async()=>({status:200,body:p})});await expect(page.locator('#robotTopDecisions')).toContainText('<img src=x onerror=alert(1)>');await expect(page.locator('#robotTopDecisions img')).toHaveCount(0);
 await page.locator('#robotTopDecisions .robot-evidence summary').first().click();await expect(page.locator('#robotTopDecisions .robot-evidence-source').first()).toContainText('<script>window.syntheticInjected=true</script>');expect(await page.evaluate(()=>window.syntheticInjected)).toBeUndefined();
 await page.locator('#robotTopDecisions .robot-text-button').first().click();await expect(page.locator('#data')).toBeVisible();await expect(page.locator('#search')).toHaveValue('SYNTHETIC_SOURCE_A');await expect(page.locator('#docs')).toContainText('SYNTHETIC_SOURCE_A');
 await page.locator('#logoutOwner').click();await expect(page.locator('#search')).toHaveValue('');await expect(page.locator('#robotTopDecisions')).toBeEmpty();expect(state.errors).toEqual([]);
});
test('changed source freshness and actual maintenance failure are shown without false repair claims',async({page})=>{
 const p=status();p.health.source_changed_since_brief=true;p.health.state='ERROR';p.config.last_error='Kegagalan pemantauan sintetis.';p.runs[1].status='FAILED';p.runs[1].message='Halaman uji tidak dapat dibaca.';
 await enter(page,{handler:async()=>({status:200,body:p})});await expect(page.locator('#robotFreshness')).toContainText('sumber yang berubah');await page.locator('#robotHealthPanel>summary').click();await expect(page.locator('#robotHealth')).toContainText('Halaman uji tidak dapat dibaca.');await expect(page.locator('#robotHealth')).toContainText('Gagal');await expect(page.locator('#robotHealthBadge')).toHaveText('Ada kegagalan');await expect(page.locator('#robotHealth')).not.toContainText('sudah diperbaiki');
});
test('unavailable service preserves older reports and later failure retains labelled analysis',async({page})=>{
 let mode='unavailable';const state=await enter(page,{handler:async p=>mode==='unavailable'?{status:404,body:{error:'SYNTHETIC_NOT_CONFIGURED'}}:mode==='failed'?{status:503,body:{error:'SYNTHETIC_FAILURE'}}:{status:200,body:status(p.period)}});
 await expect(page.locator('#robotStatus')).toContainText('belum tersedia');await expect(page.locator('#robotTopDecisions')).toBeEmpty();await page.locator('[data-view="reports"]').click();await expect(page.locator('#reports')).toBeVisible();
 await page.locator('[data-view="dashboard"]').click();mode='ready';await page.locator('#robotRefresh').click();await expect(page.locator('#robotTopDecisions>.robot-decision')).toHaveCount(3);mode='failed';await page.locator('#robotRefresh').click();await expect(page.locator('#robotStatus')).toContainText('Ringkasan sebelumnya');await expect(page.locator('#robotHealthBadge')).toHaveText('Pemeriksaan gagal');await expect(page.locator('#robotTopDecisions>.robot-decision')).toHaveCount(3);expect(state.errors).toEqual([]);
});
test('late responses after period change and logout cannot restore private analysis',async({page})=>{
 const waiting=deferred();let started=false;
 const state=await enter(page,{handler:async p=>{if(p.period==='2026-12'){started=true;await waiting.promise;}return {status:200,body:status(p.period)};}});
 await expect(page.locator('#robotTopDecisions>.robot-decision')).toHaveCount(3);await page.locator('#robotPeriod').fill('2026-12');await page.locator('#robotPeriod').dispatchEvent('change');await expect.poll(()=>started).toBe(true);await expect(page.locator('#robotTopDecisions')).toBeEmpty();
 await page.locator('#robotPeriod').fill('2027-01');await page.locator('#robotPeriod').dispatchEvent('change');await expect(page.locator('#robotCoverage')).toContainText('19 Jan 2027');waiting.resolve();await expect(page.locator('#robotPeriod')).toHaveValue('2027-01');await expect(page.locator('#robotCoverage')).not.toContainText('19 Des 2026');
 await page.locator('#logoutOwner').click();await expect(page.locator('#ppicMain')).toBeHidden();await expect(page.locator('#robotTopDecisions')).toBeEmpty();await expect(page.locator('#robotRuns')).toBeEmpty();expect(state.errors).toEqual([]);
});
test('disabled or unlinked schedules do not show an autonomous running claim',async({page})=>{
 const p=status();p.config.enabled=false;p.config.automation_id=null;p.config.last_check_at=null;p.config.last_success_at=null;p.health.state='DISABLED';p.runs=[];p.latest_brief=null;
 await enter(page,{handler:async()=>({status:200,body:p})});await expect(page.locator('#robotEmpty')).toBeVisible();await page.locator('#robotHealthPanel>summary').click();await expect(page.locator('#robotHealth')).toContainText('Tidak aktif');await expect(page.locator('#robotHealth')).toContainText('Belum tercatat');await expect(page.locator('#robotHealth')).toContainText('Belum ada bukti pemeriksaan');
});
test('manager remains readable at phone width with long evidence and an export route',async({page},testInfo)=>{
 await page.setViewportSize({width:390,height:844});const p=status();p.latest_brief.payload.decisions[0].recommendation+=' '+('SYNTHETIC_LONG_TEXT_'.repeat(14));
 const state=await enter(page,{handler:async()=>({status:200,body:p})});await expect(page.locator('#robotTopDecisions>.robot-decision')).toHaveCount(3);
 await page.locator('#robotTopDecisions .robot-evidence summary').first().click();
 const sizes=await page.evaluate(()=>({page:document.documentElement.scrollWidth,width:innerWidth,cards:[...document.querySelectorAll('.robot-decision,.robot-coverage-card,.robot-evidence-source')].filter(e=>e.getBoundingClientRect().width>0).map(e=>({scroll:e.scrollWidth,width:e.clientWidth,right:e.getBoundingClientRect().right}))}));
 expect(sizes.page).toBeLessThanOrEqual(sizes.width+2);expect(sizes.cards.every(x=>x.scroll<=x.width+2&&x.right<=sizes.width+1)).toBe(true);
 const capture=testInfo.outputPath('robot-manager-mobile-synthetic.png');await page.locator('#robotPanel').screenshot({path:capture});await testInfo.attach('robot-manager-mobile-synthetic',{path:capture,contentType:'image/png'});
 await page.locator('#robotPanel [data-go="info"]').click();await expect(page.locator('#info')).toBeVisible();await expect(page.locator('#infoDownload')).toBeVisible();expect(state.errors).toEqual([]);
});
test('SDM date conflict is visible above existing reports and clears with the private session',async({page})=>{
 const p=status();p.coverage[0]={...p.coverage[0],division:'SDM GILING',report_status:'WORKING / METADATA_CONFLICT'};
 await enter(page,{handler:async()=>({status:200,body:p})});await expect(page.locator('#robotCoverage')).toContainText('Sumber tercatat:');
 if(await page.locator('#ppicDivisionsList').isHidden())await page.locator('#ppicDivisionsToggle').click();await page.locator('[data-view="sdm"]').click();
 await expect(page.locator('#sdmRobotSourceWarning')).toBeVisible();await expect(page.locator('#sdmRobotSourceWarning')).toContainText('Konflik tanggal sumber SDM');await expect(page.locator('#sdmRobotSourceWarning')).toContainText('belum dapat digunakan untuk payroll final');await expect(page.locator('#sdmRobotSourceWarning')).toContainText('METADATA_CONFLICT');
 await page.locator('#sdmStart').fill('2026-12-01');await page.locator('#sdmEnd').fill('2026-12-07');await expect(page.locator('#sdmRobotSourceWarning')).toBeHidden();
 await page.locator('#sdmStart').fill('2026-11-13');await page.locator('#sdmEnd').fill('2026-11-19');await expect(page.locator('#sdmRobotSourceWarning')).toBeVisible();
 await page.locator('#logoutOwner').click();await expect(page.locator('#sdmRobotSourceWarning')).toBeEmpty();
});
