const {test,expect}=require('@playwright/test');
const {status}=require('./fixtures/robot-synthetic.cjs');
const ROOT=process.env.PPIC_TEST_BASE_URL||'http://127.0.0.1:8765/';
const API='https://jryfozndxpjymggevkgq.supabase.co';
async function ownerLogin(page){
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route(API+'/**',async route=>{
  const request=route.request(),url=request.url();
  let data={};
  if(url.includes('/auth/v1/token'))data={access_token:'SYNTHETIC_CHARCOAL_OWNER',expires_in:3600};
  else if(url.includes('/ppic-owner-check'))data={authorized:true,role:'owner'};
  else if(url.includes('/ppic-robot-status'))data=status('2026-11');
  else if(url.includes('/ppic-auto-import-status'))data={ok:true,period:'2026-11',config:{enabled:false},jobs:[]};
  else if(url.includes('/ppic-owner-assistant'))data={ok:true,period:'2026-11',live_gpt_configured:true,questions:[]};
  else if(url.includes('/ppic-sj-recon-status')||url.includes('/ppic-daily-intelligence')||
    url.includes('/ppic-do-sync-health')||url.includes('/ppic-plan-status')||
    url.includes('/ppic-stage3-status')||url.includes('/ppic-stage2-status')||
    url.includes('/ppic-skt-watch-status'))data={ok:true,period:'2026-11',ready:false,latest:null};
  else if(url.includes('/auth/v1/logout'))data={};
  else data=[];
  try{await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});}
  catch(e){if(!page.isClosed()&&!/closed|handled|canceled|Invalid InterceptionId/i.test(e.message))throw e;}
 });
 await page.goto(ROOT);
 await expect(page.locator('#ppicMain')).toBeHidden();
 await page.locator('#ownerPassword').fill('TEST_PASSWORD');
 await page.locator('#loginButton').click();
 await expect(page.locator('#ppicMain')).toBeVisible();
 return errors;
}
test('Charcoal login, PWA meta, navigation and private robot panels on desktop',async({page})=>{
 await page.setViewportSize({width:1366,height:860});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(ROOT);
 await expect(page.locator('link[href="ppic-charcoal-theme.css"]')).toHaveCount(1);
 await expect(page.locator('meta[name=theme-color]')).toHaveAttribute('content','#151719');
 await expect(page.locator('#ownerLogin')).toBeVisible();
 const before=await page.evaluate(()=>{
  const style=getComputedStyle(document.documentElement);
  const login=getComputedStyle(document.querySelector('.owner-card'));
  const button=getComputedStyle(document.querySelector('#loginButton'));
  const body=getComputedStyle(document.body);
  return {bg:style.getPropertyValue('--bg').trim(),panel:style.getPropertyValue('--panel').trim(),
    body:body.backgroundColor,login:login.backgroundImage,button:button.backgroundColor,
    loginBorder:login.borderTopColor};
 });
 expect(before.bg).toBe('#151719');
 expect(before.panel).toBe('#25282c');
 expect(before.body).toBe('rgb(21, 23, 25)');
 expect(before.login).toContain('rgb(49, 53, 58)');
 expect(before.button).toBe('rgb(214, 220, 224)');
 expect(before.loginBorder).toBe('rgb(98, 104, 112)');
 expect(errors).toEqual([]);
});
test('After synthetic Owner login the main and daily, stage 3, planning and DO cards are graphite',async({page})=>{
 const errors=await ownerLogin(page);
 const styles=await page.evaluate(()=>{
  const get=s=>{
   const el=document.querySelector(s);if(!el)return null;
   const cs=getComputedStyle(el);
   return{bg:cs.backgroundImage,fg:cs.color,border:cs.borderTopColor};
  };
  return {
   body:get('body'),header:get('#ppicMain header'),
   robot:get('#ppicMain .robot-panel'),
   daily:get('#ppicDailyIntelPanel'),
   stage3:get('#ppicStage3Panel'),
   plan:get('#ppicPlanPanel'),
   do:get('#ppicDOAutoPanel')
  };
 });
 for(const key of ['header','robot','daily','stage3','plan','do']){
  expect(styles[key],key).not.toBe(null);
  expect(styles[key].bg,key).toMatch(/rgba?\(48,\s*52,\s*58(?:,|\))|rgba?\(49,\s*53,\s*58(?:,|\))|rgba?\(50,\s*54,\s*59(?:,|\))/);
 }
 const brandLogo=page.locator('.bal-brand-mark');
 await expect(brandLogo).toBeVisible();
 expect(errors).toEqual([]);
 await page.locator('#logoutOwner').click();
 await expect(page.locator('#ppicMain')).toBeHidden();
});
test('Android-sized theme stays dark and printable report style stays white',async({page})=>{
 await page.setViewportSize({width:375,height:812});
 const errors=await ownerLogin(page);
 const mobile=await page.evaluate(()=>{
  const body=getComputedStyle(document.body);
  const card=getComputedStyle(document.querySelector('#ppicDailyIntelPanel'));
  return{body:body.backgroundColor,cardBg:card.backgroundImage,padding:card.paddingLeft};
 });
 expect(mobile.body).toBe('rgb(21, 23, 25)');
 expect(mobile.cardBg).toContain('rgb(48, 52, 58)');
 await page.emulateMedia({media:'print'});
 const printed=await page.evaluate(()=>{
  const b=getComputedStyle(document.body);
  const paper=getComputedStyle(document.querySelector('.paper')||document.querySelector('#ppicMain .panel'));
  return{background:b.backgroundColor,paper:paper.backgroundColor};
 });
 expect(printed.background).toBe('rgb(255, 255, 255)');
 expect(printed.paper).toBe('rgb(255, 255, 255)');
 expect(errors).toEqual([]);
});
