#!/usr/bin/env node
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const schema=JSON.parse(fs.readFileSync(path.join(__dirname,"../schemas/ppic-source-manifest-v1.schema.json"),"utf8"));
const required=["document_id","division","period","cutoff","version","source_kind","sha256","reconciliation_status","access_class","source_locator","ingested_at"];
assert.deepEqual(schema.required,required);
assert.equal(schema.additionalProperties,false);
assert.equal(schema.properties.sha256.pattern,"^[a-f0-9]{64}$");
assert.ok(schema.properties.access_class.enum.includes("CONFIDENTIAL"));
assert.ok(schema.properties.reconciliation_status.enum.includes("LOCKED"));
const page=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");
assert.ok(page.includes("Belum terhubung"));
assert.ok(!page.includes("fetch("));
const workflow=fs.readFileSync(path.join(__dirname,"../.github/workflows/deploy-pages.yml"),"utf8");
assert.ok(workflow.includes("path: 'dist'"));
assert.ok(!workflow.includes("path: '.'"));
assert.ok(!workflow.includes("cp schemas/"));
console.log("PASS: manifest contract shape and public/private separation checks");
