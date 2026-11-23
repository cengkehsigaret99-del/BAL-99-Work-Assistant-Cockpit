import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "jsr:@supabase/supabase-js@2.57.4";
import {createDailyHandler} from "./validation.mjs";
const url=Deno.env.get("SUPABASE_URL")||"";
let key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
if(!key){try{key=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||"";}catch{/* unavailable */}}
const notReady=()=>new Response(JSON.stringify({ok:false,error:"Dashboard operasional belum siap"}),{status:503,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(url&&key?createDailyHandler({service:createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})}):notReady);
