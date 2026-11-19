const test=require('node:test');
const assert=require('node:assert/strict');
const payroll=require('../payroll.js');
const base=()=>({w:[['GILING','G990001','PEKERJA UJI'],['GILING','PCS 990007','PEKERJA UJI'],['VERPACK','P990001','PENGEMAS UJI']],b:['GCC 99','GCC 16'],s:['NORMAL'],r:[[0,13,0,1000,40000,0],[0,14,0,1000,40000,0],[1,13,0,1000,40000,0],[2,13,1,5,1050,0]],meta:{period:'2026-11',cutoff:'2026-11-19',payroll:{bonusPolicy:'OFF',periodStart:'2026-11-13',periodEnd:'2026-11-19',sourceCutoffByDivision:{GILING:'2026-11-19',VERPACK:'2026-11-19'},workers:{},holds:[],pending:[]}}});
const opts={period:'2026-11',division:'GABUNGAN',start:'2026-11-13',end:'2026-11-19'};
test('denominations are split per person; aggregate allocation does not consume another person remainder',()=>{
 const d=base();d.r=[[0,13,0,1,40000,0],[1,13,0,1,40000,0],[2,13,1,1,1050,0]];
 const m=payroll.buildModel(d,opts);
 assert.equal(m.cashGross,81050);assert.equal(m.counts[0],0);assert.equal(m.counts[1],0);assert.equal(m.counts[2],4);assert.equal(m.counts[6],1);assert.equal(m.remainder,50);assert.equal(m.allocated+m.remainder,m.cashGross);
});
test('same names retain separate IDs and PCS quantity; combined quantities remain separate',()=>{
 const m=payroll.buildModel(base(),opts);
 assert.equal(m.staff.length,3);assert.equal(m.candidates.length,3);assert.equal(m.cashGross,121050);
 assert.equal(m.divisions.find(d=>d.div==='GILING').quantity,3000);
 assert.equal(m.divisions.find(d=>d.div==='VERPACK').quantity,5);
});
test('extra HOLD remains in gross/control slips but outside candidate cash; pending remains outside gross',()=>{
 const d=base();d.meta.payroll.holds=[{div:'VERPACK',id:null,name:'IDENTITAS UJI',date:'2026-11-18',qty:300,wage:63000,reason:'ID belum tersedia'}];
 d.meta.payroll.pending=[{div:'VERPACK',id:'P990001',name:'PENGEMAS UJI',qty:250,wage:52500,reason:'Tanggal belum tersedia'}];
 const m=payroll.buildModel(d,opts);
 assert.equal(m.totalGross,184050);assert.equal(m.cashGross,121050);assert.equal(m.heldGross,63000);assert.equal(m.pendingGross,52500);assert.equal(m.staff.length,4);assert.equal(m.candidates.length,3);
 assert.equal(m.daily.find(d=>d.date==='2026-11-18').gross,63000);
 const cash=payroll.renderDocument(m,{kind:'cash',logoUrl:'logo.png'});assert.match(cash,/HOLD/);assert.match(cash,/PENDING/);assert.match(cash,/ID belum tersedia/);
});
test('scope uses period and person filter, computes all brands; record date does not shift into selected month',()=>{
 const d=base();d.r.push([0,13,1,10,420,0]);
 const m=payroll.buildModel(d,{...opts,division:'GILING',search:'PCS 990007',end:'2026-11-13'});
 assert.equal(m.staff.length,1);assert.equal(m.cashGross,40000);
 const wrong=payroll.buildModel(d,{...opts,start:'2026-12-13',end:'2026-12-19'});assert.equal(wrong.staff.length,0);
});
test('missing wage/quantity stay unknown and explicit zero stays zero; no attendance or net pay invented',()=>{
 const d=base();d.r.push([2,14,0,null,null,0],[2,16,0,0,0,0]);
 const m=payroll.buildModel(d,{...opts,division:'VERPACK'}),w=m.staff[0];
 assert.equal(w.daily.find(d=>d.date==='2026-11-14').qty,null);assert.equal(w.daily.find(d=>d.date==='2026-11-16').qty,0);assert.equal(w.net,null);assert.equal(w.deduction,null);assert.equal(w.bonus,0);
 const html=payroll.renderDocument(m,{kind:'slips',logoUrl:'logo.png'});assert.match(html,/Belum ditetapkan/);assert.match(html,/bukti absensi resmi/);assert.match(html,/BONUS|Bonus OFF/);
});
test('missing identity is held, no invented IDs; negative or fractional currency cannot enter cash',()=>{
 const d=base();d.w[0][1]='';d.r[2][4]=12.5;
 const m=payroll.buildModel(d,opts);assert.equal(m.candidates.length,1);assert.equal(m.holds.length,2);
 const html=payroll.renderDocument(m,{kind:'slips',logoUrl:'logo.png'});assert.match(html,/BELUM ADA ID/);assert.doesNotMatch(html,/UNRESOLVED:/);
});
test('unverified bonus policy remains unknown and labels are escaped',()=>{
 const d=base();delete d.meta.payroll.bonusPolicy;d.w[0][2]='<img src=x onerror=alert(1)>';
 const m=payroll.buildModel(d,opts),html=payroll.renderDocument(m,{kind:'slips',logoUrl:'logo.png'});
 assert.equal(m.staff.find(w=>w.id==='G990001').bonus,null);assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img src=x'));
});
test('four compact Giling slips per A4 sheet and one Verpack slip per sheet; correct planned page count',()=>{
 const d=base();d.w=[];d.r=[];
 for(let i=0;i<7;i++){d.w.push([i<5?'GILING':'VERPACK','UJI'+i,'PEKERJA '+i]);d.r.push([i,13,0,100,4000,0]);}
 const html=payroll.renderDocument(payroll.buildModel(d,opts),{kind:'slips',logoUrl:'logo.png'});
 assert.equal((html.match(/<section class="sheet /g)||[]).length,4);assert.equal((html.match(/<article class="slip compact/g)||[]).length,5);assert.equal((html.match(/<article class="slip large/g)||[]).length,2);assert.match(html,/Halaman 4 dari 4/);
});
test('invalid dates disable output model',()=>{
 const m=payroll.buildModel(base(),{...opts,start:'2026-11-20',end:'2026-11-13'});assert.equal(m.valid,false);
});
test('unknown wage for positive production is held and stays unavailable, without holding an absent calendar day',()=>{
 const d=base();d.w=[['GILING','G990001','PEKERJA UJI']];d.r=[[0,13,0,1000,null,0]];
 const m=payroll.buildModel(d,opts);assert.equal(m.totalGross,null);assert.equal(m.staff[0].gross,null);assert.equal(m.candidates.length,0);assert.equal(m.holds.length,1);
 assert.match(m.holds[0].holdReason,/belum lengkap/);
 const known=base();const k=payroll.buildModel(known,{...opts,division:'GILING'});assert.equal(k.holds.length,0);assert.equal(k.staff[0].daily.find(r=>r.date==='2026-11-15').wage,null);
 d.r=[[0,13,0,null,null,0]];assert.equal(payroll.buildModel(d,opts).staff.length,0);
});
test('bonus OFF is limited to verified period and undated pending does not migrate into earlier week',()=>{
 const d=base();d.r.push([0,6,0,1000,40000,0]);d.meta.payroll.pending=[{div:'GILING',id:'G990001',name:'PEKERJA UJI',wage:1234,reason:'Belum ada tanggal'}];
 const old=payroll.buildModel(d,{...opts,start:'2026-11-06',end:'2026-11-12'});assert.equal(old.bonusPolicy,'UNKNOWN');assert.equal(old.staff[0].bonus,null);assert.equal(old.pending.length,0);
 const mixed=payroll.buildModel(d,{...opts,start:'2026-11-12',end:'2026-11-18'});assert.equal(mixed.bonusPolicy,'UNKNOWN');
 const tooLong=payroll.buildModel(d,{...opts,start:'2026-11-01',end:'2026-11-19'});assert.equal(tooLong.valid,false);assert.match(tooLong.invalidReason,/maksimal 7 hari/);
});
test('hold retains known brand and rate on control slip without invented ID',()=>{
 const d=base();d.meta.payroll.holds=[{div:'VERPACK',id:null,name:'IDENTITAS UJI',date:'2026-11-18',brand:'GCC 16',qty:300,wage:63000,reason:'ID belum tersedia'}];
 const m=payroll.buildModel(d,{...opts,search:'IDENTITAS UJI'});assert.equal(m.staff[0].brands[0].brand,'GCC 16');assert.equal(m.staff[0].brands[0].rate,210);assert.equal(m.cashGross,0);
 const html=payroll.renderDocument(m,{kind:'slips',logoUrl:'logo.png'});assert.match(html,/GCC 16/);assert.doesNotMatch(html,/Belum teralokasi/);
});
