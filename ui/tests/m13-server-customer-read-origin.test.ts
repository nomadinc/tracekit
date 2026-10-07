import assert from "node:assert/strict";
import test from "node:test";
import { productionCustomerRepository } from "../lib/customers/production-repository";

function scope(): any { return { authenticated:true,organizationId:"stem",workspaceId:"foreign",businessContextId:null,session:{authenticated:true} }; }
test("server customer repository uses authenticated Core transport with canonical organization scope",async()=>{
 const previousFetch=globalThis.fetch;const originalKey=process.env.TK_SECRET_KEY;const originalBase=process.env.TRACEKIT_API_BASE_URL;const calls:any[]=[];
 process.env.TK_SECRET_KEY="synthetic-local-test";process.env.TRACEKIT_API_BASE_URL="https://core.example.test";
 globalThis.fetch=async(url:any,init:any)=>{calls.push({url:String(url),init});return Response.json({customers:[]});};
 try{
  await productionCustomerRepository.listCustomers(scope());
  assert.equal(new URL(calls[0].url).origin,"https://core.example.test");
  assert.equal(new URL(calls[0].url).pathname,"/v1/customers");
  assert.equal(new URL(calls[0].url).searchParams.get("workspace_id"),"stem");
  assert.equal(calls[0].init.headers["x-tk-secret"],"synthetic-local-test");
  await assert.rejects(()=>productionCustomerRepository.listCustomers({...scope(),organizationId:null}),/scope_unavailable/);
  assert.equal(calls.length,1);
 }finally{
  globalThis.fetch=previousFetch;if(originalKey===undefined)delete process.env.TK_SECRET_KEY;else process.env.TK_SECRET_KEY=originalKey;if(originalBase===undefined)delete process.env.TRACEKIT_API_BASE_URL;else process.env.TRACEKIT_API_BASE_URL=originalBase;
 }
});
test("browser customer reads remain relative same-origin and cannot forward a server credential",async()=>{
 const previousFetch=globalThis.fetch;const originalWindow=(globalThis as any).window;const calls:any[]=[];(globalThis as any).window={};
 globalThis.fetch=async(url:any,init:any)=>{calls.push({url:String(url),init});return Response.json({customers:[]});};
 try{
  await productionCustomerRepository.listCustomers(scope());
  assert.ok(calls[0].url.startsWith("/api/customers?"));assert.equal(calls[0].init.headers["x-tk-secret"],undefined);assert.equal(calls[0].init.headers.authorization,undefined);
 }finally{globalThis.fetch=previousFetch;if(originalWindow===undefined)delete (globalThis as any).window;else (globalThis as any).window=originalWindow;}
});
