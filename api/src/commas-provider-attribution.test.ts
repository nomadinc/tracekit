import test from "node:test";
import assert from "node:assert/strict";
import { compareCommasAttributionToEverflow, isValidCommasPublicTransactionId, normalizeCommasAdditionalParams, normalizeCommasAttributionEvent } from "./commas-provider-attribution.ts";
import { hmacSha256Hex, verifyCommasWebhookSignature } from "./commas-dispute-webhook.ts";

test("purchase attribution preserves aliases independently and validates ORD identity", () => {
  const event=normalizeCommasAttributionEvent({id:"evt-1",type:"product.purchased",created_at:"2026-09-03T00:00:00Z",payment_id:"ORD-Abc_123",additional_params:{affid:"42",sub1:"a",sub4:"d",_ef_transaction_id:"ef-1",transaction_id:"ef-1",tid:"ef-1",c1:"ef-1",unknown_key:"kept-in-evidence",api_token:"restricted"}})!;
  assert.equal(event.paymentIdentityState,"valid");
  assert.equal(event.parameters.aliasState,"all_agree");
  assert.equal(event.parameters.affiliateId,"42");
  assert.deepEqual(event.parameters.restrictedMetadata.unknown_param_keys,["unknown_key"]);
  assert.equal(event.parameters.restrictedMetadata.secret_like_keys_present,true);
  assert.equal(isValidCommasPublicTransactionId("ORD-Abc_123"),true);
  assert.equal(isValidCommasPublicTransactionId("123"),false);
});

test("purchase and subscription events remain behind the existing raw-body signature gate",async()=>{
  for(const type of ["product.purchased","subscription.created"]){const raw=new TextEncoder().encode(JSON.stringify({id:`evt-${type}`,type}));const signature=await hmacSha256Hex("secret",raw);assert.equal(await verifyCommasWebhookSignature(raw,signature,"secret"),true);assert.equal(await verifyCommasWebhookSignature(raw,signature,"wrong"),false)}
});

test("conflicting aliases remain separate and never pick a winner", () => {
  const parameters=normalizeCommasAdditionalParams({_ef_transaction_id:"ef-1",transaction_id:"ef-2",tid:"ef-3",c1:"creative"});
  assert.equal(parameters.aliasState,"conflict");
  assert.equal(parameters.efTransactionId,"ef-1");
  assert.equal(parameters.transactionId,"ef-2");
  assert.equal(compareCommasAttributionToEverflow(parameters,{transactionId:"ef-1"}).state,"no_commas_tid");
});

test("single aliases and malformed oversized fields fail bounded normalization", () => {
  const parameters=normalizeCommasAdditionalParams({tid:"ef-only",affid:"x".repeat(257)});
  assert.equal(parameters.aliasState,"single_alias");
  assert.equal(parameters.affiliateId,null);
  assert.deepEqual(parameters.restrictedMetadata.rejected_normalized_keys,["affid"]);
});

test("subscription captures nested additional_params without inventing order inheritance", () => {
  const event=normalizeCommasAttributionEvent({id:"evt-sub",type:"subscription.created",subscription:{id:"sub-1",additional_params:{affid:"7",tid:"ef-sub"}}})!;
  assert.equal(event.subscriptionProviderId,"sub-1");
  assert.equal(event.paymentPublicTransactionId,null);
  assert.equal(event.parameters.affiliateId,"7");
});

test("api_metadata is never treated as checkout attribution", () => {
  const event=normalizeCommasAttributionEvent({id:"evt-2",type:"product.purchased",payment_id:"ORD-1",api_metadata:{affid:"wrong"},additional_params:{}})!;
  assert.equal(event.parameters.affiliateId,null);
  assert.equal(normalizeCommasAttributionEvent({id:"evt-x",type:"payment.succeeded"}),null);
});

test("Everflow comparison is shadow-only and classifies exact and conflict", () => {
  const p=normalizeCommasAdditionalParams({_ef_transaction_id:"ef-1",affid:"12",sub1:"a",sub4:"b"});
  assert.equal(compareCommasAttributionToEverflow(p,{transactionId:"ef-1",affiliateId:"12",sub1:"a",sub4:"b"}).state,"exact_match");
  assert.equal(compareCommasAttributionToEverflow(p,{transactionId:"ef-1",affiliateId:"99",sub1:"a",sub4:"b"}).state,"conflict");
});

test("migration is additive, service-role-only, shadow-only, and leaves attribution credits untouched", async () => {
  const sql=await (await import("node:fs/promises")).readFile(new URL("../../supabase/migrations/20260903002350_commas_provider_observed_attribution_foundation.sql",import.meta.url),"utf8");
  assert.match(sql,/commerce_provider_attribution_observations/);
  assert.match(sql,/commas_public_transaction/);
  assert.match(sql,/security invoker/i);
  assert.match(sql,/enable row level security/i);
  assert.match(sql,/revoke all[\s\S]*anon,authenticated,authenticator/i);
  assert.doesNotMatch(sql,/insert into public\.journey_attribution_credits|update public\.platform_orders|delete from|truncate/i);
  assert.match(sql,/source_object_type in \('transaction_page','transaction'\)/);
  assert.match(sql,/p_dry_run/);
});

test("runtime persists immutable Evidence before invoking the observation projection",async()=>{
  const source=await (await import("node:fs/promises")).readFile(new URL("./index.ts",import.meta.url),"utf8");
  const handler=source.slice(source.indexOf("async function handleCommasAttributionWebhookPayload"),source.indexOf("function parseYmd"));
  assert.ok(handler.indexOf('.from("commerce_evidence_records").insert')<handler.indexOf('.rpc("record_commas_provider_attribution_observation_v1"'));
  assert.ok(handler.indexOf('.from("commerce_evidence_records").insert')<handler.indexOf("normalizeCommasAttributionEvent(payload)"));
  assert.doesNotMatch(handler,/journey_attribution_credits/);
  assert.doesNotMatch(handler,/api_metadata/);
});
