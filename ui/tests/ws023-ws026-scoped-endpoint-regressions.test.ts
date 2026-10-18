import assert from "node:assert/strict";
import test from "node:test";
import { createScopedCoreProxy } from "../lib/identity/scoped-core-runtime";
import { projectCoreCustomerRead } from "../lib/identity/core-read-projection";
import { resolveEffectivePermissions } from "../lib/identity/persistent-authorization";
import type { TraceKitSessionContext } from "../lib/identity/persistent-types";

function session(role: "client-read-only" | "organization-owner" = "client-read-only"): TraceKitSessionContext {
  const membership: any = {id:"member",userId:"user",accountId:"account",organizationId:"org-a",role,status:"active",effectiveFrom:"2020-01-01T00:00:00Z"};
  return {user:{id:"user",status:"active"},membership,activeOrganization:{id:"org-a",name:"Org A"},
    availableOrganizations:[{id:"org-a",name:"Org A"}],activeAccount:{id:"account"},
    effectivePermissions:[...resolveEffectivePermissions(membership,[])]} as TraceKitSessionContext;
}
function gateway(identity: TraceKitSessionContext | null, responder?: (url:string)=>Response) {
  const calls: string[] = [];
  const proxy = createScopedCoreProxy({
    resolveSession:async()=>identity?{kind:"authenticated",session:identity}:{kind:"unauthenticated"},
    apiBaseUrl:()=> "https://core.example.test",adminSecret:()=> "synthetic-test-secret",
    fetch: (async (url:RequestInfo | URL) => {
      calls.push(String(url));
      return responder ? responder(String(url)) : Response.json({customers:[],orders:[]});
    }) as typeof fetch,
  });
  return {proxy,calls};
}

test("customer list and detail reads derive tenant from authenticated session", async () => {
  const x=gateway(session());
  for(const path of ["/v1/customers","/v1/customers/customer-a","/v1/customers/customer-a/journeys/journey-a"]) {
    const result=await x.proxy.scopedCoreGet(path,"https://ui.example.test/api/customers?cursor=next","customers.view",projectCoreCustomerRead);
    assert.equal(result.status,200);
  }
  assert.equal(x.calls.length,3);
  for(const call of x.calls) {
    const url=new URL(call);
    assert.equal(url.searchParams.get("workspace_id"),"org-a");
    assert.equal(url.searchParams.get("cursor"),"next");
  }
});

test("unauthenticated and conflicting foreign tenant hints deny before Core transport",async()=>{
  const unauth=gateway(null);
  assert.equal((await unauth.proxy.scopedCoreGet("/v1/customers","https://ui.example.test/api/customers","customers.view")).status,404);
  assert.equal(unauth.calls.length,0);
  for(const path of ["/v1/customers/foreign-customer","/v1/customer-orders","/v1/customers/customer-a/journeys/foreign-journey"]) {
    const x=gateway(session());
    const r=await x.proxy.scopedCoreGet(path,"https://ui.example.test/api/customers?workspace_id=org-b","customers.view");
    assert.equal(r.status,404);
    assert.equal(x.calls.length,0);
  }
});

test("client-read-only may read customer and order scopes but not detailed financial scope",async()=>{
  const identity=session();
  const x=gateway(identity);
  assert.ok(identity.effectivePermissions.includes("customers.view"));
  assert.ok(identity.effectivePermissions.includes("orders.view"));
  assert.equal((await x.proxy.scopedCoreGet("/v1/customers","https://ui.example.test/api/customers","customers.view")).status,200);
  assert.equal((await x.proxy.scopedCoreGet("/v1/customer-orders","https://ui.example.test/api/customer-orders","orders.view")).status,200);
  assert.equal((await x.proxy.scopedCoreGet("/v1/customer-orders","https://ui.example.test/api/customer-orders",["orders.view_financials","financials.view"])).status,404);
  assert.equal(x.calls.length,2);
});

test("ordinary financials.view does not authorize detailed financial values",async()=>{
  const identity=session();
  const x=gateway(identity,()=>Response.json({gross_amount:0,email:"private@example.test",raw_json:{secret:"raw"}}));
  const aggregate=await x.proxy.scopedCoreGet("/v1/customers/customer-a","https://ui.example.test/api/customers/customer-a","customers.view",projectCoreCustomerRead);
  assert.equal(aggregate.status,200);
  assert.deepEqual(aggregate.body,{});
  const owner=gateway(session("organization-owner"),()=>Response.json({gross_amount:0,email:"private@example.test",raw_json:{secret:"raw"}}));
  const detailed=await owner.proxy.scopedCoreGet("/v1/customers/customer-a","https://ui.example.test/api/customers/customer-a",["orders.view_financials","financials.view"],projectCoreCustomerRead);
  assert.equal(detailed.status,200);
  assert.deepEqual(detailed.body,{gross_amount:0,email:"private@example.test"});
});

test("foreign object IDs without foreign tenant hints require authoritative Core object-level denial",async()=>{
  // A scoped proxy can enforce session organization, but cannot prove the opaque object ID belongs to it.
  const x=gateway(session(),()=>Response.json({customer:{id:"foreign-customer"}}));
  const result=await x.proxy.scopedCoreGet("/v1/customers/foreign-customer","https://ui.example.test/api/customers/foreign-customer","customers.view",projectCoreCustomerRead);
  assert.equal(result.status,200);
  assert.equal(x.calls.length,1);
  // This is a documented acceptance gap, not a passing cross-tenant object authorization test.
});
