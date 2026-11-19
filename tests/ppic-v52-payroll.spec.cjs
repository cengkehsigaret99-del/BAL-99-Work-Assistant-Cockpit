const {test,expect}=require('@playwright/test');
const zlib=require('zlib');
const fs=require('fs');
const payroll=require('../payroll.js');
const ROOT=process.env.PPIC_TEST_BASE_URL||'http://127.0.0.1:8765/';
const API='https://jryfozndxpjymggevkgq.supabase.co';
const docG='SYNTHETIC_GILING_PAYROLL',docV='SYNTHETIC_VERPACK_PAYROLL';
const workers=Array.from({length:7},(_,i)=>[i<5?'GILING':'VERPACK','UJI'+i,'PEKERJA UJI '+i]);
const compact={w:workers,b:['GCC 99','GCC 16'],s:['NORMAL'],r:workers.flatMap((_,i)=>[[i,13,i<5?0:1,i<5?1000:5,i<5?40000:1050,0],[i,14,0,0,0,0]]),meta:{period:'2026-11',cutoff:'2026-11-19',documentIds:[docG,docV],consideredSourceIds:[docG,docV],payroll:{bonusPolicy:'OFF',periodStart:'2026-11-13',periodEnd:'2026-11-19',sourceCutoffByDivision:{GILING:'2026-11-19',VERPACK:'2026-11-19'},workers:{},holds:[{div:'VERPACK',id:null,name:'PEKERJA HOLD UJI',date:'2026-11-18',qty:300,wage:63000,reason:'Identitas belum terverifikasi'}],pending:[{div:'VERPACK',id:'UJI5',name:'PEKERJA UJI 5',qty:250,wage:52500,reason:'Tanggal belum terverifikasi'}]}}};
const snap={period:'2026-11',version:'V011',cutoff:'2026-11-19',status:'WORKING / OPEN RECON',source_document_ids:[docG,docV],payload:{codec:'zlib-base64',data:zlib.deflateSync(Buffer.from(JSON.stringify(compact))).toString('base64')}};
async function enter(page){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(API+'/**',route=>{const u=route.request().url();let data=[];
  if(u.includes('/auth/v1/token'))data={access_token:'fake-payroll-only',expires_in:3600};
  else if(u.includes('/functions/v1/ppic-owner-check'))data={authorized:true,role:'owner'};
  else if(u.includes('/rest/v1/ppic_source_catalog'))data=[docG,docV].map((document_id,i)=>({document_id,division:i?'SDM VERPACK':'SDM GILING',period:'2026-11',version:'V010',ingested_at:'2026-11-19T10:00:00Z'}));
  else if(u.includes('/rest/v1/ppic_sdm_weekly_owner_view'))data=[snap];
  else if(u.includes('/functions/v1/ppic-sdm-rebuild'))data={ok:true,rows:14,workers:7,cutoff:'2026-11-19'};
  else if(u.includes('/auth/v1/logout'))data={};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(ROOT);await page.locator('#ownerPassword').fill('fake-only');await page.locator('#loginButton').click();await expect(page.locator('#ppicMain')).toBeVisible();
 if(await page.locator('#ppicDivisionsList').isHidden())await page.locator('#ppicDivisionsToggle').click();
 await page.locator('[data-view="sdm"]').click();await expect(page.locator('#payrollSlips')).toBeEnabled();return errors;
}
test('payroll print follows division/name scope, keeps existing reports, and clears on logout',async({page})=>{
 const errors=await enter(page);
 await expect(page.locator('#sdmPrintGiling')).toBeEnabled();await expect(page.locator('#payrollGross')).toHaveText('Rp 200.000');
 await page.locator('#sdmSearch').fill('UJI1');await expect(page.locator('#payrollRecipients')).toHaveText('1');await page.locator('#payrollSlips').click();
 let html=await page.locator('#previewFrame').getAttribute('srcdoc');expect(html).toContain('PEKERJA UJI 1');expect(html).not.toContain('PEKERJA UJI 0');expect(html).toContain('Potongan / kasbon');expect(html).toContain('Belum ditetapkan');
 await page.locator('#closePreview').click();await page.locator('#sdmSearch').fill('');await page.locator('#sdmDiv').selectOption('VERPACK');
 await expect(page.locator('#payrollGross')).toHaveText('Rp 65.100');await expect(page.locator('#payrollCashGross')).toHaveText('Rp 2.100');await expect(page.locator('#payrollRecipients')).toHaveText('2');
 await page.locator('#payrollCash').click();html=await page.locator('#previewFrame').getAttribute('srcdoc');expect(html).toContain('HOLD');expect(html).toContain('52.500');expect(html).toContain('Sisa yang belum terwakili pecahan: Rp 100');expect(html).toContain('KEBUTUHAN PECAHAN TUNAI');
 await page.locator('#logoutOwner').click();await expect(page.locator('#ppicMain')).toBeHidden();await expect(page.locator('#previewModal')).toBeHidden();await expect(page.locator('#payrollSlips')).toBeDisabled();await expect(page.locator('#payrollGross')).toHaveText('—');expect(await page.locator('#previewFrame').getAttribute('srcdoc')).toBeFalsy();expect(errors).toEqual([]);
});
test('mobile controls and slip preview fit viewport; print uses intact 4-card sheets',async({page})=>{
 await page.setViewportSize({width:390,height:844});await enter(page);
 const box=await page.locator('#sdmPayroll').boundingBox();expect(box.width).toBeLessThanOrEqual(390);await page.locator('#payrollSlips').click();
 const frame=page.frameLocator('#previewFrame');await expect(frame.locator('.slip')).toHaveCount(5);
 const metrics=await frame.locator('body').evaluate(e=>({scroll:e.scrollWidth,width:e.clientWidth}));expect(metrics.scroll).toBeLessThanOrEqual(metrics.width+1);
 await page.emulateMedia({media:'print'});
 const sizes=await frame.locator('.giling-grid').evaluateAll(grids=>grids.map(g=>({cards:g.querySelectorAll('.slip').length,height:g.getBoundingClientRect().height,over:[...g.querySelectorAll('.slip')].some(c=>c.scrollHeight>c.clientHeight+2)})));
 expect(sizes.map(x=>x.cards)).toEqual([4,1]);expect(sizes.every(x=>!x.over)).toBe(true);
});
test('invalid date range disables payroll output without changing data',async({page})=>{
 await enter(page);await page.locator('#sdmStart').fill('2026-11-20');await expect(page.locator('#payrollSlips')).toBeDisabled();await expect(page.locator('#payrollCash')).toBeDisabled();await expect(page.locator('#payrollState')).toContainText('Periksa rentang');
});
test('synthetic PDF and screenshot evidence retain complete slip cards and page footers',async({page},testInfo)=>{
 const dense=JSON.parse(JSON.stringify(compact));
 for(let i=7;i<65;i++){dense.w.push(['VERPACK','UJI'+i,i%3===0?'PEKERJA UJI NAMA PANJANG UNTUK PEMBUNGKUSAN BARIS '+i:'PEKERJA UJI '+i]);dense.r.push([i,13,1,5,1050,0]);}
 const model=payroll.buildModel(dense,{period:'2026-11',division:'GABUNGAN',start:'2026-11-13',end:'2026-11-19'});
 for(const kind of ['slips','cash']){
  const html=payroll.renderDocument(model,{kind,logoUrl:ROOT+'bal-logo-user.webp'});
  await page.setContent(html,{waitUntil:'networkidle'});await page.emulateMedia({media:'print'});
  const metrics=await page.locator('.sheet').evaluateAll(sheets=>sheets.map(s=>({height:s.getBoundingClientRect().height,maxHeight:(s.classList.contains('landscape')?190:277)*96/25.4,content:s.querySelector('.sheet-content').getBoundingClientRect().height,footer:s.querySelector('footer').getBoundingClientRect().top-s.getBoundingClientRect().top,children:[...s.querySelectorAll('.slip')].map(c=>({height:c.clientHeight,scroll:c.scrollHeight}))})));
  const pdfPath=testInfo.outputPath('synthetic-'+kind+'.pdf');const pdf=await page.pdf({path:pdfPath,preferCSSPageSize:true,printBackground:true});await testInfo.attach('synthetic-'+kind+'-pdf',{path:pdfPath,contentType:'application/pdf'});
  await page.emulateMedia({media:'screen'});await page.setViewportSize({width:1250,height:1000});
  const pngPath=testInfo.outputPath('synthetic-'+kind+'.png');await page.locator('.sheet').first().screenshot({path:pngPath});await testInfo.attach('synthetic-'+kind+'-png',{path:pngPath,contentType:'image/png'});
  const detail=kind==='slips'?page.locator('.sheet').filter({has:page.locator('.slip.large')}).first():page.locator('.sheet.landscape').filter({has:page.locator('.denoms')}).first();
  const detailPath=testInfo.outputPath('synthetic-'+kind+'-detail.png');await detail.screenshot({path:detailPath});await testInfo.attach('synthetic-'+kind+'-detail-png',{path:detailPath,contentType:'image/png'});
  fs.writeFileSync(testInfo.outputPath('synthetic-'+kind+'-metrics.json'),JSON.stringify(metrics,null,2));
  expect(metrics.filter(m=>m.height>m.maxHeight+2||m.content>m.height+2||m.children.some(c=>c.scroll>c.height+2)).slice(0,4)).toEqual([]);
  expect((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length).toBe(metrics.length);
 }
});
