const {test,expect}=require('@playwright/test');
const {status}=require('./fixtures/robot-synthetic.cjs');
const ROOT=process.env.PPIC_TEST_BASE_URL||'http://127.0.0.1:8765/';
const API='https://jryfozndxpjymggevkgq.supabase.co';
const summary=()=>({ok:true,ready:true,period:'2026-11',latest:{
 schema_version:'ppic-daily-intelligence-v1',
 id:'11111111-1111-4111-8111-111111111111',as_of:'2026-11-23',
 created_at:'2026-11-23T15:10:00Z',state:'WORKING_OPEN_RECON',write_scope:'READ_ONLY_WORKING_REFERENCES',
 source_fingerprint:'a'.repeat(64),skt_revision_current:true,ppic_evidence_current:true,posting_done:false,
 source_rows:[
  {division:'BARANG JADI',source_status:'CANDIDATE_OPEN_RECON',basis:'ORIGINAL_XLSX',
   source_label:'05 Barang Jadi original',book_cutoff:'2026-11-23',active_cutoff:'2026-11-18',
   note:'Stok buku bukan stok bebas QC.',source_binary_verified:true,
   metrics:[{label:'Saldo buku kandidat',value:481125,unit:'pack',quality:'REFERENCE'},
    {label:'Tambahan penerimaan',value:71000,unit:'pack',quality:'SOURCE'}]},
  {division:'CUKAI',source_status:'CANDIDATE_OPEN_RECON',basis:'ORIGINAL_XLSX',
   source_label:'Pita asli 23 Nov',book_cutoff:'2026-11-23',active_cutoff:'2026-11-20',
   note:'Kandidat bukan saldo resmi robot Cukai.',source_binary_verified:true,
   metrics:[{label:'Buku pita 23 November',value:650145,unit:'keping',quality:'REFERENCE'}]},
  {division:'DO',source_status:'ACTIVE_WORKING',basis:'ACTIVE_REPORT',
   source_label:'DO V12 web V015',book_cutoff:'2026-11-21',active_cutoff:'2026-11-21',
   note:'Tidak ada SJ baru 22–23 November.',source_binary_verified:true,
   metrics:[{label:'Total pengeluaran',value:621995,unit:'pack',quality:'SOURCE'}]},
  {division:'WEB SKT',source_status:'SKT_TERCATAT',basis:'WEB_SKT_FORM',
   source_label:'159 current forms',book_cutoff:'2026-11-23',active_cutoff:null,
   note:'DIAJUKAN belum disetujui.',source_binary_verified:false,
   metrics:[{label:'Form hari ini',value:4,unit:'form',quality:'SOURCE'}]}
 ],
 kpi_rows:[{label:'Saldo buku BJ kandidat',value:481125,unit:'pack',quality:'REFERENCE'},
 {label:'Buku pita kandidat',value:650145,unit:'keping',quality:'REFERENCE'},
 {label:'Kas saldo indikatif',value:4185199078.42,unit:'Rp',quality:'ESTIMATE'}],
 exceptions:[{priority:'P1',code:'PITA_600000_PHYSICAL_UNCONFIRMED',division:'CUKAI',title:'600.000 keping belum pasti fisik'},
 {priority:'P1',code:'PMS_BANK_MATCH_OPEN',division:'KAS BANK',title:'Setoran perlu bank match'}],
 next_actions:[{priority:'P1',owner:'Admin Cukai',action:'Periksa pita sebelum pemakaian ulang.'},
 {priority:'P1',owner:'Admin Kas',action:'Verifikasi rekening koran PMS.'}]
}});
async function start(page){
 const errors=[],stats={posted:0};
 page.on('pageerror',e=>errors.push(e.message));
 await page.route(API+'/**',async route=>{
  const req=route.request(),url=req.url();let result={};
  if(url.includes('/auth/v1/token'))result={access_token:'SYNTHETIC_OWNER',expires_in:3600};
  else if(url.includes('/ppic-owner-check'))result={authorized:true,role:'owner'};
  else if(url.includes('/ppic-robot-status'))result=status('2026-11');
  else if(url.includes('/ppic-daily-intelligence'))result=summary();
  else if(url.includes('/ppic-auto-import-status'))result={ok:true,period:'2026-11',config:{enabled:false},jobs:[]};
  else if(url.includes('/ppic-stage2-status')||url.includes('/ppic-stage3-status')||
     url.includes('/ppic-skt-watch-status')||url.includes('/ppic-plan-status')||
     url.includes('/ppic-do-sync-health')||url.includes('/ppic-sj-recon-status'))
    result={ok:true,period:'2026-11',ready:false,latest:null};
  else if(url.includes('/ppic-owner-assistant')){
    let b;try{b=req.postDataJSON();}catch{b={};}
    if(b?.mode==='submit')stats.posted++;
    result={ok:true,period:'2026-11',live_gpt_configured:true,questions:[]};
  }
  else if(url.includes('/auth/v1/logout'))result={};
  else result=[];
  try{await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});}
  catch(e){if(!page.isClosed()&&!/closed|handled|canceled|Invalid InterceptionId/i.test(e.message))throw e;}
 });
 await page.goto(ROOT);
 await expect(page.locator('#ppicMain')).toBeHidden();
 await page.locator('#ownerPassword').fill('SYNTHETIC_PASSWORD');
 await page.locator('#loginButton').click();
 await expect(page.locator('#ppicMain')).toBeVisible();
 await expect(page.locator('#ppicDailyIntelKpis .ppic-daily-kpi')).toHaveCount(3);
 return {errors,stats};
}
test('Owner sees distinct candidate and active data, and risk gates without posting',async({page})=>{
 const session=await start(page);
 await expect(page.locator('#ppicDailyIntelBadge')).toHaveText('Data terbaru · WORKING');
 await expect(page.locator('#ppicDailyIntelTime')).toContainText('23 Nov 2026');
 await expect(page.locator('#ppicDailyIntelKpis')).toContainText('481.125');
 await expect(page.locator('#ppicDailyIntelKpis')).toContainText('650.145');
 await expect(page.locator('#ppicDailyIntelKpis')).toContainText('4.185.199.078');
 await expect(page.locator('#ppicDailyIntelNotice')).toContainText('tidak otomatis mengganti ledger aktif');
 await expect(page.locator('#ppicDailyIntelSources .ppic-daily-source')).toHaveCount(4);
 await expect(page.locator('#ppicDailyIntelSources')).toContainText('Kandidat · belum diposting');
 await expect(page.locator('#ppicDailyIntelSources')).toContainText('Aktif · laporan kerja');
 await expect(page.locator('#ppicDailyIntelSources')).toContainText('18 Nov 2026');
 await expect(page.locator('#ppicDailyIntelRisks .ppic-daily-risk')).toHaveCount(2);
 await page.locator('#ppicDailyIntelPanel summary').last().click();
 await expect(page.locator('#ppicDailyIntelActions .ppic-daily-action')).toHaveCount(2);
 await page.locator('#ppicDailyIntelAsk').click();
 await expect(page.locator('#ppicAskIntent')).toHaveValue('ANALYZE');
 expect(session.stats.posted).toBe(0);
 await page.locator('#logoutOwner').click();
 await expect(page.locator('#ppicMain')).toBeHidden();
 await expect(page.locator('#ppicDailyIntelKpis')).toBeEmpty();
 expect(session.errors).toEqual([]);
});
test('Mobile screen retains all live working values and no side effect',async({page})=>{
 await page.setViewportSize({width:375,height:812});
 const session=await start(page);
 await expect(page.locator('#ppicDailyIntelSources .ppic-daily-source')).toHaveCount(4);
 await expect(page.locator('#ppicDailyIntelKpis')).toContainText('481.125');
 await expect(page.locator('#ppicDailyIntelNotice')).toContainText('OPEN RECON');
 expect(session.stats.posted).toBe(0);
 expect(session.errors).toEqual([]);
});
