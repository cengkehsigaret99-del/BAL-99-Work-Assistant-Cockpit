import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "jsr:@supabase/supabase-js@2.57.4";
import {createOwnerAssistantHandler} from "./validation.mjs";

const url=Deno.env.get("SUPABASE_URL")||"";
let secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
if(!secret){try{secret=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||"";}catch{/* no server secret */}}
const apiKey=Deno.env.get("OPENAI_API_KEY")||"";
const model=Deno.env.get("PPIC_OPENAI_MODEL")||"gpt-4.1";
const unavailable=()=>new Response(JSON.stringify({ok:false,error:"Layanan asisten PPIC belum siap"}),{status:503,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const handler=(url&&secret)?createOwnerAssistantHandler({service:createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}}),openaiKey:apiKey,model}):unavailable;
Deno.serve(handler);
