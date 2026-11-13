"use strict";
(() => {
 const ROOT="https://jryfozndxpjymggevkgq.supabase.co";
 const KEY="sb_publishable_T6Yt1YFAIu0F7o-twLOGNg_AgAvDGbP";
 const EMAIL="cengkehsigaret99@gmail.com";
 const $=id=>document.getElementById(id);
 const login=$("ownerLogin"),main=$("ppicMain"),status=$("loginStatus"),form=$("loginForm"),logout=$("logoutOwner");
 let accessToken="",expiresAt=0,expiryTimer=null,attempt=0;
 const MAX_SESSION_MS=30*60*1000;
 function clearExpiry(){if(expiryTimer!==null){clearTimeout(expiryTimer);expiryTimer=null}expiresAt=0}
 function expire(){attempt++;show(false);message("Sesi berakhir. Silakan login kembali.")}
 const show=(authorized)=>{login.hidden=authorized;main.hidden=!authorized;logout.hidden=!authorized;if(!authorized){accessToken="";clearExpiry();$("ownerPassword").value=""}};
 const message=(value)=>{status.textContent=value};
 async function verify(token){
  const response=await fetch(ROOT+"/functions/v1/ppic-owner-check",{method:"GET",headers:{"apikey":KEY,"Authorization":"Bearer "+token},cache:"no-store"});
  if(!response.ok)throw Error(response.status===403?"Akun ini tidak memiliki izin Owner.":"Verifikasi Owner gagal ("+response.status+").");
  const result=await response.json();
  if(result.authorized!==true||result.role!=="owner")throw Error("Identitas Owner tidak sah.");
 }
 async function signIn(email,password){
  const response=await fetch(ROOT+"/auth/v1/token?grant_type=password",{method:"POST",headers:{"apikey":KEY,"Content-Type":"application/json"},body:JSON.stringify({email,password}),cache:"no-store"});
  if(!response.ok)throw Error("Login gagal. Periksa email, kata sandi, dan pengaturan Supabase Auth.");
  return response.json();
 }
 form.addEventListener("submit",async(event)=>{
  event.preventDefault();const current=++attempt;$("loginButton").disabled=true;message("Memverifikasi akun Owner…");
  try{
   const email=$("ownerEmail").value.trim().toLowerCase();
   if(email!==EMAIL)throw Error("Email ini bukan akun Owner BAL PPIC.");
   const session=await signIn(email,$("ownerPassword").value);
   await verify(session.access_token);
   if(current!==attempt)return;
   const seconds=Number(session.expires_in);
   if(!Number.isFinite(seconds)||seconds<=0)throw Error("Masa berlaku sesi tidak valid.");
   accessToken=session.access_token;
   const duration=Math.min(seconds*1000,MAX_SESSION_MS);
   expiresAt=Date.now()+duration;
   expiryTimer=setTimeout(expire,duration);
   show(true);message("Owner terverifikasi. Bank data aktual belum terhubung.");
  }catch(error){if(current===attempt){show(false);message(error.message||"Gagal masuk.")}}
  finally{$("loginButton").disabled=false}
 });
 logout.addEventListener("click",async()=>{
  attempt++;const token=accessToken;show(false);message("Anda sudah keluar.");
  if(token){try{await fetch(ROOT+"/auth/v1/logout",{method:"POST",headers:{"apikey":KEY,"Authorization":"Bearer "+token}})}catch(_){/* local logout always applies */}}
 });
 document.addEventListener("visibilitychange",()=>{if(!document.hidden&&accessToken&&Date.now()>=expiresAt)expire()});
 window.addEventListener("pageshow",event=>{if(event.persisted)expire()});
 // Fail closed on reload; do not persist credentials or tokens in browser storage.
 show(false);
})();
