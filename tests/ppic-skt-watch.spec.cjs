const {test,expect}=require('@playwright/test');
const {status}=require('./fixtures/robot-synthetic.cjs');
const ROOT=process.env.PPIC_TEST_BASE_URL||'http://127.0.0.1:8765/';
const API='https://jryfozndxpjymggevkgq.supabase.co';
const watch=()=>({ok:true,ready:true,period:'2026-11',latest:{
 schema_version:'ppic-skt-freshness-v1',revision:'BAL-MIRROR-'+'a'.repeat(64),captured_at:'2026-11-21T02:13:44Z',
 ppic_evidence_hash:'b'.repeat(64),
 counts:{daily_reports:68,sj_documents:23,bb_documents:53,co_orders:7,co_realizations:0,co_allocations:0,bb_master_entries:2,total_documents:151},
 status_receipts:[
  {business_date:'2026-11-21',checked_at:'2026-11-21T02:13:44Z',rows:[
   {division:'tsg',status:'BELUM_LENGKAP',report_date:'2026-11-21',last_saved_at:'2026-11-21T01:18:27Z',document_count:1,transaction_count:0,document_state:'DRAF',document_version:2,source_complete:true},
   {division:'giling',status:'JADWAL_BELUM_DIATUR',report_date:'2026-11-20',last_saved_at:'2026-11-20T12:54:48Z',document_count:0,transaction_count:0,document_state:null,document_version:null,source_complete:true}
  ]},
  {business_date:'2026-11-20',checked_at:'2026-11-20T20:03:04Z',rows:[
   {division:'giling',status:'SUDAH_INPUT',report_date:'2026-11-20',last_saved_at:'2026-11-20T12:54:48Z',document_count:1,transaction_count:1,document_state:'DISETUJUI',document_version:6,source_complete:true},
   {division:'tsg',status:'SUDAH_INPUT',report_date:'2026-11-20',last_saved_at:'2026-11-20T07:37:15Z',document_count:1,transaction_count:2,document_state:'DIAJUKAN',document_version:2,source_complete:true},
   {division:'verpack',status:'SUDAH_INPUT',report_date:'2026-11-20',last_saved_at:'2026-11-20T07:17:45Z',document_count:1,transaction_count:1,document_state:'DIAJUKAN',document_version:2,source_complete:true}
  ]}
 ],ppic_coverage:[
  {division:'GILING',source_cutoff:'2026-11-20',report_cutoff:'2026-11-17',report_status:'OPEN RECON',selection_status:'READY',has_facts:true},
  {division:'TSG',source_cutoff:'2026-11-18',report_cutoff:null,report_status:null,selection_status:'READY',has_facts:true},
  {division:'VERPACK',source_cutoff:'2026-11-20',report_cutoff:'2026-11-17',report_status:'OPEN RECON',selection_status:'READY',has_facts:true}
 ]
}});
async function signIn(page){
 const errors=[],state={sent:0};
 page.on('pageerror',e=>errors.push(e.message));
 await page.route(API+'/**',async route=>{
  const r=route.request(),url=r.url();let data={};
  if(url.includes('/auth/v1/token'))data={access_token:'SYNTHETIC_OWNER',expires_in:3600};
  else if(url.includes('/ppic-owner-check'))data={authorized:true,role:'owner'};
  else if(url.includes('/ppic-robot-status'))data=status('2026-11');
  else if(url.includes('/ppic-skt-watch-status'))data=watch();
  else if(url.includes('/ppic-auto-import-status'))data={ok:true,period:'2026-11',config:{enabled:false},jobs:[]};
  else if(url.includes('/ppic-stage2-status')||url.includes('/ppic-stage3-status')||url.includes('/ppic-plan-status'))data={ok:true,period:'2026-11',ready:false,latest:null};
  else if(url.includes('/ppic-owner-assistant')){const body=r.postDataJSON();if(body?.mode==='submit'){state.sent++;data={ok:true,state:'QUEUED',id:'11111111-1111-4111-8111-111111111111',period:'2026-11'};}
    else data={ok:true,period:'2026-11',live_gpt_configured:true,questions:[]};}
  else if(url.includes('/auth/v1/logout'))data={};
  else data=[];
  try{await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});}catch(e){if(!page.isClosed()&&!/closed|handled|canceled|Invalid InterceptionId/i.test(e.message))throw e;}
 });
 await page.goto(ROOT);
 await expect(page.locator('#ppicMain')).toBeHidden();
 await page.locator('#ownerPassword').fill('SYNTHETIC');
 await page.locator('#loginButton').click();
 await expect(page.locator('#ppicMain')).toBeVisible();
 await expect(page.locator('#ppicSKTWatchRows>.ppic-skt-card')).toHaveCount(12);
 return {errors,state};
}
test('Owner sees new TSG draft without incorrectly treating it as final or factory shutdown',async({page})=>{
 const session=await signIn(page);
 await expect(page.locator('#ppicSKTWatchBadge')).toHaveText('Sumber terpantau');
 await expect(page.locator('#ppicSKTWatchTime')).toContainText('151 formulir');
 const tsg=page.locator('#ppicSKTWatchRows .ppic-skt-card').filter({hasText:'TSG'}).first();
 await expect(tsg).toContainText('Draf — belum lengkap');
 await expect(tsg).toContainText('21 Nov 2026');
 await expect(tsg).toContainText('tidak boleh mengganti saldo');
 const giling=page.locator('#ppicSKTWatchRows .ppic-skt-card').filter({hasText:'Giling'}).first();
 await expect(giling).toContainText('Sudah disetujui');
 await expect(giling).toContainText('laporan aktif 17 Nov 2026');
 await expect(page.locator('#ppicSKTWatchPanel')).toContainText('bukan bukti pabrik libur');
 await page.locator('#ppicSKTWatchAsk').click();
 await expect(page.locator('#ppicAskIntent')).toHaveValue('ANALYZE');
 expect(session.state.sent).toBe(0);
 await page.locator('#logoutOwner').click();
 await expect(page.locator('#ppicMain')).toBeHidden();
 await expect(page.locator('#ppicSKTWatchRows')).toBeEmpty();
 expect(session.errors).toEqual([]);
});
test('Mobile Owner dashboard preserves statuses; no send occurs by opening a card',async({page})=>{
 await page.setViewportSize({width:375,height:812});
 const session=await signIn(page);
 await expect(page.locator('#ppicSKTWatchMetrics .ppic-skt-metric')).toHaveCount(4);
 await expect(page.locator('#ppicSKTWatchRows .ppic-skt-card')).toHaveCount(12);
 await expect(page.locator('#ppicSKTWatchPanel')).toContainText('Form terbaru belum otomatis');
 expect(session.state.sent).toBe(0);
 expect(session.errors).toEqual([]);
});
