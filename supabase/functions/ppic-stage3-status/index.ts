import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "jsr:@supabase/supabase-js@2.57.4";
import {createStage3Handler} from "./validation.mjs";

const url=Deno.env.get("SUPABASE_URL")||"";
let serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
if(!serviceKey){try{serviceKey=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||"";}catch{/* no key */}}
const unavailable=()=>new Response(JSON.stringify({ok:false,error:"Pusat keputusan PPIC belum siap"}),{status:503,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const handler=url&&serviceKey?createStage3Handler({service:createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})}):unavailable;
Deno.serve(handler);
