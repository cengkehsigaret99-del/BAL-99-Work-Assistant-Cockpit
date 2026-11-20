const {test,expect}=require('@playwright/test');
const {status}=require('./fixtures/robot-synthetic.cjs');
const ROOT=process.env.PPIC_TEST_BASE_URL||'http://127.0.0.1:8765/';
const API='https://jryfozndxpjymggevkgq.supabase.co';
const snapshot=(fresh=true)=>({ok:true,period:'2026-11',ready:true,latest:{
 id:'11111111-1111-4111-8111-111111111111',schema_version:'ppic-production-plan-v1',evidence_hash:'a'.repeat(64),
 evidence_current:fresh,analysis_as_of:'2026-11-20',created_at:'2026-11-21T03:00:00Z',state:'HOLD_DATA',
 skt_observed:true,skt_captured_at:'2026-11-20T20:11:35Z',skt_counts:{daily_reports:67,sj_documents:23,bb_documents:53,co_orders:7,co_realizations:0,co_allocations:0,bb_master_entries:2,total_documents:150},
 gates:[{code:'FIRM_ORDER_LINES',label:'Pesanan firm per SKU',state:'MISSING_PROOF',observed_forms:7,message:'Pesanan firm belum terbukti per SKU.',owner_role:'Admin DO'}],
 source_facts:[{division:'BARANG JADI',document_id:'SYNTHETIC_SOURCE_01',key:'ready_for_delivery_pack',value:null,quality:'MISSING',cutoff:'2026-11-18',unit:'pack'}],
 proposal_lines:[],next_actions:[{priority:'P1',division:'DO / Customer',task:'Verifikasi pesanan firm.',release_state:'USULAN'}]
 }});
async function start(page,{fresh=true}={}){
 const errors=[],state={submits:0};
 page.on('pageerror',e=>errors.push(e.message));
 await page.route(API+'/**',async route=>{
  const r=route.request(),url=r.url();let data={};
  if(url.includes('/auth/v1/token'))data={access_token:'SYNTHETIC_TOKEN',expires_in:3600};
  else if(url.includes('/ppic-owner-check'))data={authorized:true,role:'owner'};
  else if(url.includes('/ppic-robot-status'))data=status('2026-11');
  else if(url.includes('/ppic-plan-status'))data=snapshot(fresh);
  else if(url.includes('/ppic-stage2-status')||url.includes('/ppic-stage3-status'))data={ok:true,period:'2026-11',ready:false,latest:null};
  else if(url.includes('/ppic-auto-import-status'))data={ok:true,period:'2026-11',config:{enabled:false},jobs:[]};
  else if(url.includes('/ppic-owner-assistant')){const body=r.postDataJSON();
    if(body?.mode==='submit'){state.submits++;data={ok:true,id:'22222222-2222-4222-8222-222222222222',state:'QUEUED',period:'2026-11'};}
    else data={ok:true,period:'2026-11',live_gpt_configured:true,questions:[]};
  }
  else if(url.includes('/auth/v1/logout'))data={};
  else if(url.includes('/ppic_source_catalog')||url.includes('/ppic_reports_owner_view'))data=[];
  else data=[];
  try{await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});}
  catch(e){if(!page.isClosed()&&!/handled|closed|canceled|Invalid InterceptionId/i.test(e.message))throw e;}
 });
 await page.goto(ROOT);
 await expect(page.locator('#ppicMain')).toBeHidden();
 await page.locator('#ownerPassword').fill('SYNTHETIC');
 await page.locator('#loginButton').click();
 await expect(page.locator('#ppicMain')).toBeVisible();
 await expect(page.locator('#ppicPlanMetrics .ppic-plan-metric')).toHaveCount(4);
 return {errors,state};
}
test('Owner sees seven-form evidence gate and nonnumeric plan, not a false production target',async({page})=>{
 const a=await start(page);
 await expect(page.locator('#ppicPlanBadge')).toHaveText('Menunggu bukti');
 await expect(page.locator('#ppicPlanMetrics')).toContainText('Form pesanan SKT');
 await expect(page.locator('#ppicPlanMetrics')).toContainText('7');
 await expect(page.locator('#ppicPlanStatus')).toContainText('belum dapat dihitung');
 await expect(page.locator('#ppicPlanPanel')).toContainText('Pesanan firm per SKU');
 await expect(page.locator('#ppicPlanPanel')).toContainText('Bukti belum lengkap');
 await page.locator('#ppicPlanPanel summary').filter({hasText:'Usulan jumlah produksi'}).click();
 await expect(page.locator('#ppicPlanSKU')).toContainText('Belum ada SKU yang bisa dihitung');
 await page.locator('#ppicPlanAsk').click();
 await expect(page.locator('#ppicAskIntent')).toHaveValue('ANALYZE');
 await expect(page.locator('#ppicAskText')).toHaveValue(/rencana produksi dan pengiriman per SKU/);
 expect(a.state.submits).toBe(0);
 await page.locator('#logoutOwner').click();
 await expect(page.locator('#ppicMain')).toBeHidden();
 await expect(page.locator('#ppicPlanMetrics')).toBeEmpty();
 expect(a.errors).toEqual([]);
});
test('Stale evidence does not appear as current; mobile layout retains all gates',async({page})=>{
 await page.setViewportSize({width:375,height:812});
 const a=await start(page,{fresh:false});
 await expect(page.locator('#ppicPlanBadge')).toHaveText('Sumber berubah');
 await expect(page.locator('#ppicPlanStatus')).toContainText('HISTORIS');
 await expect(page.locator('#ppicPlanGates .ppic-plan-gate')).toHaveCount(1);
 expect(a.state.submits).toBe(0);
 expect(a.errors).toEqual([]);
});
