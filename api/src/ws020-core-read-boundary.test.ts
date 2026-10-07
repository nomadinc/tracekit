import assert from "node:assert/strict";
import test from "node:test";
import worker from "./index.ts";
import { isProtectedCustomerReadPath } from "./customer-read-boundary.ts";
const paths=["/v1/customers","/v1/customers/foreign","/v1/customer-orders","/v1/events","/v1/entities/customer/foreign","/v1/home","/v1/health","/v1/search","/v1/executive-dashboard","/v1/operations/summary","/v1/financial-import-monitor","/v1/financial-reconciliation","/v1/platform-orders/detail","/v1/profit/summary","/v1/refunds/analysis","/v1/chargebacks/analysis","/v1/kpis","/v1/revenue-spend","/v1/product-costs/rules"];
test("actual Core HTTP router rejects private customer reads without a server credential before database access",async()=>{
 const previousFetch=globalThis.fetch;let requests=0;globalThis.fetch=async()=>{requests++;throw new Error("must not read persistence");};
 try{
  for(const path of paths){assert.equal(isProtectedCustomerReadPath(path),true);const response=await worker.fetch(new Request(`https://core.example.test${path}?workspace_id=foreign`),{TK_SECRET_KEY:"synthetic-local-test"} as any,{} as any);assert.equal(response.status,401,path);assert.equal((await response.json() as any).error,"unauthorized");}
  assert.equal(requests,0);
 }finally{globalThis.fetch=previousFetch;}
});
test("actual Core HTTP router requires explicit scope on authorized private reads",async()=>{
 for(const path of paths){const response=await worker.fetch(new Request(`https://core.example.test${path}`,{headers:{"x-tk-secret":"synthetic-local-test"}}),{TK_SECRET_KEY:"synthetic-local-test"} as any,{} as any);assert.equal(response.status,400,path);}
 assert.equal(isProtectedCustomerReadPath("/v1/tkid/events"),false);
 assert.equal(isProtectedCustomerReadPath("/v1/connectors/commas/webhooks"),false);
});

test("private commerce mutations cannot use anonymous Core access",async()=>{
 for(const path of ["/v1/financial-reconciliation/matches","/v1/product-costs/rules","/v1/profit/rebuild"]){
  const response=await worker.fetch(new Request(`https://core.example.test${path}`,{method:"POST",headers:{"content-type":"application/json"},body:'{"workspace_id":"foreign"}'}),{TK_SECRET_KEY:"synthetic-local-test"} as any,{} as any);assert.equal(response.status,401,path);
 }
});
