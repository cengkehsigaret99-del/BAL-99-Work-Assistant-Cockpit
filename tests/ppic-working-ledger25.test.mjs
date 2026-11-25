import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync('index.html','utf8');
function decoder(name,next){
 const start=html.indexOf('async function '+name+'('),end=html.indexOf(next,start);
 assert.ok(start>0&&end>start,name+' implementation found');
 const src=html.slice(start,end);
 return new vm.Script(src+';\n'+name,{filename:'index.html/'+name}).runInNewContext({
  Uint8Array,atob,Response,Blob,DecompressionStream,Error,JSON
 });
}
const fg=decoder('fgDecode','function fgFill(');
const bb=decoder('matDecode','async function matReload(');
test('Barang Jadi 25-Nov JSON-v1 supports 39 SKU cards and 80 dated receipt/DO events',async()=>{
 const m=Array.from({length:39},(_,i)=>['C-'+String(i+1).padStart(3,'0'),'Merek',800,7528.25,'BUKU / OPEN RECON',i===0?148210:0]);
 const e=Array.from({length:80},(_,i)=>[i%25+1,i<39?'MASUK':'KELUAR','C-036',i<39?'GUDANG':'SJ334','TEST',1]);
 const d={m,e,cutoff:25,valuation:'HISTORICAL PROXY',provenance:{source:'PRIVATE'}};
 const result=await fg({payload:{codec:'json-v1',data:d}});
 assert.equal(result.m.length,39);assert.equal(result.e.length,80);
 assert.equal(result.cutoff,25);assert.equal(result.m[0][5],148210);
});
test('Bad or too-large new JSON payload cannot be silently used as stock',async()=>{
 for(const value of [null,{}, {m:[],e:'bad'}, {m:Array(301).fill([]),e:[]},
  {m:[],e:Array(20001).fill([])}]){
  await assert.rejects(async()=>fg({payload:{codec:'json-v1',data:value}}),/ledger valid/);
 }
});
test('Bahan Baku supports JSON-v1 without changing historical zlib codec',async()=>{
 const d={m:[['A-01','Ambree GCC 99','pcs',4435800,5]],e:[['A-01',25,0,10000]],cutoff:25};
 const result=await bb({payload:{codec:'json-v1',data:d}});
 assert.equal(result.m[0][0],'A-01');assert.equal(result.e.length,1);
 assert.ok(html.includes('DecompressionStream("deflate")'));
});
test('No JSON-v1 contract may imply confirmed inventory, cash or invoices',()=>{
 assert.ok(html.includes('status')&&html.includes('OPEN RECON'));
 const auth=fs.readFileSync('auth.js','utf8');
 for(const route of ['ppic_finished_goods_owner_view','ppic_do_customer_owner_view','ppic_reports_owner_view','ppic_daily_owner_view'])
  assert.ok(auth.includes(route),'Reader endpoint missing '+route);
 assert.ok(!html.includes('ppic_private.publish_bj_working_25nov('));
 assert.ok(!html.includes('ppic_private.publish_do_working_25nov('));
 assert.match(fs.readFileSync('sw.js','utf8'), /bal-ppic-public-shell-v(7[2-9]|[8-9][0-9])-[a-z0-9-]+/);
});
