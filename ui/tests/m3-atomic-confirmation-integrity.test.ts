import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261004063517_20261004060000_atomic_governed_action_confirmation.sql", import.meta.url),
  "utf8",
);
const repository = readFileSync(new URL("../lib/mcp/action-intent-repository.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("../lib/mcp/action-service.ts", import.meta.url), "utf8");
const shopifyResolver = readFileSync(
  new URL("../../supabase/migrations/20261002002800_m15_shopify_confirmation_resolver.sql", import.meta.url),
  "utf8",
);

test("M3 confirmation validity and insertion share one locked database transaction", () => {
  assert.match(migration, /create or replace function public\.confirm_mcp_action_intent_atomic/);
  assert.match(migration, /from public\.mcp_action_intents i[\s\S]*for update/);
  assert.match(migration, /for update;[\s\S]*v_now := clock_timestamp\(\)/);
  assert.match(migration, /v_intent\.expires_at <= v_now/);
  assert.match(migration, /insert into public\.mcp_action_confirmations/);
  assert.ok(
    migration.indexOf("for update") < migration.indexOf("insert into public.mcp_action_confirmations"),
  );
  assert.doesNotMatch(migration, /p_confirmed_at|p_expires_at|p_requested_at/);
});

test("M3 atomic confirmation binds tenant actor operation target and immutable plan identity", () => {
  for (const predicate of [
    "i.organization_id = p_organization_id",
    "i.actor_user_id = p_actor_user_id",
    "v_intent.operation is distinct from p_expected_operation",
    "v_intent.target_kind is distinct from p_expected_target_kind",
    "v_intent.plan_identity is distinct from v_expected_plan_identity",
  ]) assert.ok(migration.includes(predicate), predicate);
  assert.match(migration, /plan:\' \|\| \(v_intent\.plan->>\'recommendationId\'/);
  assert.match(migration, /provider-plan:\' \|\| v_intent\.operation/);
  for (const field of ["connectionId", "shopDomain", "callbackUrl", "topic", "subscriptionId", "eventType"])
    assert.ok(migration.includes(field), field);
});

test("M3 stale missing cross-tenant actor and contract mismatches all reject before insertion", () => {
  const insertAt = migration.indexOf("insert into public.mcp_action_confirmations");
  const guarded = migration.slice(0, insertAt);
  assert.match(guarded, /if not found/);
  assert.match(guarded, /return query select 'reject'::text/g);
  assert.ok((guarded.match(/return query select 'reject'::text/g) || []).length >= 6);
  assert.match(migration, /security definer[\s\S]*set search_path = public, pg_temp/);
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated, authenticator/);
  assert.match(migration, /grant execute on function[\s\S]*to service_role/);
  assert.match(migration, /revoke insert on table public\.mcp_action_confirmations from service_role/);
});

test("M3 replay is serialized and returns only the same still-valid confirmation", () => {
  assert.match(migration, /unique intent row lock serializes|row lock serializes/i);
  assert.match(migration, /where c\.intent_id = v_intent\.intent_id[\s\S]*c\.actor_user_id = p_actor_user_id/);
  assert.match(migration, /v_existing\.organization_id = p_organization_id[\s\S]*v_existing\.expires_at > v_now/);
  assert.match(migration, /'replay_same_confirmation'/);
  assert.match(migration, /least\(v_now \+ interval '5 minutes', v_intent\.expires_at\)/);
});

test("M3 all confirmation paths use the shared RPC with operation-specific target contracts", () => {
  assert.match(repository, /rpc\/confirm_mcp_action_intent_atomic/);
  assert.doesNotMatch(repository, /rest\/v1\/mcp_action_confirmations/);
  assert.doesNotMatch(repository, /confirmedAt:string;expiresAt:string/);
  for (const contract of [
    'expectedOperation:"inspect_evidence"',
    'expectedOperation:"commas.webhook_test_delivery"',
    'expectedTargetKind:"commas_webhook_subscription"',
    'expectedOperation:"shopify.controlled_webhook_create_delete_proof"',
    'expectedTargetKind:"shopify_webhook_subscription"',
  ]) assert.ok(service.replace(/\s+/g, "").includes(contract), contract);
});

test("M3 failed confirmation cannot create authorization or access a provider", () => {
  assert.doesNotMatch(migration, /mcp_action_authorizations|mcp_action_execution_results|graphql|fetch\(/i);
  assert.doesNotMatch(repository, /graphql|mcp_action_authorizations|mcp_action_execution_results/i);
  assert.match(repository, /mcp_action_confirmation_unavailable/);
});

test("M3 execution retains independent stale tenant actor operation and target defenses", () => {
  for (const predicate of [
    "c.organization_id=p_organization_id",
    "c.actor_user_id=p_actor_user_id",
    "i.organization_id=p_organization_id",
    "i.actor_user_id=p_actor_user_id",
    "i.operation='shopify.controlled_webhook_create_delete_proof'",
    "i.target_kind='shopify_webhook_subscription'",
    "i.expires_at>p_requested_at",
    "c.expires_at>p_requested_at",
  ]) assert.ok(shopifyResolver.includes(predicate), predicate);
  assert.match(service, /resolveApprovedShopifyControlledProofExecution/);
  assert.match(service, /approved_target_changed/);
  assert.match(service, /consumptionId/);
  assert.match(service, /idempotencyKey/);
});
