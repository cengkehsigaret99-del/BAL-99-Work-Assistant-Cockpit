import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.57.4";
import { createStatusHandler } from "../ppic-auto-import/validation.mjs";

const url = Deno.env.get("SUPABASE_URL") || "";
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
// Keep verify_jwt=true. The handler additionally checks the authenticated Owner and exact Origin.
const handler = url && key ? createStatusHandler({service:createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})}) : () => new Response(JSON.stringify({ok:false,error:"Status service unavailable"}),{status:503,headers:{"content-type":"application/json","cache-control":"no-store"}});
Deno.serve(handler);
