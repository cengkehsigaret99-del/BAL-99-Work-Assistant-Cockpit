import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "jsr:@supabase/supabase-js@2.57.4";
import {createSKTWatchHandler} from "./validation.mjs";
const url=Deno.env.get("SUPABASE_URL")||"";
let key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
if(!key){try{key=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||"";}catch{/* unavailable */}}
const unavailable=()=>new Response(JSON.stringify({ok:false,error:"Layanan pemantauan belum siap"}),{status:503,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(url&&key?createSKTWatchHandler({service:createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})}):unavailable);
