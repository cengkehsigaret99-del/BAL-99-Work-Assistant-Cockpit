"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),test=require("node:test");
const file=fs.readFileSync("docs/PPIC_PRIVATE_BACKEND_GATE_V17.md","utf8");
test("deny by default and server authorization",()=>{for(const x of ["deny by default","server","RLS","audit","INACTIVE"])assert.ok(file.includes(x),x)});
test("no public private documents",()=>{assert.ok(file.includes("No private data or secret keys"));assert.ok(file.includes("expiring authorized links"))});
test("existing public site has no direct API",()=>{const html=fs.readFileSync("index.html","utf8");assert.ok(!html.includes("supabase.co"));assert.ok(!html.includes("service_role"));assert.ok(!html.includes("fetch("))});
