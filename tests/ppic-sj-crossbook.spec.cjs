const {test,expect}=require('@playwright/test');
const {status}=require('./fixtures/robot-synthetic.cjs');
const ROOT=process.env.PPIC_TEST_BASE_URL||'http://127.0.0.1:8765/';
const API='https://jryfozndxpjymggevkgq.supabase.co';
const cross=()=>({ok:true,period:'2026-11',ready:true,latest:{
 schema_version:'ppic-sj-crossbook-v1',id:'22222222-2222-4222-8222-222222222222',
 sj_no:334,cutoff:'2026-11-21',created_at:'2026-11-22T13:58:42.285Z',
 status:'BOOK_MATCHED_CASH_OPEN',write_scope:'ANALYTICS_ONLY',
 do_active_evidence_matches:true,bj_book_is_current_in_ppic:false,bj_active_cutoff:'2026-11-18',cash_active_cutoff:'2026-11-20',
 summary:{customer:'TRI SUKMA AJI',sku:'C-036',date:'2026-11-21',pack:4000,cartons:5,
 working_price_per_pack:8500,working_nominal_rp:34000000,
 do_bj_lines_matched:37,do_bj_total_lines_checked:37,do_bj_qty_difference_pack:0,
 do_total_sj:24,do_total_pack:621995,bj_total_delivery_pack:621995,bj_book_closing_pack:410125,
 all_do_working_nominal_rp:4474760000,cash_v16_do_reference_nominal_rp:4440760000,
 team_aji_working_do_to_sj334_rp:221900000,team_aji_working_do_prior_sj311_333_rp:187900000},
 cash_context:{sj334_explicit_allocation_rp:null,sj334_payment_status:'BELUM_TERVERIFIKASI',team_aji_transfer_evidence_rp:108000000,transfer_scope:'REKENING_PENAMPUNG_BUKAN_OTOMATIS_BCA_BAL'},
 checks:[{code:'DO_BJ_LINES_MATCH',state:'PASS',matched:37,checked:37,quantity_delta:0},
 {code:'SJ334_IDENTICAL_BOOK',state:'PASS'}, {code:'BJ_BOOK_ROLLFORWARD',state:'PASS'},
 {code:'CASH_23_SJ_WORKING_MATCH',state:'PASS'},
 {code:'CASH_PAYMENT_SJ334_ALLOCATION',state:'OPEN_RECON'},
 {code:'PPIC_ACTIVE_BJ_CUTOFF',state:'STALE_SOURCE'}],
 exceptions:[{code:'SJ334_POD_MISSING',division:'DO',severity:'HIGH',description:'Bukti terima pelanggan belum ada',responsible:'Logistik'},
 {code:'SJ334_INVOICE_ALLOCATION_MISSING',division:'KAS BANK',severity:'HIGH',description:'Alokasi SJ334 belum ada pada Kas V16',responsible:'Finance'}],
 source_provenance:{do_sha256:'a'.repeat(64),bj_sha256:'b'.repeat(64),kas_sha256:'c'.repeat(64)},
 finance_settlement_confirmed:false,official_inventory_updated:false
 }});
async function login(page){
 const errors=[],data={sent:0};
 page.on('pageerror',e=>errors.push(e.message));
 await page.route(API+'/**',async route=>{
  const req=route.request(),url=req.url();let response={};
  if(url.includes('/auth/v1/token'))response={access_token:'SYNTHETIC_OWNER',expires_in:3600};
  else if(url.includes('/ppic-owner-check'))response={authorized:true,role:'owner'};
  else if(url.includes('/ppic-robot-status'))response=status('2026-11');
  else if(url.includes('/ppic-sj-recon-status'))response=cross();
  else if(url.includes('/ppic-stage2-status')||url.includes('/ppic-stage3-status')||
   url.includes('/ppic-skt-watch-status')||url.includes('/ppic-plan-status')||
   url.includes('/ppic-do-sync-health'))response={ok:true,period:'2026-11',ready:false,latest:null};
  else if(url.includes('/ppic-auto-import-status'))response={ok:true,period:'2026-11',config:{enabled:false},jobs:[]};
  else if(url.includes('/ppic-owner-assistant'))response={ok:true,period:'2026-11',live_gpt_configured:true,questions:[]};
  else if(url.includes('/auth/v1/logout'))response={};
  else response=[];
  try{await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)});}
  catch(e){if(!page.isClosed()&&!/closed|canceled|handled|Invalid InterceptionId/i.test(e.message))throw e;}
 });
 await page.goto(ROOT);
 await expect(page.locator('#ppicMain')).toBeHidden();
 await page.locator('#ownerPassword').fill('SYNTHETIC');
 await page.locator('#loginButton').click();
 await expect(page.locator('#ppicMain')).toBeVisible();
 await expect(page.locator('#ppicCrossBookMetrics .ppic-cross-metric')).toHaveCount(6);
 return{errors,data};
}
test('Owner sees matched books but no claim of final cash or physical receipt',async({page})=>{
 const s=await login(page);
 await expect(page.locator('#ppicCrossBookBadge')).toHaveText('BUKU COCOK · KAS TERBUKA');
 await expect(page.locator('#ppicCrossBookMetrics')).toContainText('37 / 37');
 await expect(page.locator('#ppicCrossBookMetrics')).toContainText('4.000 pack');
 await expect(page.locator('#ppicCrossBookMetrics')).toContainText('34.000.000');
 await expect(page.locator('#ppicCrossBookMetrics')).toContainText('Belum ada bukti');
 await expect(page.locator('#ppicCrossBookSource')).toContainText('18 Nov 2026');
 await page.locator('#ppicCrossBookPanel summary').first().click();
 await expect(page.locator('#ppicCrossBookChecks .ppic-cross-check')).toHaveCount(6);
 await page.locator('#ppicCrossBookPanel summary').last().click();
 await expect(page.locator('#ppicCrossBookRisks')).toContainText('Finance');
 expect(s.data.sent).toBe(0);
 await page.locator('#logoutOwner').click();
 await expect(page.locator('#ppicMain')).toBeHidden();
 await expect(page.locator('#ppicCrossBookMetrics')).toBeEmpty();
 expect(s.errors).toEqual([]);
});
test('Narrow mobile preserves all amounts without extra transactions',async({page})=>{
 await page.setViewportSize({width:375,height:812});
 const s=await login(page);
 await expect(page.locator('#ppicCrossBookMetrics .ppic-cross-metric')).toHaveCount(6);
 await expect(page.locator('#ppicCrossBookNotice')).toContainText('tidak mengurangi stok');
 expect(s.errors).toEqual([]);
});
