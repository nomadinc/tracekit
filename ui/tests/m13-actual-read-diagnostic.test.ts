import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {mcpCustomerRepository} from "../lib/mcp/customer-repository";
const protocol=readFileSync(new URL("../lib/mcp/protocol.ts",import.meta.url),"utf8");
test("M13 actual MCP customer repository classifies Core failures into bounded categories",async()=>{
 const previousFetch=globalThis.fetch;
 const keys=["TK_SECRET_KEY","TRACEKIT_API_BASE_URL","TRACEKIT_USE_STAGING_CORE_CREDENTIAL"];
 const previous=keys.map(k=>process.env[k]);
 process.env.TK_SECRET_KEY="synthetic-ws019-key";process.env.TRACEKIT_API_BASE_URL="https://core.example.test";delete process.env.TRACEKIT_USE_STAGING_CORE_CREDENTIAL;
 try{
  const cases=[{cause:{code:"ENOTFOUND"},expected:"dns_failed"},{cause:{code:"CERT_EXPIRED"},expected:"tls_failed"},{name:"TimeoutError",expected:"timeout"},{cause:{code:"ECONNREFUSED"},expected:"connection_failed"}];
  for(const {expected,...error} of cases){
   globalThis.fetch=async url=>{assert.equal(new URL(String(url)).origin,"https://core.example.test");throw Object.assign(new Error("private transport detail"),error);};
   await assert.rejects(()=>mcpCustomerRepository.listCustomers({authenticated:true,organizationId:"org-1"} as any),{message:`mcp_customer_repository_core_${expected}`});
  }
  globalThis.fetch=async()=>new Response("private upstream body",{status:503});
  await assert.rejects(()=>mcpCustomerRepository.listCustomers({authenticated:true,organizationId:"org-1"} as any),{message:"mcp_customer_repository_core_http_503"});
 }finally{globalThis.fetch=previousFetch;keys.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];});}
});
test("M13 bounded diagnostic accepts actual MCP repository namespace",()=>{assert.ok(protocol.includes("mcp_customer_repository"));assert.ok(protocol.includes("diagnosticCode:code"));});
