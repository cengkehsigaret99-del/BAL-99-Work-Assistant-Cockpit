const {test,expect}=require('playwright/test');
const zlib=require('node:zlib');
const ROOT=process.env.PPIC_TEST_BASE_URL||'http://127.0.0.1:8765/';
const API='https://jryfozndxpjymggevkgq.supabase.co';
const source=(document_id,division,cutoff='2026-11-20',ingested_at='2026-11-20T01:00:00Z')=>({document_id,division,period:'2026-11',version:'V012',cutoff,ingested_at});
const oldDocs=[source('SYNTHETIC_GILING_20','SDM GILING'),source('SYNTHETIC_PACKING_20','SDM VERPACK')];
const newDocs=[source('SYNTHETIC_GILING_RECAP','GILING','2026-11-20','2026-11-20T13:00:00Z'),source('SYNTHETIC_VERPACK_RECAP','VERPACK','2026-11-20','2026-11-20T13:00:00Z'),source('SYNTHETIC_PACKING_19','SDM VERPACK','2026-11-19','2026-11-20T13:00:00Z')];
const cfg={enabled:true,cadence:'HOURLY',timezone:'Asia/Jakarta',automation_id:'SYNTHETIC_AUTO_ONLY',last_check_at:'2026-11-20T13:00:00Z',last_success_at:'2026-11-20T13:00:00Z'};
function receipt(overrides={}){
 const jobs=newDocs.map((x,i)=>({id:'SYNTHETIC_JOB_'+i,filename:(i===0?'SYNTHETIC_':'')+'PR_BAL_'+x.division.replaceAll(' ','_')+'_NOVEMBER_2026_V012_CUTOFF_'+(i===2?'19':'20')+'NOV_PPIC_UPLOAD_WORKING.xlsx',...x,status:'IMPORTED',report_status:i===2?'SUPERSEDED':'ARCHIVE_ONLY',completed_at:cfg.last_success_at,message:i===2?'Laporan yang lebih baru tetap digunakan.':'Sumber telah diterima sebagai arsip.'}));
 return {ok:true,config:cfg,jobs,source_policy:{period:'2026-11',complete:true,excluded_document_ids:newDocs.map(x=>x.document_id)},...overrides};
}
function snapshot(ids=oldDocs.map(x=>x.document_id)){
 const decoded={w:[['GILING','UJI01','PEKERJA UJI GILING'],['VERPACK','UJI02','PEKERJA UJI VERPACK']],b:['GCC 99','GCC 16'],s:['NORMAL'],r:[[0,19,0,1000,40000,0],[1,19,1,500,105000,0]],meta:{period:'2026-11',cutoff:'2026-11-20',documentIds:ids,consideredSourceIds:ids,payroll:{bonusPolicy:'OFF',periodStart:'2026-11-13',periodEnd:'2026-11-20',sourceCutoffByDivision:{GILING:'2026-11-20',VERPACK:'2026-11-20'}}}};
 return {period:'2026-11',version:'V012',cutoff:'2026-11-20',status:'WORKING / OPEN RECON',source_document_ids:ids,payload:{codec:'zlib-base64',data:zlib.deflateSync(Buffer.from(JSON.stringify(decoded))).toString('base64')}};
}
async function enter(page,{statusResponse=async()=>({status:200,body:receipt()}),docs=[...oldDocs,...newDocs]}={}){
 let builds=0,statusCalls=0,snap=snapshot();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(API+'/**',async route=>{
  const u=route.request().url();let body=[],status=200;
  if(u.includes('/auth/v1/token'))body={access_token:'synthetic-token-only',expires_in:3600};
  else if(u.includes('/ppic-owner-check'))body={authorized:true,role:'owner'};
  else if(u.includes('/ppic-robot-status'))body={ok:true,period:'2026-11',config:{enabled:false},health:{state:'DISABLED'},latest_brief:null,coverage:[],evidence_sources:[],runs:[]};
  else if(u.includes('/ppic-auto-import-status')){statusCalls++;const r=await statusResponse(statusCalls,route.request().postDataJSON());status=r.status;body=r.body;}
  else if(u.includes('/ppic_source_catalog'))body=docs;
  else if(u.includes('/ppic_sdm_weekly_owner_view'))body=[snap];
  else if(u.includes('/ppic-sdm-rebuild')){builds++;snap=snapshot(docs.map(x=>x.document_id));body={ok:true,period:'2026-11',version:'V013',cutoff:'2026-11-20',rows:2,workers:2};}
  else if(u.includes('/auth/v1/logout'))body={};
  try{await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});}catch(e){if(!page.isClosed()&&!/handled|closed|canceled|Invalid InterceptionId/i.test(e.message))throw e;}
 });
 await page.goto(ROOT);await page.locator('#ownerPassword').fill('synthetic-only');await page.locator('#loginButton').click();await expect(page.locator('#ppicMain')).toBeVisible();await page.locator('[data-view="data"]').click();
 return {builds:()=>builds,statusCalls:()=>statusCalls,errors};
}
test('receipts distinguish archived and processed data and never inject source HTML',async({page})=>{
 const response=receipt();response.jobs.push({...response.jobs[0],id:'XSS_TEST',filename:'<img src=x onerror=alert(1)>.xlsx',status:'DUPLICATE',report_status:'PROCESSED'});
 const state=await enter(page,{statusResponse:async()=>({status:200,body:response})});
 await expect(page.locator('#autoImportState')).toHaveText('Sinkron otomatis aktif');await expect(page.locator('#autoImportImported')).toHaveText('3');await expect(page.locator('#autoImportJobs .sync-file')).toHaveCount(4);
 await expect(page.locator('#autoImportJobs')).toContainText('Arsip sumber');await expect(page.locator('#autoImportJobs')).toContainText('Referensi versi sebelumnya');await expect(page.locator('#autoImportJobs')).toContainText('Laporan diproses');await expect(page.locator('#autoImportJobs img')).toHaveCount(0);
 await expect(page.locator('#autoImportJobs')).toContainText('Cut-off 19 Nov 2026');await expect(page.locator('#autoImportJobs')).toContainText('Cut-off 20 Nov 2026');expect(state.builds()).toBe(0);expect(state.errors).toEqual([]);
});
test('delayed import status defers only automatic SDM rebuild and excludes aggregate/superseded imports',async({page})=>{
 let release;const wait=new Promise(r=>{release=r});const state=await enter(page,{statusResponse:async()=>{await wait;return {status:200,body:receipt()};}});
 await expect.poll(async()=>page.evaluate(()=>typeof sdmData!=='undefined'&&!!sdmData)).toBe(true);
 expect(state.builds()).toBe(0);release();await expect(page.locator('#autoImportJobs .sync-file')).toHaveCount(3);expect(state.builds()).toBe(0);
 const policy=await page.evaluate(()=>window.ppicAutoImportSourcePolicy('2026-11'));expect(policy.ready).toBe(true);expect(policy.ignoredDocumentIds.sort()).toEqual(newDocs.map(x=>x.document_id).sort());
 await page.locator('#logoutOwner').click();await expect(page.locator('#autoImportJobs .sync-file')).toHaveCount(0);await expect(page.locator('#ppicMain')).toBeHidden();expect(await page.evaluate(()=>window.ppicAutoImportSourcePolicy('2026-11').ready)).toBe(false);expect(state.errors).toEqual([]);
});
test('unconfigured status endpoint preserves legacy rebuild but an unavailable backend does not falsely claim sync',async({page})=>{
 const state=await enter(page,{statusResponse:async()=>({status:404,body:{error:'Status sinkron belum dikonfigurasi.'}})});
 await expect(page.locator('#autoImportState')).toHaveText('Status sinkron belum dapat diperbarui');await expect(page.locator('#autoImportError')).toContainText('belum dikonfigurasi');await expect.poll(state.builds).toBe(1);await expect(page.locator('#autoImportJobs .sync-file')).toHaveCount(0);
});
test('disabled automation retains historical receipts without claiming an active schedule',async({page})=>{
 await enter(page,{statusResponse:async()=>({status:200,body:receipt({config:{...cfg,enabled:false}})})});
 await expect(page.locator('#autoImportState')).toHaveText('Sinkron otomatis belum aktif');await expect(page.locator('#autoImportSchedule')).toHaveText('Jadwal belum terkonfirmasi');await expect(page.locator('#autoImportJobs .sync-file')).toHaveCount(3);
});
test('source errors preserve reports and mobile status cards fit the viewport',async({page},testInfo)=>{
 await page.setViewportSize({width:390,height:844});const response=receipt();response.jobs[0].filename='SYNTHETIC_'+('NAMA_FILE_PANJANG_'.repeat(8))+'V001.xlsx';
 const state=await enter(page,{statusResponse:async n=>n===1?{status:200,body:response}:{status:503,body:{error:'Pemeriksaan sementara belum tersedia.'}}});
 await expect(page.locator('#autoImportJobs .sync-file')).toHaveCount(3);const box=await page.locator('#autoImportPanel').boundingBox();expect(box.width).toBeLessThanOrEqual(390);
 const metrics=await page.locator('.sync-file').evaluateAll(rows=>rows.map(x=>({scroll:x.scrollWidth,width:x.clientWidth,right:x.getBoundingClientRect().right})));expect(metrics.every(x=>x.scroll<=x.width+1&&x.right<=390)).toBe(true);
 await page.locator('#autoImportRefresh').click();await expect(page.locator('#autoImportError')).toContainText('Daftar terakhir tetap ditampilkan');await expect(page.locator('#autoImportJobs .sync-file')).toHaveCount(3);expect(state.builds()).toBe(0);
 const path=testInfo.outputPath('sync-v53-mobile-synthetic.png');await page.locator('#autoImportPanel').screenshot({path});await testInfo.attach('sync-v53-mobile-synthetic',{path,contentType:'image/png'});expect(state.errors).toEqual([]);
});
