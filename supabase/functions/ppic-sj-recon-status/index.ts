import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "jsr:@supabase/supabase-js@2.57.4";
import {createCrossBookHandler} from "./validation.mjs";
const url=Deno.env.get("SUPABASE_URL")||"";
let key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
if(!key){try{key=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||"";}catch{/* absent */}}
const unavailable=()=>new Response(JSON.stringify({ok:false,error:"Rekonsiliasi belum tersedia"}),{status:503,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(url&&key?createCrossBookHandler({service:createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})}):unavailable);
