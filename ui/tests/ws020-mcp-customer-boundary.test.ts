import assert from "node:assert/strict";
import test from "node:test";
import { TraceKitMcpReadService } from "../lib/mcp/read-service";
import { mcpCustomerRepository } from "../lib/mcp/customer-repository";
import { resolveEffectivePermissions } from "../lib/identity/persistent-authorization";
import { authorizeMcpRead } from "../lib/mcp/governed-read-service";
import type { TraceKitSessionContext, PersistentMembership } from "../lib/identity/persistent-types";

function session(): TraceKitSessionContext {
 const membership: PersistentMembership = { id:"m", userId:"u", accountId:"a", organizationId:"stem", role:"client-read-only", status:"active", effectiveFrom:"2020-01-01T00:00:00Z" };
 return { user:{id:"u",workosUserId:"w",primaryEmail:"customer@example.test",displayName:"Customer",avatarUrl:null,status:"active"}, externalWorkosUserId:"w",activeAccount:{id:"a",accountType:"client",name:"Stem",status:"active"},activeAgency:null,activeOrganization:{id:"stem",name:"Stem",mark:"S",accountId:"a"},availableOrganizations:[{id:"stem",name:"Stem",mark:"S",accountId:"a"}],membership,role:membership.role,effectivePermissions:[...resolveEffectivePermissions(membership,[])],permissionOverrides:[],accessibleBusinessContexts:[],activeBusinessContextId:null,assurance:{authenticationMethod:"password",impersonated:false},correlationId:"test" };
}
function service(identity = session()) {
 const audit: any[] = [];let calls = 0;
 const customer:any={id:"c",organizationId:"stem",email:"private@example.test",phone:"15551234567",name:"Customer",profit:9};
 const snapshot:any={customer,lifetimeRevenue:12,orders:[{id:"o",amount:12,profit:9}],journey:[{name:"Purchase $12.00",originalUrl:"https://example.test/?phone=15551234567",identifiers:[{type:"phone",value:"15551234567"}],explanation:{conclusion:"Email private@example.test paid 12.00 USD"}}]};
 const repositories:any={customers:{loadWorkspace:async(scope:any,id:string)=>{calls++;assert.equal(scope.organizationId,"stem");assert.equal(scope.workspaceId,"stem");return id==="foreign"?null:snapshot;}},audit:{recordAuditEvent:async(event:any)=>audit.push(event)}};
 return { instance:new TraceKitMcpReadService(identity,repositories),audit,calls:()=>calls };
}
test("client-read-only MCP customer serialization removes detailed money and nested contact evidence",async()=>{
 const x=service();const value:any=await x.instance.getCustomer("c");
 assert.equal(value.financialDetailsAvailable,false);
 assert.equal(value.lifetimeRevenue,undefined);assert.equal(value.orders[0].amount,undefined);
 assert.equal(value.orders[0].profit,undefined);assert.equal(value.customer.email,"••••");
 assert.equal(value.journey[0].originalUrl,undefined);assert.equal(value.journey[0].identifiers,undefined);
 const serialized=JSON.stringify(value);assert.ok(!serialized.includes("private@example.test"));assert.ok(!serialized.includes("15551234567"));assert.ok(!serialized.includes("12.00"));
 assert.equal(x.audit.at(-1).result,"success");
 assert.equal(await x.instance.getCustomer("foreign"),null);
});
test("expired membership and missing permission deny before customer persistence",async()=>{
 for(const identity of [{...session(),effectivePermissions:[]},{...session(),membership:{...session().membership,effectiveUntil:"2000-01-01T00:00:00Z"}}]){
  const x=service(identity);await assert.rejects(()=>x.instance.getCustomer("c"),/unavailable/);assert.equal(x.calls(),0);assert.equal(x.audit.at(-1).result,"denied");
 }
 assert.throws(()=>authorizeMcpRead(session(),"customers.view","foreign"),/unavailable/);
});
test("server MCP repository scopes Core to authorized organization and fails closed before fetch without it",async()=>{
 const previousFetch=globalThis.fetch;const previousSecret=process.env.TK_SECRET_KEY;const previousBase=process.env.TRACEKIT_API_BASE_URL;const previousAdmin=process.env.TRACEKIT_TK_SECRET;
 const requests:string[]=[];
 process.env.TK_SECRET_KEY="synthetic-local-test";process.env.TRACEKIT_TK_SECRET="synthetic-local-test";process.env.TRACEKIT_API_BASE_URL="https://core.example.test";
 globalThis.fetch=async(input:any)=>{requests.push(String(input));return Response.json({customers:[]});};
 try{
  const scope:any={...authorizeMcpRead(session(),"customers.view"),workspaceId:"foreign"};
  await mcpCustomerRepository.listCustomers(scope);
  assert.equal(new URL(requests[0]).searchParams.get("workspace_id"),"stem");
  await assert.rejects(()=>mcpCustomerRepository.listCustomers({...scope,organizationId:null}),/scope_unavailable/);assert.equal(requests.length,1);
  globalThis.fetch=async()=>{throw Object.assign(new Error("private transport detail"),{cause:{code:"ENOTFOUND"}});};
  await assert.rejects(()=>mcpCustomerRepository.listCustomers(scope),/^Error: mcp_customer_repository_core_dns_failed$/);
 }finally{
  globalThis.fetch=previousFetch;
  for(const [key,value]of Object.entries({TK_SECRET_KEY:previousSecret,TRACEKIT_API_BASE_URL:previousBase,TRACEKIT_TK_SECRET:previousAdmin}))if(value===undefined)delete process.env[key];else process.env[key]=value;
 }
});
