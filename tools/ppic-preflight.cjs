#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {validateManifest,digest}=require("../lib/ppic-manifest-validator");
function preflight(filePath,manifestPath){
 const raw=fs.readFileSync(filePath);
 const manifest=JSON.parse(fs.readFileSync(manifestPath,"utf8"));
 const errors=[...validateManifest(manifest).errors];
 if(raw.length===0)errors.push("empty source file");
 if(raw.length>50*1024*1024)errors.push("source exceeds 50 MiB");
 if(manifest.sha256!==digest(raw))errors.push("sha256 mismatch");
 const expectedExt={XLSX:".xlsx",XLSM:".xlsm",CSV:".csv",PDF:".pdf",DOCX:".docx"}[manifest.source_kind];
 if(expectedExt&&path.extname(filePath).toLowerCase()!==expectedExt)errors.push("extension mismatch");
 if(!manifest.source_locator?.startsWith("private://"))errors.push("source_locator must be a private reference");
 if(!["WORKING","OPEN RECON","RECONCILED","LOCKED"].includes(manifest.reconciliation_status))errors.push("invalid reconciliation status");
 return {ok:errors.length===0,errors,document_id:manifest.document_id,bytes:raw.length,sha256:digest(raw)};
}
if(require.main===module){
 if(process.argv.length!==4){process.stderr.write("Usage: node tools/ppic-preflight.cjs <source-file> <private-manifest.json>\n");process.exit(2)}
 try{const result=preflight(process.argv[2],process.argv[3]);process.stdout.write(JSON.stringify(result)+"\n");process.exitCode=result.ok?0:1}
 catch(e){process.stderr.write("Preflight error: "+e.message+"\n");process.exitCode=1}
}
module.exports={preflight};
