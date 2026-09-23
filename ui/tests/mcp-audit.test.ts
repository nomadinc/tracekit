import assert from "node:assert/strict";
import test from "node:test";
import { recordMcpToolAudit } from "../lib/mcp/audit";
import { resolveEffectivePermissions } from "../lib/identity/persistent-authorization";
import type { PersistentMembership, TraceKitSessionContext } from "../lib/identity/persistent-types";

const membership: PersistentMembership={id:"mem",userId:"usr",accountId:"acct",organizationId:"org-a",role:"organization-admin",status:"active"};
const session: TraceKitSessionContext={user:{id:"usr",workosUserId:"w",primaryEmail:"owner@example.test",displayName:"Owner",avatarUrl:null,status:"active"},externalWorkosUserId:"w",activeAccount:{id:"acct",accountType:"client",name:"A",status:"active"},activeAgency:null,activeOrganization:{id:"org-a",name:"A",mark:"A",accountId:"acct"},availableOrganizations:[{id:"org-a",name:"A",mark:"A",accountId:"acct"}],membership,role:membership.role,effectivePermissions:Array.from(resolveEffectivePermissions(membership,[])),permissionOverrides:[],accessibleBusinessContexts:[],activeBusinessContextId:null,assurance:{authenticationMethod:"password",impersonated:false},correlationId:"corr-1"};

test("MCP audit records actor, scope, permission, result and correlation",async()=>{
 let event:any=null;
 await recordMcpToolAudit({repository:{recordAuditEvent:async(value)=>{event=value;}},session,tool:"get_customer",result:"success",permission:"customers.view",targetType:"customer",targetId:"cust-1",metadata:{resultCount:1}});
 assert.equal(event.action,"mcp.tool.get_customer");
 assert.equal(event.actorUserId,"usr"); assert.equal(event.organizationId,"org-a");
 assert.equal(event.permissionEvaluated,"customers.view"); assert.equal(event.result,"success");
 assert.equal(event.correlationId,"corr-1"); assert.equal(event.metadata.toolVersion,1);
});
test("MCP audit supports denied and failure outcomes",async()=>{
 const results:string[]=[];
 const repository={recordAuditEvent:async(value:any)=>{results.push(value.result);}};
 await recordMcpToolAudit({repository,session,tool:"list_orders",result:"denied",permission:"orders.view"});
 await recordMcpToolAudit({repository,session,tool:"list_orders",result:"failure",permission:"orders.view"});
 assert.deepEqual(results,["denied","failure"]);
});
