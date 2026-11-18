"use strict";
const fs=require("node:fs"),assert=require("node:assert/strict"),test=require("node:test");
const sql=fs.readFileSync("sql/ppic_owner_only_v18_draft.sql","utf8");
const docs=fs.readFileSync("docs/PPIC_OWNER_ONLY_V18_GATE.md","utf8");
test("private schema and deny-by-default",()=>{for(const s of ["create schema if not exists ppic_private","revoke all on schema ppic_private from public, anon, authenticated","force row level security","revoke all on ppic_private.source_registry from public, anon, authenticated"])assert.ok(sql.includes(s),s)});
test("no owner identity or public access hardcoded",()=>{assert.ok(!sql.includes("@"));assert.doesNotMatch(sql,/grant\s+select\s+on\s+ppic_private/i);assert.doesNotMatch(sql,/insert\s+into\s+ppic_private\.owner_access/i)});
test("live gating and negative access checks documented",()=>{for(const s of ["COMING_UP","NO-GO","403","401","owner UUID","Disable public signups"])assert.ok(docs.includes(s),s)});
