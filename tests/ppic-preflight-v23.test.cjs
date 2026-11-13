"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {digest}=require("../lib/ppic-manifest-validator"),{preflight}=require("../tools/ppic-preflight.cjs");
function fixture(fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"ppic-fixture-"));
 const file=path.join(dir,"sample.csv"),manifestPath=path.join(dir,"manifest.json"),bytes=Buffer.from("date,sku,qty\n2026-11-13,SYNTHETIC,10\n");
 const manifest={document_id:"SYNTHETIC-DOC-0001",division:"Barang Jadi",period:"2026-11",cutoff:"2026-11-13T08:00:00+07:00",version:"V001",source_kind:"CSV",sha256:digest(bytes),reconciliation_status:"OPEN RECON",access_class:"CONFIDENTIAL",source_locator:"private://fixture/sample.csv",ingested_at:"2026-11-13T08:05:00+07:00"};
 fs.writeFileSync(file,bytes);const run=()=>{fs.writeFileSync(manifestPath,JSON.stringify(manifest));return preflight(file,manifestPath)};
 try{fn({file,manifest,run})}finally{fs.rmSync(dir,{recursive:true,force:true})}
}
test("valid synthetic source passes",()=>fixture(({run})=>assert.equal(run().ok,true)));
test("tampered file fails checksum",()=>fixture(({file,run})=>{fs.appendFileSync(file,"tamper");assert.ok(run().errors.includes("sha256 mismatch"))}));
test("non-private locator fails",()=>fixture(({manifest,run})=>{manifest.source_locator="https://public.example/file";assert.equal(run().ok,false)}));
test("invalid status fails",()=>fixture(({manifest,run})=>{manifest.reconciliation_status="FINAL";assert.equal(run().ok,false)}));
test("no raw content or credentials in output",()=>fixture(({run})=>{const out=JSON.stringify(run());assert.ok(!out.includes("SYNTHETIC,10"));assert.ok(!out.includes("private://fixture"))}));
