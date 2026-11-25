const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const begin=html.indexOf('function dailyRowsFor('),end=html.indexOf('function dailyChartSvg(',begin);
const dailyRowsFor=vm.runInNewContext(html.slice(begin,end)+';dailyRowsFor',{ppicCoverage:()=>null});
const snapshot=(overrides={})=>({period:'2026-11',payload:{cols:['day','in_qty','out_qty'],entries:[],opening_qty:100,book_period_receipts:50,book_period_usage:30,book_closing:120,valid_through:'2026-11-25',...overrides}});
test('period-only Cukai snapshot uses known closing at cutoff and never invents daily zero movements',()=>{
 const rows=dailyRowsFor(snapshot());
 assert.equal(rows.length,30);
 assert.equal(rows[24].qty1,120);
 assert.equal(rows[24].qin,null);
 assert.equal(rows[24].qout,null);
 assert.match(rows[24].status,/MUTASI HARIAN BELUM TERSEDIA/);
 for(const r of rows.filter((_,i)=>i!==24)){
  assert.equal(r.qty1,null);assert.equal(r.qin,null);assert.equal(r.qout,null);
  assert.equal(r.status,'BELUM ADA DATA');
 }
});
test('explicit zero closing remains zero and unknown closing never becomes opening or zero',()=>{
 assert.equal(dailyRowsFor(snapshot({book_period_usage:150,book_closing:0}))[24].qty1,0);
 assert.equal(dailyRowsFor(snapshot({book_closing:null}))[24].qty1,null);
});
test('inconsistent period control totals are not published as a daily balance',()=>{
 const rows=dailyRowsFor(snapshot({book_closing:999}));
 assert.ok(rows.every(r=>r.qty1===null&&r.status==='BELUM ADA DATA'));
});
test('existing explicit daily receipt and usage snapshots retain their arithmetic',()=>{
 const rows=dailyRowsFor({period:'2026-11',payload:{cols:['day','in_qty','out_qty'],opening_qty:100,entries:[[1,50,30],[2,0,20]],valid_through:'2026-11-02'}});
 assert.equal(rows[0].qty1,120);assert.equal(rows[1].qty1,100);assert.equal(rows[1].qin,0);
 assert.equal(rows[2].qty1,null);
});
test('daily JPG reads the same cutoff control balance and never fabricates earlier daily stock',()=>{
 const {build}=require('../daily-info-data.js');
 const daily=[{...snapshot(),division:'CUKAI TEST',version:'V001',cutoff:'2026-11-25'}];
 const current=build({asOf:'2026-11-25',daily}).sections.find(s=>s.id==='excise');
 assert.equal(current.rows[0].numeric.keping,120);
 const earlier=build({asOf:'2026-11-24',daily}).sections.find(s=>s.id==='excise');
 assert.equal(earlier.rows.length,0);
});
