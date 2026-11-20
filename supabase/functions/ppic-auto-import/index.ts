import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.57.4";
import JSZip from "npm:jszip@3.10.1";
import { XMLParser } from "npm:fast-xml-parser@5.2.5";
import { createImportHandler } from "./validation.mjs";
import { validateSdmSheetNames } from "../ppic-owner-upload/sdm-upload-validation.mjs";
import { giling, verpack } from "../ppic-sdm-rebuild/normalizer.mjs";

const url = Deno.env.get("SUPABASE_URL") || "";
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
// This endpoint uses a single-use, expiring, job-bound nonce issued by the private queue.
// Deployment uses verify_jwt=false ONLY for this internal callback; it accepts no browser Origin.
const handler = url && key ? createImportHandler({
  service: createClient(url, key, {auth:{persistSession:false,autoRefreshToken:false}}),
  workbookDependencies:{JSZip,XMLParser,validateSdmSheetNames,sdmParsers:{giling,verpack}}
}) : () => new Response(JSON.stringify({ok:false,error:"Import service unavailable"}), {status:503,headers:{"content-type":"application/json","cache-control":"no-store"}});
Deno.serve(handler);
