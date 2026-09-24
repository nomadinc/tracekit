import assert from "node:assert/strict";
import test from "node:test";
import { TraceKitMcpReadService } from "../lib/mcp/read-service";
import { resolveEffectivePermissions } from "../lib/identity/persistent-authorization";
import type { PersistentMembership, TraceKitSessionContext } from "../lib/identity/persistent-types";

function session(role:"organization-admin"|"client-read-only"|"read-only-operations"="organization-admin"):TraceKitSessionContext{
 const membership:PersistentMembership={id:"m",userId:"u",accountId:"a",organizationId:"org-a",role,status:"active"};
 return {user:{id:"u",workosUserId:"w",primaryEmail:"owner@example.test",displayName:"Owner",avatarUrl:null,status:"active"},externalWorkosUserId:"w",activeAccount:{id:"a",accountType:"client",name:"A",status:"active"},activeAgency:null,activeOrganization:{id:"org-a",name:"A",mark:"A",accountId:"a"},availableOrganizations:[{id:"org-a",name:"A",mark:"A",accountId:"a"}],membership,role,effectivePermissions:Array.from(resolveEffectivePermissions(membership,[])),permissionOverrides:[],accessibleBusinessContexts:[],activeBusinessContextId:null,assurance:{authenticationMethod:"password",impersonated:false},correlationId:"corr"};
}
const customer:any={id:"c",organizationId:"org-a",offerIds:[],name:"Person",email:"person@example.test",phone:"555",sensitiveMasked:false,profit:0,profitStatus:"Estimated",lastActivity:"now",status:"Known",trackingHealth:"Unknown",repeat:false,refunded:false,interferenceLikely:false,journeyPreview:""};
const order:any={id:"o",organizationId:"org-a",offerId:"",customerId:"c",number:"1",customerName:"Person",customerEmail:"person@example.test",customerPhone:"555",sensitiveMasked:false,scenario:"",date:"",status:"Paid",profitStatus:"Estimated",profit:10,revenue:100,trackingHealth:"Unknown",shippingLoss:false,highFee:false,highAffiliate:false};

function repositories(){
 const audits:any[]=[];
 return {audits,repos:{
  customers:{listCustomers:async()=>[customer],loadWorkspace:async()=>null,search:async()=>[{id:"c",type:"customer",title:"Person",subtitle:"Customer",value:"c",href:"/"}]},
  orders:{listOrders:async()=>[order],loadWorkspace:async()=>null,search:async()=>[{id:"order:o",type:"Order",title:"1",subtitle:"Person",value:"o",href:"/"}]},
  audit:{recordAuditEvent:async(e:any)=>{audits.push(e);}},
 }};
}
test("M2 list tools are bounded, projected and audited",async()=>{
 const x=repositories(); const svc=new TraceKitMcpReadService(session("client-read-only"),x.repos as any);
 const customers=await svc.listCustomers({limit:500}); const orders=await svc.listOrders({limit:500});
 assert.equal(customers[0].email,"••••"); assert.equal(orders[0].customerEmail,"••••");
 assert.equal(x.audits.length,2); assert.ok(x.audits.every(e=>e.result==="success"));
});
test("M2 permission denial is audited without repository access",async()=>{
 const x=repositories(); let called=false; x.repos.customers.listCustomers=async()=>{called=true;return [customer];};
 const svc=new TraceKitMcpReadService(session("read-only-operations"),x.repos as any);
 await assert.rejects(()=>svc.listCustomers(),/unavailable/); assert.equal(called,false);
 assert.equal(x.audits.at(-1).result,"denied");
});
test("M2 search exposes only entity classes the principal can view",async()=>{
 const x=repositories(); const svc=new TraceKitMcpReadService(session("client-read-only"),x.repos as any);
 const rows=await svc.search("Person");
 assert.deepEqual(rows.map(r=>r.type).sort(),["customer","order"]);
 const y=repositories(); const restricted=new TraceKitMcpReadService(session("read-only-operations"),y.repos as any);
 assert.deepEqual(await restricted.search("Person"),[]);
});
