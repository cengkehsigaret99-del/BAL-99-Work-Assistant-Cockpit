const {test,expect}=require('@playwright/test');
const {deflateSync}=require('node:zlib');
const {readFile}=require('node:fs/promises');

// Synthetic integration fixtures only. Never read private source files here.
const ROOT='http://127.0.0.1:8765/';
const API='https://jryfozndxpjymggevkgq.supabase.co';
const FIXED_NOW=new Date('2026-11-19T03:00:00.000Z');
const zip=payload=>({codec:'zlib-base64',data:deflateSync(Buffer.from(JSON.stringify(payload))).toString('base64')});
const snapshot=(version,cutoff,payload,extra={})=>({period:'2026-11',version,cutoff,status:'OPEN RECON',payload,...extra});
const titles={finished:'Stok barang jadi',excise:'Stok pita cukai',giling:'Hasil batangan harian',verpack:'Hasil Verpack per merek',materials:'Kapasitas bahan baku'};
const block=(page,id)=>page.locator('#infoPaper article section').filter({has:page.locator('h3',{hasText:titles[id]})});
const valueFor=(page,id,label)=>block(page,id).locator('tbody tr').filter({has:page.locator('th[scope="row"]',{hasText:label})}).locator('td').first();

function fixtures(revision=1){
  const finished={m:[
    ['FG-UJI-P','PRODUK UJI POSITIF',800,7,'SINTETIS',800],
    ['FG-UJI-U','PRODUK UJI TANPA FAKTOR',null,null,'SINTETIS',17],
    ['FG-UJI-N','PRODUK UJI NEGATIF',800,1,'SINTETIS',-3],
    ['FG-UJI-Z','PRODUK UJI NOL',600,1,'SINTETIS',0],
    ['FG-UJI-R','REFILL KUNING',600,1,'SINTETIS',0],
    ['FG-UJI-99','GCC 99',1000,1,'SINTETIS',0],
    ['FG-UJI-16','GCC 16',800,1,'SINTETIS',0]
  ],e:[[18,'MASUK','FG-UJI-P',null,null,revision===1?160:320],
       [18,'KELUAR','FG-UJI-P','SJ-UJI','CUSTOMER UJI',80]],cutoff:18,requested_through:'2026-11-19'};
  const materials={m:[['A-01','AMBREE GCC 99','PCS',24000,2,null],['RAW-UJI','BAHAN UJI LAIN','BOTOL',9,null,null]],
    e:[['A-01',18,revision===1?12000:24000,6000]],cutoff:18,
    capacity_basis_by_code:{'A-01':'SIMULASI A-01: asumsi 12 pcs/pack, 1.000 pack/karton; BOM belum disahkan'},
    date_coverage:{'2026-11-18':{status:'PARTIAL',codes:['A-01'],note:'Sumber sintetis parsial.'}},requested_through:'2026-11-19'};
  const excise=(division,opening,events,version='V001')=>snapshot(version,'2026-11-17',{
    cols:['day','in_qty','out_qty'],entries:events,opening_qty:opening,opening_nominal:null,
    valid_through:'2026-11-17',unit:'keping',notes:['SINTETIS']
  },{division,unit:'keping',valuation_basis:'SINTETIS'});
  const production=(division,qty,unit)=>snapshot('V001','2026-11-17',{
    cols:['day','in_qty','labor_nominal'],entries:[[17,qty,0]],opening_qty:0,opening_nominal:null,
    valid_through:'2026-11-17',unit,notes:['SINTETIS']
  },{division,unit,valuation_basis:'SINTETIS'});
  const sdm={w:[['GILING','G-UJI','PEKERJA UJI GILING'],['VERPACK','V-UJI','PEKERJA UJI VERPACK']],
    b:['—','GCC 99','GCC 16'],s:['NORMAL'],r:[[0,17,1,777,0,0],[1,17,1,1200,0,0],[1,17,2,400,0,0]],
    meta:{cutoff:'2026-11-17',documentIds:['SYNTHETIC-SDM-G','SYNTHETIC-SDM-V'],
      summaries:{'SDM GILING':{upahTanpaHasil:0},'SDM VERPACK':{upahTanpaHasil:0}}}};
  return {
    finished:[snapshot('V014','2026-11-17',zip({...finished,m:finished.m.map(r=>[...r.slice(0,5),1]),e:[],cutoff:17})),
      snapshot(revision===1?'V015':'V016','2026-11-18',zip(finished))],
    materials:[snapshot('V010','2026-11-16',zip({...materials,e:[],cutoff:16})),
      snapshot(revision===1?'V011':'V012','2026-11-18',zip(materials))],
    daily:[excise('CUKAI 10.325',999,[],'V000'),excise('CUKAI 10.325',100,[[17,50,20],[19,9000,0]]),
      excise('CUKAI 13.775',revision===1?200:1600,revision===1?[[17,0,25]]:[],revision===1?'V001':'V002'),
      excise('CUKAI REFILL',9,[]),excise('CUKAI UJI NOL',0,[]),excise('CUKAI UJI NEGATIF',-4,[]),
      production('GILING',revision===1?1555:1666,'batang'),production('VERPACK',1600,'pack')],
    sdm:[snapshot('V010','2026-11-17',zip(sdm),{source_document_ids:['SYNTHETIC-SDM-G','SYNTHETIC-SDM-V']})]
  };
}

async function prepare(page,{login=true}={}){
  await page.clock.setFixedTime(FIXED_NOW);
  const state={revision:1,hits:{},downloads:[]},errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('download',download=>state.downloads.push(download));
  await page.route(API+'/**',route=>{
    const url=route.request().url();let body=[];
    if(url.includes('/auth/v1/token'))body={access_token:'synthetic-info-token',expires_in:3600};
    else if(url.includes('/functions/v1/ppic-owner-check'))body={authorized:true,role:'owner'};
    else if(url.includes('/functions/v1/ppic-auto-import-status'))body={ok:true,config:{enabled:false,cadence:'HOURLY',timezone:'Asia/Jakarta',automation_id:null},jobs:[]};
    else if(url.includes('/auth/v1/logout'))body={};
    else{
      const key=url.match(/\/rest\/v1\/([^?]+)/)?.[1];
      if(key)state.hits[key]=(state.hits[key]||0)+1;
      const data=fixtures(state.revision);
      if(key==='ppic_finished_goods_owner_view')body=data.finished;
      else if(key==='ppic_material_daily_owner_view')body=data.materials;
      else if(key==='ppic_daily_owner_view')body=data.daily;
      else if(key==='ppic_sdm_weekly_owner_view')body=data.sdm;
    }
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(ROOT);
  async function signIn(){
    // Keep the app's prefilled owner identifier; every auth request is mocked.
    await page.locator('#ownerPassword').fill('synthetic-password');
    await page.locator('#loginButton').click();
    await expect(page.locator('#ppicMain')).toBeVisible();
    await expect(page.locator('#loginStatus')).toContainText('berhasil diperiksa');
    await page.locator('[data-view="info"]').click();
    await expect(page.locator('#info')).toBeVisible();
    await expect(page.locator('#infoDownload')).toBeEnabled();
    await expect(page.locator('#infoPaper article section')).toHaveCount(5);
  }
  if(login)await signIn();
  return {state,errors,signIn};
}

function jpegDimensions(bytes){
  if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8)throw Error('Not a JPEG SOI header');
  const sof=new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
  let offset=2;
  while(offset+3<bytes.length){
    if(bytes[offset]!==0xff)throw Error('Invalid JPEG marker');
    while(bytes[offset]===0xff)offset++;
    const marker=bytes[offset++];
    if(marker===0xd9||marker===0xda)break;
    if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
    if(offset+2>bytes.length)break;
    const length=bytes.readUInt16BE(offset);
    if(length<2||offset+length>bytes.length)throw Error('Invalid JPEG segment length');
    if(sof.has(marker))return {height:bytes.readUInt16BE(offset+3),width:bytes.readUInt16BE(offset+5)};
    offset+=length;
  }
  throw Error('JPEG dimensions were not found');
}

test('Info Harian is Owner-only and shows five sections with positive stock and honest source dates',async({page})=>{
  const {errors,signIn}=await prepare(page,{login:false});
  await expect(page.locator('#ppicMain')).toBeHidden();
  await expect(page.locator('[data-view="info"]')).toBeHidden();
  await expect(page.locator('#infoPaper')).toBeEmpty();
  await expect(page.locator('#infoDownload')).toBeDisabled();
  await signIn();
  await expect(page.locator('#infoDate')).toHaveValue('2026-11-19');
  await expect(page.locator('#infoPaper canvas')).toHaveCount(1);
  await expect(page.locator('#infoPaper article h3')).toHaveText(Object.values(titles));
  await expect(page.locator('#infoPaper article')).toContainText('Tanggal ringkasan: 19 November 2026');
  await expect(block(page,'finished').locator('tbody tr')).toHaveCount(2);
  await expect(valueFor(page,'finished','PRODUK UJI POSITIF')).toHaveText('1 karton + 80 pack');
  await expect(valueFor(page,'finished','PRODUK UJI TANPA FAKTOR')).toContainText('17 pack');
  await expect(block(page,'finished')).not.toContainText('PRODUK UJI NEGATIF');
  await expect(block(page,'finished')).not.toContainText('PRODUK UJI NOL');
  await expect(block(page,'finished').locator('p').first()).toHaveText(/Data 18 .*2026/);
  await expect(block(page,'excise').locator('tbody tr')).toHaveCount(3);
  await expect(block(page,'excise').locator('thead th')).toHaveText(['Kelompok pita','Saldo (keping)','Kapasitas (karton)']);
  await expect(block(page,'excise').locator('tbody tr').filter({hasText:'HJE 10.325'}).locator('td')).toHaveText(['130 keping','0,13 karton']);
  await expect(block(page,'excise').locator('tbody tr').filter({hasText:'HJE 13.775'}).locator('td')).toHaveText(['175 keping','0,2188 karton']);
  await expect(block(page,'excise').locator('tbody tr').filter({hasText:'Refill'}).locator('td')).toHaveText(['9 keping','Belum terverifikasi']);
  await expect(block(page,'excise')).not.toContainText('UJI NOL');
  await expect(block(page,'excise')).not.toContainText('UJI NEGATIF');
  await expect(block(page,'excise').locator('p').first()).toHaveText(/Data 17 .*2026/);
  await expect(block(page,'giling')).toContainText('1.555 batang');
  await expect(block(page,'giling')).not.toContainText('777 batang');
  await expect(block(page,'verpack')).toContainText('1,7 karton');
  await expect(block(page,'materials')).toContainText('≈ 2,5 karton');
  await expect(block(page,'materials').locator('p').first()).toContainText('parsial');
  expect(errors).toEqual([]);
});

test('as-of changes use historical stock; an unavailable month renders empty sections and disables JPG',async({page})=>{
  const {errors}=await prepare(page);
  await page.locator('#infoDate').fill('2026-11-17');
  await page.locator('#infoDate').dispatchEvent('change');
  await expect(valueFor(page,'finished','PRODUK UJI POSITIF')).toHaveText('1 karton');
  await expect(block(page,'materials')).toContainText('≈ 2 karton');
  await expect(block(page,'finished').locator('p').first()).toHaveText(/Data 17 .*2026/);
  await page.locator('#infoDate').fill('2026-10-19');
  await page.locator('#infoDate').dispatchEvent('change');
  await expect(page.locator('#infoStatus')).toContainText('Belum ada angka bersumber');
  await expect(page.locator('#infoDownload')).toBeDisabled();
  await expect(page.locator('#infoPaper canvas')).toHaveCount(1);
  await expect(page.locator('#infoPaper article section')).toHaveCount(5);
  await expect(page.locator('#infoPaper article tbody tr')).toHaveCount(0);
  await page.locator('#infoLatest').click();
  await expect(page.locator('#infoDate')).toHaveValue('2026-11-19');
  await expect(page.locator('#infoDownload')).toBeEnabled();
  await expect(valueFor(page,'finished','PRODUK UJI POSITIF')).toHaveText('1 karton + 80 pack');
  expect(errors).toEqual([]);
});

test('download creates exactly one real JPEG with the full preview dimensions',async({page},testInfo)=>{
  const {state,errors}=await prepare(page);
  const preview=await page.locator('#infoPaper canvas').evaluate(c=>({width:c.width,height:c.height}));
  await page.evaluate(()=>{
    const fillText=CanvasRenderingContext2D.prototype.fillText;
    window.__syntheticExportText=[];
    CanvasRenderingContext2D.prototype.fillText=function(text){
      window.__syntheticExportText.push(String(text));
      return fillText.apply(this,arguments);
    };
    window.__syntheticRestoreText=()=>{CanvasRenderingContext2D.prototype.fillText=fillText;};
  });
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#infoDownload').click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toBe('BAL_PPIC_INFO_HARIAN_2026-11-19.jpg');
  const destination=testInfo.outputPath('info-harian-synthetic.jpg');
  await download.saveAs(destination);
  expect(await download.failure()).toBeNull();
  const bytes=await readFile(destination);
  expect([...bytes.subarray(0,3)]).toEqual([0xff,0xd8,0xff]);
  expect([...bytes.subarray(-2)]).toEqual([0xff,0xd9]);
  const dimensions=jpegDimensions(bytes);
  expect(dimensions).toEqual(preview);
  expect(dimensions.width).toBe(1080);
  expect(dimensions.height).toBeGreaterThan(600);
  expect(dimensions.height).toBeLessThanOrEqual(12000);
  const exportText=await page.evaluate(()=>{
    window.__syntheticRestoreText();return window.__syntheticExportText.join(' ');
  });
  expect(exportText).toContain('Kapasitas (karton)');
  expect(exportText).toContain('0,13 karton');
  expect(exportText).toContain('0,2188 karton');
  expect(exportText).toContain('Belum terverifikasi');
  await expect(page.locator('#infoStatus')).toContainText('JPG siap:');
  await expect(page.locator('#infoDownload')).toBeEnabled();
  expect(state.downloads).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('refresh updates the JPG model from changed private sources without another login',async({page})=>{
  const {state,errors}=await prepare(page);
  const before={...state.hits};state.revision=2;
  await page.locator('#infoRefresh').click();
  await expect(valueFor(page,'finished','PRODUK UJI POSITIF')).toHaveText('1 karton + 240 pack');
  await expect(block(page,'giling')).toContainText('1.666 batang');
  await expect(block(page,'materials')).toContainText('≈ 3,5 karton');
  await expect(block(page,'excise').locator('tbody tr').filter({hasText:'HJE 13.775'}).locator('td')).toHaveText(['1.600 keping','2 karton']);
  await expect(page.locator('#infoDownload')).toBeEnabled();
  await expect(page.locator('#ownerLogin')).toBeHidden();
  for(const key of ['ppic_finished_goods_owner_view','ppic_material_daily_owner_view','ppic_daily_owner_view','ppic_sdm_weekly_owner_view'])
    expect(state.hits[key]).toBe((before[key]||0)+1);
  expect(errors).toEqual([]);
});

test('logout clears the visible canvas, semantic private content and download permission',async({page})=>{
  const {errors}=await prepare(page);
  await page.evaluate(()=>{window.__syntheticCanvas=document.querySelector('#infoPaper canvas');});
  await page.locator('#logoutOwner').click();
  await expect(page.locator('#ppicMain')).toBeHidden();
  await expect(page.locator('#infoPaper')).toBeEmpty();
  await expect(page.locator('#infoPaper canvas')).toHaveCount(0);
  await expect(page.locator('#infoPaper article')).toHaveCount(0);
  await expect(page.locator('#infoDownload')).toBeDisabled();
  await expect(page.locator('#infoStatus')).toContainText('Masuk sebagai Owner');
  expect(await page.evaluate(()=>({width:window.__syntheticCanvas.width,height:window.__syntheticCanvas.height}))).toEqual({width:1,height:1});
  expect(errors).toEqual([]);
});

test('logout aborts a pending JPEG even when Owner signs in again before encoding completes',async({page})=>{
  const {state,errors,signIn}=await prepare(page);
  await page.evaluate(()=>{
    const originalToBlob=HTMLCanvasElement.prototype.toBlob;
    const originalExport=window.PpicDailyInfo.exportJpeg;
    window.__syntheticEncodingStarted=false;window.__syntheticExportSettled=false;
    HTMLCanvasElement.prototype.toBlob=function(callback,type,quality){
      const canvas=this;window.__syntheticExportCanvas=canvas;
      window.__syntheticReleaseEncoding=()=>{
        HTMLCanvasElement.prototype.toBlob=originalToBlob;
        originalToBlob.call(canvas,callback,type,quality);
      };
      window.__syntheticEncodingStarted=type==='image/jpeg';
    };
    window.PpicDailyInfo.exportJpeg=async function(){
      try{return await originalExport.apply(this,arguments);}
      finally{window.__syntheticExportSettled=true;}
    };
  });
  await page.locator('#infoDownload').click();
  await expect.poll(()=>page.evaluate(()=>window.__syntheticEncodingStarted)).toBe(true);
  await expect(page.locator('#infoDownload')).toBeDisabled();
  await page.locator('#logoutOwner').click();
  await expect(page.locator('#ppicMain')).toBeHidden();
  await expect(page.locator('#infoPaper')).toBeEmpty();
  await expect(page.locator('#infoDownload')).toBeDisabled();
  await signIn();
  const freshStatus=await page.locator('#infoStatus').textContent();
  await page.evaluate(()=>window.__syntheticReleaseEncoding());
  await expect.poll(()=>page.evaluate(()=>window.__syntheticExportSettled)).toBe(true);
  await expect(page.locator('#ppicMain')).toBeVisible();
  await expect(page.locator('#infoPaper article section')).toHaveCount(5);
  await expect(page.locator('#infoDownload')).toBeEnabled();
  await expect(page.locator('#infoStatus')).toHaveText(freshStatus);
  expect(state.downloads).toHaveLength(0);
  expect(await page.evaluate(()=>({width:window.__syntheticExportCanvas.width,height:window.__syntheticExportCanvas.height}))).toEqual({width:0,height:0});
  expect(errors).toEqual([]);
});

test('390px mobile layout keeps controls and the complete preview inside the viewport',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  const {errors}=await prepare(page);
  await expect(page.locator('#infoDate')).toBeVisible();
  await expect(page.locator('#infoDownload')).toBeVisible();
  const geometry=await page.locator('#info').evaluate(root=>({
    viewport:window.innerWidth,page:document.documentElement.scrollWidth,
    boxes:[root,...root.querySelectorAll('.info-controls input,.info-controls button,#infoPaper,#infoPaper canvas')]
      .map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};})
  }));
  expect(geometry.page).toBeLessThanOrEqual(geometry.viewport+1);
  for(const box of geometry.boxes){
    expect(box.left).toBeGreaterThanOrEqual(-1);
    expect(box.right).toBeLessThanOrEqual(geometry.viewport+1);
    expect(box.width).toBeLessThanOrEqual(geometry.viewport+1);
  }
  await expect(page.locator('#infoPaper article section')).toHaveCount(5);
  await page.locator('#info').screenshot({path:testInfo.outputPath('info-mobile-synthetic.png')});
  expect(errors).toEqual([]);
});
