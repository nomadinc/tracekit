import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { BadRequestException, ConflictException, OauthException } from "@workos-inc/node";
import { completeInvitationDelivery, InvitationProviderRejected, type DeliveryClaim } from "../lib/identity/invitation-email-delivery";

const context={invitationId:"111c37b1-5ba9-4b60-ac4b-99baaafb3fe7",attemptId:"222c37b1-5ba9-4b60-ac4b-99baaafb3fe7"};
const requestID="request_01KZ1RW7BEJ57BNJNPP5JRQD7G";
function sender(error?:unknown, success=false, brokenLog=false){
 const logs:any[]=[];const requests:any[]=[];
 const mod={exports:{} as any};
 const source=readFileSync(new URL("../lib/identity/workos-invitation-delivery.ts",import.meta.url),"utf8");
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 new Function("require","module","exports","console",code)((name:string)=>{
  if(name==="server-only")return {};
  if(name==="@workos-inc/authkit-nextjs")return {getWorkOS:()=>({userManagement:{sendInvitation:async(input:any)=>{requests.push(input);if(!success)throw error;return {id:"invitation_fixture",email:input.email,state:"pending",organizationId:null}}}})};
  if(name==="./invitation-email-delivery")return {InvitationProviderRejected};
  throw Error(`Unexpected import ${name}`);
 },mod,mod.exports,{warn:(...args:any[])=>{if(brokenLog)throw Error("log unavailable");logs.push(args)}});
 return {...mod.exports,logs,requests};
}
test("extracts only integer failure HTTP status without coercion",()=>{
 const x=sender();for(const status of [400,401,403,404,409,422,429,500,599])assert.equal(x.workOSInvitationDiagnostic({status}).httpStatus,status);
 for(const status of ["400",200,600,399,NaN,Infinity,{},null])assert.equal(x.workOSInvitationDiagnostic({status}).httpStatus,undefined);
});
test("provider code uses finite vocabulary; arbitrary strings never enter logs",()=>{
 const x=sender();for(const code of ["user_already_exists","invitation_already_exists","invalid_request"])assert.equal(x.workOSInvitationDiagnostic({code}).providerCode,code);
 for(const code of ["sk_test_sensitive","customer@example.test","unknown_slug","bad\nlog","x".repeat(4096)]){assert.equal(x.workOSInvitationDiagnostic({code}).providerCode,"unrecognized");assert.ok(!JSON.stringify(x.workOSInvitationDiagnostic({code})).includes(code))}
 for(const code of [null,{},12])assert.equal(x.workOSInvitationDiagnostic({code}).providerCode,undefined);
});
test("accepts bounded provider request-ID formats, rejects URLs tokens and control characters",()=>{
 const x=sender();for(const field of ["requestID","requestId"])assert.equal(x.workOSInvitationDiagnostic({[field]:requestID}).providerRequestId,requestID);
 assert.equal(x.workOSInvitationDiagnostic({requestID:context.attemptId}).providerRequestId,context.attemptId);
 for(const requestID of ["https://example.test/token", "sk_test_private", "request_"+"A".repeat(100),"req_secret\nlog",{},42])assert.equal(x.workOSInvitationDiagnostic({requestID}).providerRequestId,undefined);
});
test("malformed errors, inherited properties, getters and hostile proxies fail safely",()=>{
 const x=sender();for(const error of [undefined,null,5,"private text",[],Object.create({status:400,code:"user_already_exists"}),new Proxy({},{getOwnPropertyDescriptor(){throw Error("private")}})])assert.deepEqual(x.workOSInvitationDiagnostic(error),{operation:"workos.invitation.send"});
 const error=Object.defineProperties({}, {status:{get(){throw Error("must not run")}},code:{get(){throw Error("must not run")}},requestID:{get(){throw Error("must not run")}}});
 assert.deepEqual(x.workOSInvitationDiagnostic(error),{operation:"workos.invitation.send"});
});
test("actual sender logs only safe metadata plus validated existing correlation context",async()=>{
 const error={status:400,code:"user_already_exists",requestID,message:"SECRET_EMAIL customer@example.test",rawData:{token:"SECRET_TOKEN"},headers:{authorization:"SECRET_KEY"},cookie:"SECRET_COOKIE",toJSON(){throw Error("must not serialize")}};
 const x=sender(error);await assert.rejects(x.sendWorkOSInvitation("customer@example.test",7,context),InvitationProviderRejected);
 assert.deepEqual(x.requests,[{email:"customer@example.test",expiresInDays:7}]);
 assert.deepEqual(x.logs,[["workos_invitation_delivery_failed",{operation:"workos.invitation.send",httpStatus:400,providerCode:"user_already_exists",providerRequestId:requestID,...context}]]);
 assert.doesNotMatch(JSON.stringify(x.logs),/SECRET|customer@example|authorization|rawData|cookie/);
 assert.deepEqual(x.workOSInvitationDiagnostic({}, {invitationId:"private@example.test",attemptId:"token"}),{operation:"workos.invitation.send"});
});
test("missing metadata is logged as operation only and delivery remains unknown",async()=>{
 const x=sender(null);await assert.rejects(x.sendWorkOSInvitation("customer@example.test",7),/outcome unknown/);
 assert.deepEqual(x.logs,[["workos_invitation_delivery_failed",{operation:"workos.invitation.send"}]]);
});
const claim:DeliveryClaim={ok:true,id:context.invitationId,email:"customer@example.test",expiresAt:new Date(Date.now()+86400000).toISOString(),state:"sending",claimed:true,attemptId:context.attemptId};
test("real sender and coordinator preserve failed/unknown and never expose diagnostics to client/persistence",async()=>{
 for(const [status,state] of [[400,"failed"],[401,"failed"],[403,"failed"],[404,"failed"],[422,"failed"],[429,"failed"],[409,"unknown"],[500,"unknown"],[undefined,"unknown"]] as const){
  const x=sender({status,code:"user_already_exists",requestID});let saved:any;
  const result=await completeInvitationDelivery(claim,x.sendWorkOSInvitation,async(p)=>{saved=p});
  assert.equal(result.state,state);assert.equal(result.sendAccepted,false);assert.equal(result.mailboxDelivery,"unconfirmed");assert.equal(saved.p_state,state);assert.equal(x.requests.length,1);
  assert.equal(x.logs[0][1].invitationId,claim.id);assert.equal(x.logs[0][1].attemptId,claim.attemptId);
  assert.doesNotMatch(JSON.stringify([result,saved]),/user_already_exists|request_01/);
 }
});
test("logger failure cannot replace original failed/unknown classification",async()=>{
 for(const status of [400,500]){const x=sender({status},false,true);const result=await completeInvitationDelivery(claim,x.sendWorkOSInvitation,async()=>{});assert.equal(result.state,status===400?"failed":"unknown")}
});
test("existing-user/duplicate rejection neither creates users nor retries; unclaimed delivery never calls provider",async()=>{
 for(const code of ["user_already_exists","invitation_already_exists"]){const x=sender({status:400,code});const r=await completeInvitationDelivery(claim,x.sendWorkOSInvitation,async()=>{});assert.equal(r.state,"failed");assert.equal(x.requests.length,1);assert.deepEqual(Object.keys(x.requests[0]).sort(),["email","expiresInDays"])}
 for(const state of ["failed","unknown","sending","sent"] as const){const x=sender();await completeInvitationDelivery({...claim,claimed:false,state},x.sendWorkOSInvitation,async()=>{});assert.equal(x.requests.length,0);assert.equal(x.logs.length,0)}
});
test("successful send unchanged; durable acknowledgement failure still prevents success",async()=>{
 const x=sender(undefined,true);const result=await completeInvitationDelivery(claim,x.sendWorkOSInvitation,async()=>{});assert.equal(result.state,"sent");assert.equal(result.mailboxDelivery,"unconfirmed");assert.equal(x.logs.length,0);
 const y=sender(undefined,true);assert.equal((await completeInvitationDelivery(claim,y.sendWorkOSInvitation,async()=>{throw Error()})).state,"unknown");
});
test("actual acceptance route retains verified-email authority and rejects browser verification overrides",async()=>{
 let identity:any={user:{id:context.invitationId,status:"active"},externalWorkosUserId:"fixture-subject",emailVerified:false};let calls=0;let parameters:any;
 class Repository {async customerInvitation(p:any){calls++;parameters=p;return {ok:false}}}
 const source=readFileSync(new URL("../app/api/invitations/route.ts",import.meta.url),"utf8");
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;const mod={exports:{} as any};
 const deps:Record<string,any>={
  "@/lib/identity/invitation-email-delivery":{completeInvitationDelivery},"@/lib/identity/workos-invitation-delivery":{sendWorkOSInvitation:()=>{throw Error("must not send")}},
  "node:crypto":{randomUUID:()=>context.attemptId},"next/server":{NextResponse:{json:(body:any,init:any)=>Response.json(body,init)}},
  "@/lib/identity/application-session":{resolveAuthenticatedPersistentIdentity:async()=>identity,resolveApplicationSession:()=>{throw Error("must not require membership for accept")}},
  "@/lib/identity/customer-invitation-policy":{},"@/lib/identity/invitation-target-access":{},"@/lib/identity/authorization-gateway":{},
  "@/lib/identity/supabase-identity-repository":{SupabaseIdentityTenancyRepository:Repository},"@/lib/identity/active-organization-cookie":{},"@/lib/identity/active-business-context-cookie":{},
 };
 new Function("require","module","exports",code)((name:string)=>{if(name in deps)return deps[name];throw Error(name)},mod,mod.exports);
 const request=(extra:any={})=>new Request("https://ui.example.test/api/invitations",{method:"POST",headers:{origin:"https://ui.example.test","content-type":"application/json"},body:JSON.stringify({operation:"accept",invitationId:context.invitationId,...extra})});
 assert.equal((await mod.exports.POST(request())).status,404);assert.equal(parameters.p_email_verified,false);assert.equal(calls,1);
 assert.equal((await mod.exports.POST(request({emailVerified:true}))).status,404);assert.equal(calls,1);
 identity={...identity,user:{...identity.user,status:"suspended"},emailVerified:true};assert.equal((await mod.exports.POST(request())).status,404);assert.equal(calls,1);
});

test("installed WorkOS SDK exceptions expose the validated fields used by the actual sender",async()=>{
 const x=sender(new BadRequestException({code:"user_already_exists",message:"private message",errors:[],requestID}));
 await assert.rejects(x.sendWorkOSInvitation("customer@example.test",7,context),InvitationProviderRejected);
 assert.equal(x.logs[0][1].httpStatus,400);assert.equal(x.logs[0][1].providerCode,"user_already_exists");assert.equal(x.logs[0][1].providerRequestId,requestID);
 const y=sender(new ConflictException({code:"invitation_already_exists",message:"private message",requestID}));
 assert.equal((await completeInvitationDelivery(claim,y.sendWorkOSInvitation,async()=>{})).state,"unknown");
});

test("SDK OAuth error field is treated as a code only through the same finite vocabulary",async()=>{
 const x=sender(new OauthException(400,requestID,"invalid_request","SECRET_DESCRIPTION",{token:"SECRET_TOKEN"}));
 await assert.rejects(x.sendWorkOSInvitation("customer@example.test",7,context),InvitationProviderRejected);
 assert.equal(x.logs[0][1].providerCode,"invalid_request");assert.doesNotMatch(JSON.stringify(x.logs),/SECRET|description|token/);
 assert.equal(x.workOSInvitationDiagnostic({error:"customer@example.test"}).providerCode,"unrecognized");
});
