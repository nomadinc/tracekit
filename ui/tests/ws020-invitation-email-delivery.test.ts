import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { completeInvitationDelivery, InvitationProviderRejected, type DeliveryClaim } from "../lib/identity/invitation-email-delivery";
const claim: DeliveryClaim = { ok:true,id:"canonical",email:"customer@example.test",expiresAt:new Date(Date.now()+86400000).toISOString(),state:"sending",claimed:true,attemptId:"lease" };
test("successful provider send is durably settled without exposing provider tokens or granting membership",async()=>{
 let calls=0;let saved:any;
 const result=await completeInvitationDelivery(claim,async(email)=>{calls++;return {id:"invitation_provider",email,state:"pending",organizationId:null,token:"SECRET"} as any},async(p)=>{saved=p});
 assert.equal(calls,1);assert.equal(saved.p_provider_id,"invitation_provider");assert.equal(result.sendAccepted,true);assert.equal(JSON.stringify(result).includes("SECRET"),false);assert.equal(result.mailboxDelivery,"unconfirmed");
});
test("already claimed, sent or ambiguous attempts never make another provider request",async()=>{
 for(const state of ["sending","sent","unknown"] as const){let calls=0;await completeInvitationDelivery({...claim,claimed:false,state},async()=>{calls++;throw Error()},async()=>{throw Error()});assert.equal(calls,0)}
});
test("known rejection is retryable but network/provider uncertainty remains ambiguous",async()=>{
 for(const [error,state] of [[new InvitationProviderRejected(),"failed"],[Error("timeout with SECRET"),"unknown"]] as const){let saved:any;const result=await completeInvitationDelivery(claim,async()=>{throw error},async(p)=>{saved=p});assert.equal(result.state,state);assert.equal(saved.p_state,state);assert.equal(JSON.stringify(saved).includes("SECRET"),false)}
});
test("lost persistence acknowledgement does not report a successful delivery or resend",async()=>{
 const result=await completeInvitationDelivery(claim,async email=>({id:"invitation_x",email,state:"pending",organizationId:null}),async()=>{throw Error("DB timeout")});assert.equal(result.state,"unknown");assert.equal(result.sendAccepted,false);
});
test("provider result with foreign email or organization grant fails closed",async()=>{
 for(const result of [{id:"invitation_x",email:"foreign@example.test",state:"pending",organizationId:null},{id:"invitation_x",email:claim.email,state:"pending",organizationId:"foreign"}] as any[]){let saved:any;await completeInvitationDelivery(claim,async()=>result,async(p)=>{saved=p});assert.equal(saved.p_state,"unknown")}
});
test("no-membership landing provides verified-email discovery outside the membership shell",()=>{
 const page=readFileSync(new URL("../app/invitations/page.tsx",import.meta.url),"utf8");
 assert.ok(page.includes("resolveAuthenticatedPersistentIdentity"));assert.ok(page.indexOf("!identity.emailVerified")<page.indexOf("pendingInvitationsForVerifiedEmail"));assert.ok(!page.includes("resolveApplicationSession"));
 const shell=readFileSync(new URL("../components/identity/authenticated-app-shell.tsx",import.meta.url),"utf8");assert.ok(shell.includes('href="/invitations"'));
 const route=readFileSync(new URL("../app/api/invitations/route.ts",import.meta.url),"utf8");assert.ok(route.indexOf('body.operation === "accept"')<route.indexOf("resolveApplicationSession();"));assert.ok(route.includes("identity.emailVerified"));
 const sender=readFileSync(new URL("../lib/identity/workos-invitation-delivery.ts",import.meta.url),"utf8");assert.ok(sender.includes("sendInvitation({ email, expiresInDays })"));assert.ok(!sender.includes("organizationId:"));assert.ok(!sender.includes("roleSlug:"));
});
