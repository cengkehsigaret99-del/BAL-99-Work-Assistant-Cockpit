#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),assert=require("node:assert/strict"),test=require("node:test");
const dir=__dirname;
const read=f=>fs.readFileSync(dir+"/"+f,"utf8");
const pages=["ppic-explorer-v01.html","data-bank-v02.html","report-explorer-v03.html","print-engine-v04.html"];
const scripts=["data-bank-v02.js","report-explorer-v03.js","print-engine-v04.js"];
for(const file of pages)test(file+" is standalone HTML skeleton",()=>{const s=read(file);assert.match(s,/<!doctype html>/i);assert.match(s,/<html lang="id">/);assert.match(s,/<meta name="viewport"/);assert.match(s,/<title>/);assert.match(s,/<\/html>/);assert.match(s,/@media print/);assert.match(s,/DEMO|PROTOTYPE|preview/i)});
for(const file of scripts)test(file+" syntax valid",()=>{const s=read(file);new (require("node:vm").Script)(s,{filename:file});assert.match(s,/textContent/);assert.doesNotMatch(s,/fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage/)});
test("Data Bank no transaction input form",()=>{const s=read("data-bank-v02.html");assert.doesNotMatch(s,/<form\b/i);assert.match(s,/read.only/i)});
test("13 PPIC report definitions",()=>{const s=read("report-explorer-v03.js");const items=s.match(/^\[\d+,"/gm)||[];assert.equal(items.length,13);assert.match(s,/print\(\)/);assert.match(s,/textContent/)});
test("Print Engine three fixture templates and export",()=>{const s=read("print-engine-v04.js");for(const k of ["stock:","wip:","gap:"])assert.ok(s.includes(k));assert.match(s,/exportCSV/);assert.match(s,/window\.print\(\)/);assert.match(s,/textContent/)});
test("Print Engine explicit synthetic warning",()=>{const s=read("print-engine-v04.html");assert.match(s,/data sintetis/i);assert.match(s,/DEMO \/ NOT OFFICIAL/);assert.match(s,/A4 portrait/i);assert.match(s,/A4 landscape/i)});
test("No production workflow edits in prototype",()=>{for(const file of pages.concat(scripts)){const s=read(file);assert.doesNotMatch(s,/api\.github\.com\/repos|supabase\.co|Web SKT API/i)}});
