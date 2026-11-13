"use strict";
// Offline, read-only validation module. No uploads, network calls, or persistence.
const crypto=require("node:crypto");
const fs=require("node:fs");
const schema=require("../schemas/ppic-source-manifest-v1.schema.json");
const required=schema.required;
function validateManifest(record){
 const errors=[];
 if(!record||typeof record!=="object"||Array.isArray(record))return {ok:false,errors:["record must be object"]};
 for(const key of required)if(!(key in record))errors.push("missing "+key);
 for(const key of Object.keys(record))if(!Object.prototype.hasOwnProperty.call(schema.properties,key))errors.push("unexpected "+key);
 for(const [key,rule] of Object.entries(schema.properties)){
  const val=record[key];if(val===undefined)continue;
  if(rule.type==="string"&&typeof val!=="string")errors.push("type "+key);
  if(Array.isArray(rule.type)&&!rule.type.includes(val===null?"null":typeof val))errors.push("type "+key);
  if(typeof val==="string"){
   if(rule.minLength&&val.length<rule.minLength)errors.push("minLength "+key);
   if(rule.maxLength&&val.length>rule.maxLength)errors.push("maxLength "+key);
   if(rule.pattern&&!new RegExp(rule.pattern).test(val))errors.push("pattern "+key);
   if(rule.format==="date-time"&&(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(val)||!Number.isFinite(Date.parse(val))))errors.push("date-time "+key);
  }
  if(rule.enum&&!rule.enum.includes(val))errors.push("enum "+key);
 }
 if(record.supersedes_document_id===record.document_id)errors.push("self supersedes");
 return {ok:errors.length===0,errors};
}
function digest(buffer){return crypto.createHash("sha256").update(buffer).digest("hex")}
function verifySource(record,buffer){const v=validateManifest(record);if(!v.ok)return v;const actual=digest(buffer);return actual===record.sha256?{ok:true,errors:[]}:{ok:false,errors:["checksum mismatch"]}}
function inspectBatch(items){
 const seenIds=new Set(),seenHashes=new Map(),results=[];
 for(const item of items){
  const r=item.manifest,v=verifySource(r,item.bytes),issues=[...v.errors];
  if(r&&typeof r.document_id==="string"){if(seenIds.has(r.document_id))issues.push("duplicate document_id");seenIds.add(r.document_id)}
  if(r&&typeof r.sha256==="string"){const prev=seenHashes.get(r.sha256);if(prev&&prev!==r.document_id)issues.push("duplicate source hash");else seenHashes.set(r.sha256,r.document_id)}
  results.push({document_id:r?.document_id||null,ok:issues.length===0,errors:issues});
 }
 return {ok:results.every(r=>r.ok),results};
}
module.exports={validateManifest,verifySource,inspectBatch,digest};
