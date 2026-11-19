'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {build,cartonFactor,latestSnapshot,sourceDate}=require('../daily-info-data.js');

// All quantities, document IDs and worker records are synthetic. The GCC/A-01
// family names below exercise supported aliases; no private files are read.
const AS_OF='2026-11-19';
const env=(version,cutoff,payload,extra={})=>({period:'2026-11',version,cutoff,status:'OPEN RECON',payload,...extra});
const request=overrides=>({asOf:AS_OF,finished:[],materials:[],daily:[],sdm:[],...overrides});
const section=(result,id)=>{
  const found=result.sections.find(s=>s.id===id);
  assert.ok(found,'Missing section '+id);return found;
};
const fg=(master,events=[],cutoff='2026-11-18',version='V015')=>env(version,cutoff,{m:master,e:events,cutoff:Number(cutoff.slice(-2))});
const daily=(division,entries,cutoff='2026-11-17',version='V001',extra={})=>env(version,cutoff,
  {cols:['day','in_qty','labor_nominal'],entries,valid_through:cutoff,...extra},{division});
const pita=(division,opening,entries=[],version='V001')=>env(version,'2026-11-17',
  {cols:['day','in_qty','out_qty'],opening_qty:opening,entries,valid_through:'2026-11-17'},{division});
const master=()=>[
  ['SKU-UJI-99','GCC 99',1000,1,'SINTETIS',0],
  ['SKU-UJI-16','GCC 16',800,1,'SINTETIS',0]
];
function packingInput(){
  return request({finished:[fg(master())],daily:[daily('VERPACK',[[17,1000,0],[17,600,0]])],
    sdm:[env('V010','2026-11-17',{
      w:[['GILING','G-UJI','PEKERJA UJI'],['VERPACK','V-UJI-1','PEKERJA UJI'],['VERPACK','V-UJI-2','PEKERJA UJI']],
      b:['—','GCC 99','GCC 16'],s:['NORMAL'],
      r:[[1,17,1,700,0,0],[2,17,1,500,0,0],[1,17,2,400,0,0],
         [0,17,1,9999,0,0],[1,16,1,200,0,0],[2,18,1,300,0,0]],
      meta:{cutoff:'2026-11-17'}
    })]});
}
function materialInput(){
  return request({materials:[env('V011','2026-11-18',{
    m:[['A-01','AMBREE GCC 99','PCS',24000,null,2.5],['RAW-UJI','BAHAN UJI LAIN','PCS',10,null,999]],
    e:[['A-01',18,12000,6000]],cutoff:18,
    capacity_basis_by_code:{'A-01':'SIMULASI A-01: asumsi 12 pcs/pack, 1.000 pack/karton; BOM belum disahkan'},
    date_coverage:{'2026-11-18':{status:'PARTIAL',codes:['A-01']}}
  })]});
}

test('empty sources yield five empty sections and no exportable data',()=>{
  const result=build(request());
  assert.equal(result.hasData,false);
  assert.deepEqual(result.sections.map(s=>s.id),['finished','excise','giling','verpack','materials']);
  assert.ok(result.sections.every(s=>s.rows.length===0));
  assert.ok(result.sections.every(s=>s.sourceDate===null));
  assert.throws(()=>build(request({asOf:'2026-11-31'})),/valid/i);
});

test('version selection is numeric, period-scoped and independent of input order',()=>{
  const rows=[env('V009','2026-11-16',{}, {division:'GILING'}),
    env('V1000','2026-11-17',{}, {division:'GILING'}),
    env('V999','2026-11-17',{}, {division:'GILING'}),
    {...env('V9999','2026-12-17',{}, {division:'GILING'}),period:'2026-12'},
    env('V1001','2026-11-17',{}, {division:'VERPACK'})];
  assert.equal(latestSnapshot(rows,'2026-11',r=>r.division==='GILING').version,'V1000');
  assert.equal(latestSnapshot(rows,'2026-10'),null);
});

test('mixed source dates remain visible and never become confirmed19November balances',()=>{
  const input=materialInput();
  input.finished=[fg([['FG-UJI','PRODUK UJI',1000,1,'SINTETIS',4]],[], '2026-11-17','V014'),
    fg([['FG-UJI','PRODUK UJI',1000,1,'SINTETIS',100]],[[18,'MASUK','FG-UJI',null,null,20],[19,'MASUK','FG-UJI',null,null,999]])];
  input.daily=[pita('CUKAI 10.325',100,[[17,50,20],[19,999,0]]),daily('GILING',[[16,1234,0]],'2026-11-18')];
  const before=structuredClone(input),result=build(input);
  assert.equal(result.asOf,AS_OF);
  assert.equal(section(result,'finished').sourceDate,'2026-11-18');
  assert.equal(section(result,'finished').rows[0].numeric.pack,120);
  assert.equal(section(result,'excise').sourceDate,'2026-11-17');
  assert.equal(section(result,'excise').rows[0].numeric.keping,130);
  assert.equal(section(result,'giling').sourceDate,'2026-11-16');
  assert.equal(section(result,'giling').rows[0].numeric.batang,1234);
  assert.equal(section(result,'materials').sourceDate,'2026-11-18');
  assert.ok(result.sections.filter(s=>s.rows.length).every(s=>s.sourceDate<'2026-11-19'));
  assert.deepEqual(input,before,'Pure builder must not modify source arrays');
});

test('a payload date beyond its envelope cutoff cannot make19November actual',()=>{
  const snapshot=env('V015','2026-11-18',{cutoff:19,m:[],e:[]});
  assert.equal(sourceDate(snapshot,AS_OF),'2026-11-18');
  assert.equal(sourceDate(snapshot,'2026-11-17'),'2026-11-17');
  assert.equal(sourceDate(snapshot,'2026-12-01'),null);
});

test('positive-only finished stock keeps unknown factors as packs and preserves negative exclusion evidence',()=>{
  const result=build(request({finished:[fg([
    ['FG-UJI-PLUS','PRODUK UJI POSITIF',800,1,'SINTETIS',850],
    ['FG-UJI-UNKNOWN','PRODUK UJI TANPA FAKTOR',null,null,'SINTETIS',17],
    ['FG-UJI-ZERO','PRODUK UJI NOL',600,1,'SINTETIS',0],
    ['FG-UJI-NEG','PRODUK UJI NEGATIF',600,1,'SINTETIS',-3]
  ])]}));
  const s=section(result,'finished');assert.equal(s.rows.length,2);
  const positive=s.rows.find(r=>r.detail==='FG-UJI-PLUS');
  assert.equal(positive.numeric.pack,850);assert.equal(positive.numeric.packPerCarton,800);
  assert.match(positive.value,/1 karton.*50 pack/);
  const unknown=s.rows.find(r=>r.detail==='FG-UJI-UNKNOWN');
  assert.equal(unknown.numeric.pack,17);assert.equal(unknown.numeric.packPerCarton,null);
  assert.match(unknown.value,/17 pack/);assert.match(unknown.value,/belum/i);
  assert.ok(!s.rows.some(r=>/NOL|NEGATIF/.test(r.label)));
  assert.match(s.notes.join(' '),/negatif/i);
});

test('each positive excise HJE pool appears once regardless of finished-brand count',()=>{
  const older=pita('CUKAI 10.325',999,[],'V001');
  const current=pita('CUKAI 10.325',100,[[17,50,20]],'V002');
  const input=request({finished:[fg([['A','PRODUK UJI A',1000,1,'SINTETIS',1],['B','PRODUK UJI B',1000,1,'SINTETIS',2]])],
    daily:[older,pita('CUKAI 13.775',200,[[17,0,25]]),current,pita('CUKAI REFILL',9),pita('CUKAI UJI NOL',0)]});
  const s=section(build(input),'excise');
  assert.equal(s.rows.length,3);assert.equal(new Set(s.rows.map(r=>r.label)).size,3);
  assert.deepEqual(s.rows.map(r=>r.numeric.keping).sort((a,b)=>a-b),[9,130,175]);
  assert.ok(s.rows.every(r=>!/PRODUK UJI [AB]/.test(r.label)));
  assert.match(s.notes.join(' '),/per HJE.*alokasi per merek belum/i);
});

test('daily sticks come from GILING production ledger, never SDM payroll or an unrecorded day',()=>{
  const sdm=env('V010','2026-11-17',{w:[['GILING','G-UJI','PEKERJA UJI']],b:['—','GCC 99'],r:[[0,17,1,777,0,0]],meta:{cutoff:'2026-11-17'}});
  const result=build(request({daily:[daily('GILING',[[16,100,0],[17,1555,0],[19,9999,0]])],sdm:[sdm]}));
  const s=section(result,'giling');assert.equal(s.sourceDate,'2026-11-17');
  assert.equal(s.rows.length,1);assert.equal(s.rows[0].numeric.batang,1555);
  assert.equal(section(build(request({sdm:[sdm]})),'giling').rows.length,0);
});

test('Verpack uses same-day reconciled brand aggregates once and unique source carton factors',()=>{
  const s=section(build(packingInput()),'verpack');
  assert.equal(s.sourceDate,'2026-11-17');assert.equal(s.rows.length,2);
  const byBrand=Object.fromEntries(s.rows.map(r=>[r.label,r]));
  assert.deepEqual(byBrand['GCC 99'].numeric,{pack:1200,packPerCarton:1000,cartons:1.2});
  assert.deepEqual(byBrand['GCC 16'].numeric,{pack:400,packPerCarton:800,cartons:0.5});
  assert.equal(s.rows.reduce((n,r)=>n+r.numeric.pack,0),1600);
  assert.match(s.total.value,/1,7 karton/);
});

test('Verpack refuses a mismatched aggregate or a matching quantity from another date',()=>{
  const mismatch=packingInput();mismatch.sdm[0].payload.r[0][3]=699;
  const a=section(build(mismatch),'verpack');
  assert.equal(a.rows.length,0);assert.match(a.emptyText,/belum cocok/i);
  const otherDate=packingInput();otherDate.sdm[0].payload.r=[[1,16,1,1600,0,0]];
  const b=section(build(otherDate),'verpack');
  assert.equal(b.rows.length,0);assert.match(b.emptyText,/belum/i);
  const missing=packingInput();missing.sdm=[];
  assert.equal(section(build(missing),'verpack').rows.length,0);
});

test('unknown or contradictory brand factors keep pack detail but suppress carton totals',()=>{
  const input=packingInput();input.finished[0].payload.m[1][2]=null;
  let s=section(build(input),'verpack'),unknown=s.rows.find(r=>r.label==='GCC 16');
  assert.equal(unknown.numeric.pack,400);assert.equal(unknown.numeric.cartons,null);
  assert.match(unknown.value,/belum/i);assert.match(unknown.detail,/400 pack/);assert.equal(s.total,undefined);
  const conflict=packingInput();conflict.finished[0].payload.m.push(['SKU-UJI-CONFLICT','GCC 99',600,1,'SINTETIS',0]);
  assert.equal(cartonFactor('GCC 99',conflict.finished[0].payload.m),null);
  s=section(build(conflict),'verpack');
  assert.equal(s.rows.find(r=>r.label==='GCC 99').numeric.cartons,null);assert.equal(s.total,undefined);
});

test('BB A-01 simulation uses dated book quantity and explicit assumptions, with partial coverage visible',()=>{
  const input=materialInput(),s=section(build(input),'materials');
  assert.equal(s.sourceDate,'2026-11-18');assert.match(s.dateLabel,/parsial/i);
  assert.equal(s.rows.length,1);assert.deepEqual(s.rows[0].numeric,{qty:30000,cartons:2.5});
  assert.match(s.rows[0].detail,/simulasi/i);assert.match(s.notes.join(' '),/BOM belum disahkan/);
  input.asOf='2026-11-17';
  const historical=section(build(input),'materials');
  assert.equal(historical.sourceDate,'2026-11-17');
  assert.deepEqual(historical.rows[0].numeric,{qty:24000,cartons:2});
});

test('BB does not infer capacity from A-01 code alone, an unrelated name, a legacy hint or incompatible units',()=>{
  const cases=[
    ['missing basis',p=>{p.capacity_basis_by_code={};}],
    ['unrelated name',p=>{p.m[0][1]='BAHAN UJI LAIN';}],
    ['wrong unit',p=>{p.m[0][2]='BOTOL';}],
    ['unsupported code',p=>{p.m[0][0]='A-02';}],
    ['different coefficient',p=>{p.capacity_basis_by_code['A-01']='SIMULASI 16 pcs/pack, 1.000 pack/karton';}],
    ['different carton',p=>{p.capacity_basis_by_code['A-01']='SIMULASI 12 pcs/pack, 800 pack/karton';}],
    ['unobserved partial code',p=>{p.date_coverage['2026-11-18'].codes=['RAW-UJI'];}]
  ];
  for(const [name,mutate]of cases){
    const input=materialInput();mutate(input.materials[0].payload);
    const s=section(build(input),'materials');
    assert.equal(s.rows.length,0,name+' must not yield an estimated carton amount');
    assert.match(s.emptyText,/belum/i);
  }
});
