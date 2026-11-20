import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "jsr:@supabase/supabase-js@2.57.4";
import {createPlanHandler} from "./validation.mjs";

const url=Deno.env.get("SUPABASE_URL")||"";
let admin=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
if(!admin){try{admin=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||"";}catch{/* no secret */}}
const unavailable=()=>new Response(JSON.stringify({ok:false,error:"Rencana PPIC belum siap"}),{status:503,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(url&&admin?createPlanHandler({service:createClient(url,admin,{auth:{persistSession:false,autoRefreshToken:false}})}):unavailable);
