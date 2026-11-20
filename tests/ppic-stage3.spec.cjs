const {test,expect}=require('@playwright/test');
const {status}=require('./fixtures/robot-synthetic.cjs');
const ROOT=process.env.PPIC_TEST_BASE_URL||'http://127.0.0.1:8765/';
const API='https://jryfozndxpjymggevkgq.supabase.co';
const card=(id,title,rank,kind='ADMIN_FOLLOWUP')=>({
 id,rank,priority:rank<=3?'P1':'P2',kind,title,reason:'Perlu bukti yang benar.',
 consequence:'Kesimpulan produksi tanpa bukti dapat salah.',recommendation:'Cocokkan administrasi dan kondisi fisik.',
 owner_role:'Admin PPIC / Owner',confidence:'SEDANG',data_limit:'Bukti opname belum lengkap.',
 action_state:'USULAN',gate:'BUTUH_VERIFIKASI',requires_owner_approval:kind==='OWNER_DECISION',
 missing_evidence_present:true,divisions:['CUKAI'],risks:[],
 evidence:[{document_id:'SYNTHETIC_DOCUMENT',fact_keys:['source_data_cutoff']}]
});
const decisionData=(fresh=true)=>({
 ok:true,ready:true,period:'2026-11',latest:{
  id:'11111111-1111-4111-8111-111111111111',
  briefing_id:'22222222-2222-4222-8222-222222222222',
  schema_version:'ppic-stage3-decision-v1',evidence_hash:'a'.repeat(64),evidence_current:fresh,
  analysis_as_of:'2026-11-20',created_at:'2026-11-21T00:10:00Z',
  source_count:10,data_blockers:3,status:'WAITING_DATA',
  focus_ids:['stock_pita','bj_qc','sdm_dates'],
  decisions:[
   card('stock_pita','Periksa pita yang tersedia',1,'OWNER_DECISION'),
   card('bj_qc','Cocokkan QC Barang Jadi',2),
   card('sdm_dates','Perbaiki tanggal SDM',3,'DATA_BLOCKER'),
   card('finance','Cocokkan bank',4,'OWNER_DECISION')
  ],
  risk_register:[{code:'CUKAI_PITA_NOT_ARRIVED',severity:'HIGH',division:'CUKAI',message:'Pita belum terkonfirmasi tiba.'}],
  coverage:[{division:'CUKAI',source_cutoff:'2026-11-20',report_cutoff:'2026-11-17',report_status:'OPEN RECON'}]
 }});
async function login(page,{fresh=true}={}){
 const errors=[];let submits=0;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route(API+'/**',async route=>{
  const request=route.request(),url=request.url();let data=[],http=200;
  if(url.includes('/auth/v1/token'))data={access_token:'SYNTHETIC_OWNER_TOKEN',expires_in:3600};
  else if(url.includes('/ppic-owner-check'))data={authorized:true,role:'owner'};
  else if(url.includes('/ppic-robot-status'))data=status('2026-11');
  else if(url.includes('/ppic-stage3-status'))data=decisionData(fresh);
  else if(url.includes('/ppic-stage2-status'))data={ok:true,period:'2026-11',ready:false,latest:null};
  else if(url.includes('/ppic-auto-import-status'))data={ok:true,period:'2026-11',config:{enabled:false},jobs:[]};
  else if(url.includes('/ppic-owner-assistant')){
   const q=request.postDataJSON();
   if(q?.mode==='submit'){submits++;data={ok:true,id:'33333333-3333-4333-8333-333333333333',state:'QUEUED',period:'2026-11'};}
   else data={ok:true,period:'2026-11',live_gpt_configured:true,questions:[]};
  }
  else if(url.includes('/auth/v1/logout'))data={};
  try{await route.fulfill({status:http,contentType:'application/json',body:JSON.stringify(data)});}
  catch(e){if(!page.isClosed()&&!/closed|canceled|handled|Invalid InterceptionId/i.test(e.message))throw e;}
 });
 await page.goto(ROOT);
 await expect(page.locator('#ppicMain')).toBeHidden();
 await page.locator('#ownerPassword').fill('SYNTHETIC');
 await page.locator('#loginButton').click();
 await expect(page.locator('#ppicMain')).toBeVisible();
 await expect(page.locator('#ppicStage3Focus .ppic-s3-card')).toHaveCount(3);
 return {errors,get submits(){return submits;}};
}
test('Owner sees three provenance-backed proposals, can queue further analysis without executing by mistake',async({page})=>{
 const audit=await login(page);
 await expect(page.locator('#ppicStage3Badge')).toHaveText('Butuh data');
 await expect(page.locator('#ppicStage3More')).toContainText('1 prioritas tambahan');
 await expect(page.locator('#ppicStage3Focus')).toContainText('Periksa pita yang tersedia');
 await expect(page.locator('#ppicStage3Focus')).toContainText('USULAN · belum dieksekusi');
 await page.locator('#ppicStage3Focus .ppic-s3-evidence summary').first().click();
 await expect(page.locator('#ppicStage3Focus .ppic-s3-evidence-row').first()).toContainText('SYNTHETIC_DOCUMENT');
 await page.locator('#ppicStage3Focus .ppic-s3-actions button').first().click();
 await expect(page.locator('#ppicAskIntent')).toHaveValue('ANALYZE');
 await expect(page.locator('#ppicAskText')).toHaveValue(/Periksa pita yang tersedia/);
 expect(audit.submits).toBe(0);
 await page.locator('#logoutOwner').click();
 await expect(page.locator('#ppicMain')).toBeHidden();
 await expect(page.locator('#ppicStage3Focus .ppic-s3-card')).toHaveCount(0);
 expect(audit.errors).toEqual([]);
});
test('Old evidence is visibly stale and no operational execution button is rendered',async({page})=>{
 const audit=await login(page,{fresh:false});
 await expect(page.locator('#ppicStage3Badge')).toHaveText('Sumber berubah');
 await expect(page.locator('#ppicStage3Message')).toContainText('hanya untuk histori');
 await expect(page.locator('#ppicStage3Panel button')).not.toContainText('Bayar');
 await expect(page.locator('#ppicStage3Panel button')).not.toContainText('Posting');
 expect(audit.submits).toBe(0);
 expect(audit.errors).toEqual([]);
});
