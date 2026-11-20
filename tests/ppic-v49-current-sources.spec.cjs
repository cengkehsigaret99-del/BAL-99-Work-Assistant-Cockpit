const {test,expect}=require('@playwright/test');
const {deflateSync}=require('node:zlib');

// All names, document IDs, movements, prices and balances are synthetic.
// Never load private workbooks, production payloads or customer records here.
const ROOT='http://127.0.0.1:8765/';
const API='https://jryfozndxpjymggevkgq.supabase.co';
const pack=data=>({codec:'zlib-base64',data:deflateSync(Buffer.from(JSON.stringify(data))).toString('base64')});
const envelope=(version,source,payload,cutoff='2026-11-18')=>({
  period:'2026-11',cutoff,version,status:'OPEN RECON',source_document_id:source,payload:pack(payload)
});

function fixtures(){
  const finished={
    m:[
      ['FG-UJI-800','PRODUK UJI 800',800,7,'BIAYA SINTETIS',800],
      ['FG-UJI-600','PRODUK UJI 600',600,3,'BIAYA SINTETIS',600],
      ['FG-UJI-NULL','PRODUK UJI TANPA KONVERSI',null,null,'BELUM TERSEDIA',10],
      ['FG-UJI-NEG','PRODUK UJI NEGATIF',800,2,'BIAYA SINTETIS',-2]
    ],
    e:[[18,'MASUK','FG-UJI-800',null,null,160],
       [18,'KELUAR','FG-UJI-800','SJ-UJI-A','CUSTOMER UJI',80],
       [18,'KELUAR','FG-UJI-600','SJ-UJI-B','CUSTOMER UJI',60]],
    cutoff:18,requested_through:'2026-11-19',valuation:'Biaya sintetis; bukan harga jual.'
  };
  const materials={
    m:[['RAW-UJI-P','BAHAN UJI HARGA','PCS',100,2,null],
       ['RAW-UJI-U','BAHAN UJI TANPA HARGA','BOTOL',9,null,null],
       ['RAW-UJI-R','BAHAN UJI OPNAME','ROLL',20,3,null]],
    e:[['RAW-UJI-P',17,5,2],['RAW-UJI-P',18,10,3],['RAW-UJI-R',17,0,5]],
    cutoff:18,requested_through:'2026-11-19',
    date_coverage:{'2026-11-18':{status:'PARTIAL',codes:['RAW-UJI-P'],note:'18 November hanya bahan uji P; hari belum lengkap.'}},
    stock_adjustments:[{code:'RAW-UJI-R',day:17,out_qty:3,in_qty:0,reason:'STOCK_OPNAME',note:'OPNAME SINTETIS'}]
  };
  const fg=envelope('V015','SYNTHETIC-BJ-CURRENT',finished);
  const mat=envelope('V011','SYNTHETIC-BB-CURRENT',materials);
  const olderFg=envelope('V014','SYNTHETIC-BJ-OLD',{
    ...finished,m:finished.m.map(row=>[...row.slice(0,5),1]),e:[],cutoff:17
  },'2026-11-17');
  const olderMat=envelope('V010','SYNTHETIC-BB-OLD',{
    ...materials,m:materials.m.map(row=>[...row.slice(0,3),1,row[4],row[5]]),e:[],cutoff:16
  },'2026-11-16');
  const doRows=[{sj:901,date:'2026-11-18',customer:'CUSTOMER UJI',destination:'TUJUAN UJI',area:'AREA UJI',
    sku:'DO-UJI',brand:'PRODUK DO UJI',hje:5000,kind:'REGULER',pack:7,price:9,nominal:63,basis:'SINTETIS'}];
  const doSnap=(version,source,rows,cutoff)=>({period:'2026-11',version,source_document_id:source,
    cutoff,status:'OPEN RECON',rows});
  const doc=(document_id,division,version)=>({document_id,division,period:'2026-11',version,
    cutoff:'2026-11-17T17:00:00Z',reconciliation_status:'OPEN RECON',access_class:'CONFIDENTIAL',ingested_at:'2026-11-19T00:00:00Z'});
  return {fg,mat,
    // Deliberately unsorted: neither first nor last is the current snapshot.
    finished:[olderFg,fg,{...olderFg,version:'V009'}],
    materials:[olderMat,mat,{...olderMat,version:'V009'}],
    customers:[doSnap('V012','SYNTHETIC-DO-OLD',[{...doRows[0],pack:1,nominal:9}],'2026-11-17'),
      doSnap('V014','SYNTHETIC-DO-CURRENT',doRows,'2026-11-18'),
      doSnap('V009','SYNTHETIC-DO-OLDER',[],'2026-11-16')],
    documents:[doc('SYNTHETIC-BJ-CURRENT','BARANG JADI','V015'),
      doc('SYNTHETIC-BJ-ARCHIVE','BARANG JADI','V016'),
      doc('SYNTHETIC-BJ-OLD','BARANG JADI','V014'),
      doc('SYNTHETIC-BB-CURRENT','BAHAN BAKU','V011'),
      doc('SYNTHETIC-DO-CURRENT','DO','V014')]
  };
}

async function setup(page){
  const data=fixtures(),errors=[],state={uploads:0};
  page.on('pageerror',error=>errors.push(error.message));
  await page.route(API+'/**',route=>{
    const url=route.request().url();let body=[];
    if(url.includes('/auth/v1/token'))body={access_token:'synthetic-owner-token',expires_in:3600};
    else if(url.includes('/functions/v1/ppic-owner-check'))body={authorized:true,role:'owner'};
    else if(url.includes('/functions/v1/ppic-auto-import-status'))body={ok:true,config:{enabled:false,cadence:'HOURLY',timezone:'Asia/Jakarta',automation_id:null},jobs:[]};
    else if(url.includes('/auth/v1/logout'))body={};
    else if(url.includes('/rest/v1/ppic_source_catalog'))body=data.documents;
    else if(url.includes('/rest/v1/ppic_finished_goods_owner_view'))body=data.finished;
    else if(url.includes('/rest/v1/ppic_material_daily_owner_view'))body=data.materials;
    else if(url.includes('/rest/v1/ppic_do_customer_owner_view'))body=data.customers;
    else if(url.includes('/functions/v1/ppic-owner-upload')){state.uploads++;body={document_id:'SYNTHETIC-UPLOAD'};}
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(ROOT);
  await page.locator('#ownerPassword').fill('synthetic-password');
  await page.locator('#loginButton').click();
  await expect(page.locator('#ppicMain')).toBeVisible();
  await expect(page.locator('#loginStatus')).toContainText('berhasil diperiksa');
  return {data,errors,state};
}
async function view(page,name){
  const button=page.locator('[data-view="'+name+'"]');
  if(await button.isHidden())await page.locator('#ppicDivisionsToggle').click();
  await button.click();
}
const row=(page,table,firstCell)=>page.locator(table+' tr').filter({has:page.locator('td:first-child',{hasText:firstCell})});

test('unsorted snapshots select BJ V015, DO V014 and BB V011 with cutoff18; day19 stays unknown',async({page})=>{
  const {errors}=await setup(page);
  await view(page,'finished');
  await expect(page.locator('#fgStatus')).toContainText('V015');
  await expect(page.locator('#fgStatus')).toContainText('18 November 2026');
  await expect(page.locator('#fgDate')).toHaveValue('2026-11-18');
  await expect(row(page,'#fgBalances','FG-UJI-800').locator('td').nth(5)).toHaveText('880');
  await expect(page.locator('#fgDaily tr')).toHaveCount(30);
  await expect(row(page,'#fgDaily','2026-11-19').locator('td')).toHaveText([
    '2026-11-19',...Array(12).fill('—'),'BELUM ADA DATA'
  ]);
  await page.locator('#fgDate').fill('2026-11-19');
  await page.locator('#fgDate').dispatchEvent('change');
  await expect(page.locator('#fgStatus')).toContainText('BELUM ADA DATA');
  await expect(page.locator('#fgBalances tr')).toHaveCount(0);
  await expect(page.locator('#fgTransactions tr')).toHaveCount(0);
  await expect(page.locator('#fgMetrics')).toBeEmpty();
  await page.locator('#fgPrint').click();
  const pdf=await page.locator('#previewFrame').getAttribute('srcdoc');
  expect(pdf).toContain('V015');
  expect(pdf).toContain('BELUM ADA DATA');
  expect(pdf).toContain('Saldo akhir tidak diisi dengan saldo tanggal sebelumnya');
  await page.locator('#closePreview').click();
  await view(page,'customers');
  await expect(page.locator('#doStatus')).toContainText('V014');
  await expect(page.locator('#doStatus')).toContainText('2026-11-18');
  await expect(page.locator('#doMetrics')).toContainText('Rp 63');
  await expect(page.locator('#doDetails tr')).toHaveCount(1);
  await view(page,'materials');
  await expect(page.locator('#matStatus')).toContainText('V011');
  await expect(page.locator('#matStatus')).toContainText('18 November 2026');
  await expect(row(page,'#matRows','2026-11-18').locator('td').nth(5)).toHaveText('110');
  await expect(row(page,'#matRows','2026-11-19').locator('td')).toHaveText([
    '2026-11-19',...Array(10).fill('—'),'BELUM ADA DATA'
  ]);
  expect(errors).toEqual([]);
});

test('BJ preserves each SKU factor, unknown cost/conversion and negative book stock',async({page})=>{
  const {errors}=await setup(page);await view(page,'finished');
  const a=row(page,'#fgBalances','FG-UJI-800').locator('td');
  await expect(a.nth(6)).toHaveText('800');await expect(a.nth(7)).toHaveText('1,1');
  await expect(a.nth(8)).toHaveText('1');await expect(a.nth(9)).toHaveText('80');
  const b=row(page,'#fgBalances','FG-UJI-600').locator('td');
  await expect(b.nth(5)).toHaveText('540');await expect(b.nth(6)).toHaveText('600');
  await expect(b.nth(7)).toHaveText('0,9');await expect(b.nth(9)).toHaveText('540');
  const unknown=row(page,'#fgBalances','FG-UJI-NULL').locator('td');
  for(const col of [6,7,8,9,10])await expect(unknown.nth(col)).toHaveText('—');
  await expect(unknown.nth(11)).toContainText('KONVERSI BELUM ADA');
  await expect(unknown.nth(11)).toContainText('BIAYA BELUM ADA');
  const negative=row(page,'#fgBalances','FG-UJI-NEG').locator('td');
  await expect(negative.nth(5)).toHaveText('-2');
  await expect(negative.nth(8)).toHaveText('—');await expect(negative.nth(9)).toHaveText('—');
  await expect(negative.nth(11)).toContainText('SALDO NEGATIF');
  await expect(page.locator('#fgMetrics')).toContainText('Belum lengkap');
  await expect(page.locator('#fgMetrics')).toContainText('1 SKU / 2 pack');
  await page.locator('#fgPrint').click();
  const html=await page.locator('#previewFrame').getAttribute('srcdoc');
  expect(html).toContain('KONVERSI BELUM ADA');expect(html).toContain('SALDO NEGATIF');
  expect(html).toContain('Faktor kosong tidak dianggap nol');
  expect(errors).toEqual([]);
});

test('BB separates opname from routine usage and marks partial coverage without zero pricing',async({page})=>{
  const {errors}=await setup(page);await view(page,'materials');
  await expect(row(page,'#matRows','2026-11-18').locator('td').nth(11)).toContainText('PARSIAL');
  await page.locator('#matSelect').selectOption('RAW-UJI-R');
  const day17=row(page,'#matRows','2026-11-17').locator('td');
  await expect(day17.nth(1)).toHaveText('20');await expect(day17.nth(3)).toHaveText('2');
  await expect(day17.nth(4)).toHaveText('3');await expect(day17.nth(5)).toHaveText('15');
  await expect(day17.nth(8)).toHaveText('6');await expect(day17.nth(9)).toHaveText('9');
  await expect(page.locator('#matSummary .metric').nth(2)).toContainText('2 ROLL');
  await expect(page.locator('#matSummary .metric').nth(3)).toContainText('3 ROLL');
  const partial=row(page,'#matRows','2026-11-18').locator('td');
  for(const col of [2,3,4])await expect(partial.nth(col)).toHaveText('—');
  await expect(partial.nth(5)).toHaveText('15');
  await expect(partial.nth(11)).toContainText('HARI BELUM LENGKAP');
  await page.locator('#matSelect').selectOption('RAW-UJI-U');
  await expect(page.locator('#matStatus')).toContainText('HARGA BELUM TERSEDIA');
  await expect(page.locator('#matStatus')).toContainText('BOTOL');
  await expect(page.locator('#matSummary')).not.toContainText('Rp 0');
  for(const col of [6,7,8,9,10])await expect(row(page,'#matRows','2026-11-01').locator('td').nth(col)).toHaveText('—');
  await page.locator('#matPrint').click();
  const html=await page.locator('#previewFrame').getAttribute('srcdoc');
  expect(html).toContain('BELUM ADA HARGA');expect(html).toContain('Belum dinilai');
  expect(html).toContain('Harga kosong tidak dianggap nol');
  expect(errors).toEqual([]);
});

test('filename suggests source cutoff and version while Bank Data distinguishes active sources and archives',async({page})=>{
  const {state,errors}=await setup(page);await view(page,'data');
  await expect(page.locator('#docs tr').filter({hasText:'SYNTHETIC-BJ-CURRENT'})).toContainText('TERPAKAI');
  await expect(page.locator('#docs tr').filter({hasText:'SYNTHETIC-BJ-ARCHIVE'})).toContainText('ARSIP · BELUM TERKAIT LAPORAN AKTIF');
  await expect(page.locator('#docs tr').filter({hasText:'SYNTHETIC-BJ-OLD'})).toContainText('SUMBER VERSI SEBELUMNYA');
  await view(page,'upload');
  await expect(page.locator('#uploadCutoff')).toHaveValue('');
  await expect(page.locator('#uploadVersion')).toHaveValue('');
  // Synthetic header bytes only: this fixture is never submitted to storage.
  await page.locator('#uploadFile').setInputFiles({
    name:'SYNTHETIC_BARANG_JADI_NOVEMBER_2026_V015_CUTOFF_18NOV.xlsx',
    mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer:Buffer.concat([Buffer.from([0x50,0x4b,0x03,0x04]),Buffer.alloc(124)])
  });
  await expect(page.locator('#uploadDivision')).toHaveValue('BARANG JADI');
  await expect(page.locator('#uploadPeriod')).toHaveValue('2026-11');
  await expect(page.locator('#uploadCutoff')).toHaveValue('2026-11-18');
  await expect(page.locator('#uploadVersion')).toHaveValue('V015');
  await expect(page.locator('#uploadMetaHint')).toContainText('nama file tidak memverifikasi isi transaksi');
  await page.locator('#uploadCutoff').fill('2026-11-19');
  await page.locator('#uploadSubmit').click();
  await expect(page.locator('#uploadStatus')).toContainText('Metadata form berbeda dari nama file');
  expect(state.uploads).toBe(0);expect(errors).toEqual([]);
});

test('logout discards in-flight decoded material and finished-goods snapshots',async({page})=>{
  const {data,errors}=await setup(page);
  await page.evaluate(({fg,mat})=>{
    window.__syntheticPending=[];
    for(const name of ['fgDecode','matDecode']){
      const original=window[name];
      window[name]=async snapshot=>{
        const decoded=await original(snapshot);
        return new Promise(resolve=>window.__syntheticPending.push(()=>resolve(decoded)));
      };
    }
    window.__syntheticReload=Promise.all([window.ppicSetFinished([fg]),window.ppicSetMaterials([mat])]);
  },{fg:data.fg,mat:data.mat});
  await expect.poll(()=>page.evaluate(()=>window.__syntheticPending.length)).toBe(2);
  await page.locator('#logoutOwner').click();
  await expect(page.locator('#ppicMain')).toBeHidden();
  await page.evaluate(async()=>{
    for(const release of window.__syntheticPending)release();
    await window.__syntheticReload;
  });
  for(const selector of ['#fgBalances','#fgTransactions','#fgDaily','#fgMetrics','#matRows','#matSummary'])
    await expect(page.locator(selector)).toBeEmpty();
  await expect(page.locator('#fgPrint')).toBeDisabled();
  await expect(page.locator('#matPrint')).toBeDisabled();
  await expect(page.locator('#matSelect option')).toHaveCount(1);
  await expect(page.locator('#fgSku option')).toHaveCount(1);
  await expect(page.locator('#previewFrame')).toHaveAttribute('srcdoc','');
  expect(errors).toEqual([]);
});
