const {test, expect} = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

// Presentation fixtures only: no private data, files or live API calls.
const renderer = path.resolve(__dirname, '../daily-info.js');
function fixture() {
  return {asOf:'2026-11-19',title:'Info Harian',company:'PERUSAHAAN UJI',status:'WORKING / OPEN RECON',sections:[
    {id:'bj',title:'Barang Jadi',dateLabel:'Stok buku per 18 November 2026',columns:['Merek / jenis','Stok'],
      rows:Array.from({length:9},(_,i)=>({label:'Produk Sintetis '+(i+1),value:(i+1)+' karton + '+(i*13)+' pack'})),
      notes:['19 November: belum ada data.']},
    {id:'pita',title:'Pita Cukai',dateLabel:'Posisi sumber: 17 November 2026',columns:['Kelompok','Sisa'],
      rows:[{label:'Kelompok Bersama Uji',value:'1.234 keping',detail:'Alokasi per merek belum tersedia.'}],
      total:{label:'Total sumber uji',value:'1.234 keping'}},
    {id:'batangan',title:'Batangan',dateLabel:'Produksi: 18 November 2026',columns:['Hasil harian','Jumlah'],
      rows:[{label:'Total produksi uji',value:'12.345 batang'}]},
    {id:'verpack',title:'Verpack',dateLabel:'Produksi: 18 November 2026',columns:['Merek','Hasil'],
      rows:[{label:'Verpack Uji A',value:'7 karton'},{label:'Verpack Uji B',value:'Belum ada data'}]},
    {id:'bb',title:'Bahan Baku',dateLabel:'Stok parsial: 18 November 2026',columns:['Bahan','Estimasi kapasitas'],
      rows:[{label:'BAHAN SINTETIS',value:'9,5 karton'}],notes:['Simulasi bahan uji; bukan kapasitas produksi final.','CATATAN AKHIR SINTETIS']}
  ]};
}

async function setup(page) {
  await page.setContent('<main><div id="preview"></div></main>');
  await page.addScriptTag({path:renderer});
}

test('renders all five sections, preserves literal values and wraps without drawing outside the canvas', async({page})=>{
  await setup(page);
  const model=fixture();
  model.sections[0].rows[0].label='Merek dengan nama panjang untuk memastikan seluruh kata tampil dan tidak dipotong pada ujung kolom';
  const result=await page.evaluate(model=>{
    const canvas=document.createElement('canvas');
    const ctx=canvas.getContext('2d'),draws=[];
    const original=ctx.fillText.bind(ctx);
    ctx.fillText=function(value,x,y){
      const width=this.measureText(value).width;
      const left=this.textAlign==='right'?x-width:x;
      draws.push({value,left,right:left+width,y,size:Number(this.font.match(/([\d.]+)px/)[1])});
      original(value,x,y);
    };
    const output=PpicDailyInfo.render(canvas,model);
    return {width:output.width,height:output.height,draws,
      corner:Array.from(ctx.getImageData(0,0,1,1).data)};
  },model);
  expect(result.width).toBe(1080);
  expect(result.height).toBeGreaterThan(1200);
  expect(result.height).toBeLessThan(3000);
  expect(result.corner).toEqual([255,255,255,255]);
  const text=result.draws.map(x=>x.value).join(' ');
  for(const section of model.sections){expect(text).toContain(section.title);expect(text).toContain(section.dateLabel);}
  expect(text).toContain('tidak dipotong pada ujung kolom');
  expect(text).toContain('Belum ada data');
  expect(text).toContain('CATATAN AKHIR SINTETIS');
  for(const draw of result.draws){
    expect(draw.left).toBeGreaterThanOrEqual(55);
    expect(draw.right).toBeLessThanOrEqual(1025);
    expect(draw.y).toBeGreaterThanOrEqual(0);
    expect(draw.y+draw.size).toBeLessThan(result.height);
  }
});

test('mount provides semantic accessible text and treats source markup as literal text',async({page})=>{
  await setup(page);
  const model=fixture();
  model.sections[0].rows[0].label='<img src=x onerror="window.pwned=true">';
  model.sections[0].rows[0].detail='<script>window.pwned=true</script>';
  model.sections[1].columns=['Kelompok','Sisa','Keterangan'];
  model.sections[3].rows=[];
  model.sections[3].emptyText='Hasil belum tersedia; bukan nol.';
  await page.evaluate(model=>PpicDailyInfo.mount(document.querySelector('#preview'),model),model);
  const article=page.locator('#preview article');
  await expect(article.locator('h3')).toHaveText(['Barang Jadi','Pita Cukai','Batangan','Verpack','Bahan Baku']);
  await expect(article.locator('table')).toHaveCount(4);
  await expect(article).toContainText('<img src=x onerror="window.pwned=true">');
  await expect(article).toContainText('<script>window.pwned=true</script>');
  await expect(article).toContainText('Hasil belum tersedia; bukan nol.');
  await expect(page.locator('#preview img, #preview script')).toHaveCount(0);
  expect(await page.evaluate(()=>window.pwned)).toBeUndefined();
  await expect(page.locator('#preview canvas')).toHaveAttribute('aria-hidden','true');
  await expect(article).toHaveAttribute('aria-label','Info Harian');
});

test('JPEG export uses a real JPEG Blob and a safe dated filename',async({page})=>{
  await setup(page);
  const downloadPromise=page.waitForEvent('download');
  const result=await page.evaluate(async model=>{
    const result=await PpicDailyInfo.exportJpeg(model,{isCurrent:()=>true});
    return {filename:result.filename,width:result.width,height:result.height,type:result.blob.type};
  },fixture());
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toBe('BAL_PPIC_INFO_HARIAN_2026-11-19.jpg');
  expect(result.filename).toBe(download.suggestedFilename());
  expect(result.type).toBe('image/jpeg');
  expect(result.width).toBe(1080);
  expect(result.height).toBeGreaterThan(1200);
  const bytes=fs.readFileSync(await download.path());
  expect(Array.from(bytes.subarray(0,3))).toEqual([255,216,255]);
  expect(Array.from(bytes.subarray(-2))).toEqual([255,217]);
});

test('export aborts after delayed encoding when the private session becomes stale',async({page})=>{
  await setup(page);
  const result=await page.evaluate(async model=>{
    let current=true,release,clicks=0,urls=0;
    const originalToBlob=HTMLCanvasElement.prototype.toBlob;
    const originalClick=HTMLAnchorElement.prototype.click;
    const originalUrl=URL.createObjectURL;
    HTMLCanvasElement.prototype.toBlob=function(callback){release=()=>callback(new Blob(['synthetic'],{type:'image/jpeg'}));};
    HTMLAnchorElement.prototype.click=function(){clicks++;};
    URL.createObjectURL=function(blob){urls++;return originalUrl.call(URL,blob);};
    try{
      const pending=PpicDailyInfo.exportJpeg(model,{isCurrent:()=>current}).then(()=>({name:'NO_ERROR'}),error=>({name:error.name}));
      current=false;release();
      return {...await pending,clicks,urls,anchors:document.querySelectorAll('a[download]').length};
    }finally{
      HTMLCanvasElement.prototype.toBlob=originalToBlob;
      HTMLAnchorElement.prototype.click=originalClick;
      URL.createObjectURL=originalUrl;
    }
  },fixture());
  expect(result).toEqual({name:'AbortError',clicks:0,urls:0,anchors:0});
});

test('oversize output fails explicitly before resizing rather than silently dropping rows',async({page})=>{
  await setup(page);
  const result=await page.evaluate(model=>{
    const canvas=document.createElement('canvas');canvas.width=17;canvas.height=19;
    model.sections[0].rows=Array.from({length:250},(_,i)=>({label:'Baris Uji '+i,value:'1 karton'}));
    try{PpicDailyInfo.render(canvas,model);return {error:null};}
    catch(error){return {name:error.name,message:error.message,width:canvas.width,height:canvas.height};}
  },fixture());
  expect(result.name).toBe('RangeError');
  expect(result.message).toMatch(/tidak ada baris yang dipotong/i);
  expect(result.width).toBe(17);expect(result.height).toBe(19);
});
