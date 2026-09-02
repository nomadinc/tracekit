import assert from "node:assert/strict";
import test from "node:test";
import { characterizeNext29WebhookSignature, evaluateNext29ActivationReadiness, NEXT29_REQUIRED_MIGRATIONS } from "./connectors/next29/activation-readiness.ts";

const verification:any={status:"connected",apiVersion:"2024-04-01",capabilities:[],providerRequestIdPresent:true,rateLimitObserved:true,resourceChecks:{orders:true,subscriptions:true,disputes:true}};
function ready(overrides:any={}) { return {environment:"staging",migrationsApplied:[...NEXT29_REQUIRED_MIGRATIONS],connectionVerification:verification,boundedLiveReads:{orders:true,subscriptions:true,disputes:true},canonicalReconciliation:{evidenceWritten:true,orderObserved:true,subscriptionObserved:true,disputeObserved:true},webhookSignatureProof:{verified:true,serialization:"raw_bytes"},schedulesEnabled:false,externalDispatcherEnabled:false,liveWebhookRegistered:false,...overrides}; }

async function sign(body:Uint8Array,secret:string){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const digest=new Uint8Array(await crypto.subtle.sign("HMAC",key,body as BufferSource));return Array.from(digest,b=>b.toString(16).padStart(2,"0")).join("");}

test("29Next activation readiness passes only with complete live proof",()=>{const result=evaluateNext29ActivationReadiness(ready());assert.equal(result.readyForProductionActivation,true);assert.deepEqual(result.blockers,[]);});

test("29Next activation readiness fails closed on missing migration or live proof",()=>{const result=evaluateNext29ActivationReadiness(ready({migrationsApplied:NEXT29_REQUIRED_MIGRATIONS.slice(1),boundedLiveReads:{orders:true,subscriptions:false,disputes:true}}));assert.equal(result.readyForProductionActivation,false);assert.ok(result.blockers.some(x=>x.startsWith("missing_migration:")));assert.ok(result.blockers.includes("subscriptions_live_read_unproven"));});

test("29Next activation readiness blocks premature production execution",()=>{const result=evaluateNext29ActivationReadiness(ready({environment:"production",schedulesEnabled:true,externalDispatcherEnabled:true,liveWebhookRegistered:true}));assert.equal(result.readyForProductionActivation,false);assert.ok(result.blockers.includes("production_schedule_already_enabled"));assert.ok(result.blockers.includes("production_dispatcher_already_enabled"));assert.ok(result.blockers.includes("production_webhook_already_registered"));});

test("29Next activation readiness allows missing rare samples as warnings not fabricated proof",()=>{const result=evaluateNext29ActivationReadiness(ready({canonicalReconciliation:{evidenceWritten:true,orderObserved:true,subscriptionObserved:false,disputeObserved:false}}));assert.equal(result.readyForProductionActivation,true);assert.deepEqual(result.warnings.sort(),["dispute_reconciliation_no_sample","subscription_reconciliation_no_sample"]);});

test("29Next webhook characterization identifies exact raw-byte signatures",async()=>{const raw=new TextEncoder().encode('{"event_id":"e1", "event_type":"order.created"}');const signature=await sign(raw,"secret");assert.deepEqual(await characterizeNext29WebhookSignature({rawBody:raw,signature,signingSecret:"secret"}),{verified:true,serialization:"raw_bytes"});});

test("29Next webhook characterization identifies documented JSON reserialization when bytes differ",async()=>{const raw=new TextEncoder().encode('{"event_id":"e1", "event_type":"order.created"}');const canonical=new TextEncoder().encode(JSON.stringify(JSON.parse(new TextDecoder().decode(raw))));const signature=await sign(canonical,"secret");const result=await characterizeNext29WebhookSignature({rawBody:raw,signature,signingSecret:"secret"});assert.deepEqual(result,{verified:true,serialization:"json_reserialized"});});
