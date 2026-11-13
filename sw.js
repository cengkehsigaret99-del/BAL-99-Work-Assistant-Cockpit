const CACHE_NAME="bal-ppic-public-shell-v27";
const BASE=new URL("./",self.registration.scope);
const SHELL=["./","./index.html","./auth.js","./logo.png","./icon-192.png","./icon-512.png","./icon.svg","./manifest.webmanifest"];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("bal-ppic-public-shell-")&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=="GET"||url.origin!==self.location.origin||!url.pathname.startsWith(BASE.pathname))return;
 if(req.mode==="navigate"){event.respondWith(fetch(req,{cache:"no-store"}).catch(()=>new Response('<!doctype html><html lang="id"><meta name="viewport" content="width=device-width"><title>BAL PPIC Offline</title><body style="font:16px system-ui;background:#08131f;color:#fff;padding:30px"><h1>BAL PPIC</h1><p>Koneksi internet diperlukan untuk login dan membaca laporan privat.</p></body>',{status:503,headers:{"Content-Type":"text/html;charset=utf-8","Cache-Control":"no-store"}})));return}
 const asset=SHELL.some(x=>new URL(x,BASE).pathname===url.pathname);
 if(!asset)return;
 event.respondWith(caches.open(CACHE_NAME).then(async cache=>{
  try{const response=await fetch(req,{cache:"no-store"});if(response.ok)await cache.put(req,response.clone());return response}
  catch(_){return (await cache.match(req))||Response.error()}
 }));
});
