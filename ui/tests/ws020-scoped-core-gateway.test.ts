import assert from "node:assert/strict";
import test from "node:test";
import { createScopedCoreProxy } from "../lib/identity/scoped-core-runtime";
import { resolveEffectivePermissions } from "../lib/identity/persistent-authorization";
import { projectCoreCustomerRead } from "../lib/identity/core-read-projection";
import { authorizedDetailedFinancialOrganization } from "../lib/identity/financial-read-scope";
import type { TraceKitSessionContext } from "../lib/identity/persistent-types";

function session():TraceKitSessionContext {
 const membership:any={id:"m",userId:"u",accountId:"a",organizationId:"stem",role:"client-read-only",status:"active",effectiveFrom:"2020-01-01T00:00:00Z"};
 return {user:{id:"u",status:"active"},membership,activeOrganization:{id:"stem",name:"Stem"},availableOrganizations:[{id:"stem",name:"Stem"}],effectivePermissions:[...resolveEffectivePermissions(membership,[])],activeAccount:{id:"a"}} as TraceKitSessionContext;
}
function proxy(resolution:any = {kind:"authenticated",session:session()}) {
 const calls:any[]=[];
 const gateway=createScopedCoreProxy({resolveSession:async()=>resolution,apiBaseUrl:()=>"https://core.example.test",adminSecret:()=>"synthetic-local-test",fetch:async(url:any,init:any)=>{calls.push({url:String(url),init});return Response.json({orders:[{id:"o",gross_amount:0,customer_email:"private@example.test"}]});}});
 return {gateway,calls};
}
test("private read gateway denies unauthenticated, inactive, and foreign scope before Core transport",async()=>{
 for(const resolution of [{kind:"unauthenticated"},{kind:"no-membership"},{kind:"authenticated",session:{...session(),membership:{...session().membership,status:"removed"}}}]){
  const x=proxy(resolution);assert.equal((await x.gateway.scopedCoreGet("/v1/events","https://ui.example.test/api/events","customers.view")).status,404);assert.equal(x.calls.length,0);
 }
 for(const hint of ["workspace_id=foreign","organization_id=foreign","workspace_id=stem&workspace_id=foreign"]){
  const x=proxy();assert.equal((await x.gateway.scopedCoreGet("/v1/events",`https://ui.example.test/api/events?${hint}`,"customers.view")).status,404);assert.equal(x.calls.length,0);
 }
 const x=proxy({kind:"authenticated",session:{...session(),availableOrganizations:[]}});assert.equal((await x.gateway.scopedCoreGet("/v1/events","https://ui.example.test/api/events","customers.view")).status,404);assert.equal(x.calls.length,0);
});
test("read gateway injects canonical tenant, retains pagination and projects restricted details",async()=>{
 const x=proxy();const result:any=await x.gateway.scopedCoreGet("/v1/customer-orders","https://ui.example.test/api/customer-orders?offset=17","orders.view",projectCoreCustomerRead);
 assert.equal(result.status,200);assert.deepEqual(result.body,{orders:[{id:"o"}]});
 const url=new URL(x.calls[0].url);assert.equal(url.searchParams.get("workspace_id"),"stem");assert.equal(url.searchParams.get("offset"),"17");
 assert.equal(x.calls[0].init.headers["x-tk-secret"],"synthetic-local-test");
});
test("aggregate financial permission cannot authorize detailed financial reads or reconcile mutations",async()=>{
 const x=proxy();assert.ok(session().effectivePermissions.includes("financials.view"));
 assert.equal((await x.gateway.scopedCoreGet("/v1/financial-reconciliation","https://ui.example.test/api/financial-reconciliation",["financials.view","orders.view_financials"])).status,404);
 assert.equal((await x.gateway.scopedCorePost("/v1/financial-reconciliation/matches",new Request("https://ui.example.test/api/financial-reconciliation/matches",{method:"POST",headers:{origin:"https://ui.example.test","content-type":"application/json"},body:'{}'}),["financials.reconcile","orders.view_financials"])).status,404);
 assert.equal(x.calls.length,0);
});
test("authorized detailed financial read preserves genuine zero",async()=>{
 const identity={...session(),effectivePermissions:[...session().effectivePermissions,"orders.view_financials"]};const x=proxy({kind:"authenticated",session:identity});
 const result:any=await x.gateway.scopedCoreGet("/v1/financial-reconciliation","https://ui.example.test/api/financial-reconciliation",["financials.view","orders.view_financials"],projectCoreCustomerRead);
 assert.equal(result.body.orders[0].gross_amount,0);assert.equal(result.body.orders[0].customer_email,undefined);
});
test("chargeback financial scope rejects read-only roles, expired membership and conflicting tenant hints",()=>{
 const url="https://ui.example.test/api/chargebacks";
 assert.equal(authorizedDetailedFinancialOrganization(session(),url),null);
 const privileged={...session(),effectivePermissions:[...session().effectivePermissions,"orders.view_financials"]};
 assert.equal(authorizedDetailedFinancialOrganization(privileged,url),"stem");
 assert.equal(authorizedDetailedFinancialOrganization(privileged,url+"?workspace_id=stem&workspace_id=foreign"),null);
 assert.equal(authorizedDetailedFinancialOrganization({...privileged,membership:{...privileged.membership!,effectiveUntil:"2020-01-02T00:00:00Z"}},url),null);
});
