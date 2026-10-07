import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const source = (path: string) => readFileSync(new URL(path, root), "utf8");
const migration = source("../supabase/migrations/20261007052825_ws019_m44_phase_b_acceptance_fixture.sql");
const route = source("app/api/action-notifications/acceptance-fixtures/ws019-m4-4/[operation]/route.ts");
const repository = source("lib/mcp/m44-phase-b-acceptance.ts");
const projection = source("lib/mcp/action-notifications.ts");

test("Phase B manifest is deterministic, Stem Labs scoped, and projection compatible", () => {
  for (const id of [
    "b4400000-0000-4000-8000-000000000001",
    "b4400000-0000-4000-8000-000000000002",
    "b4400000-0000-4000-8000-000000000003",
    "b4410000-0000-4000-8000-000000000002",
    "b4420000-0000-4000-8000-000000000002",
    "b4430000-0000-4000-8000-000000000002",
    "b4440000-0000-4000-8000-000000000003",
  ]) assert.match(repository, new RegExp(id));
  assert.match(migration, /8f6bb14b-2126-49b8-bfdb-c60edbc3549b/);
  assert.match(migration, /shopify\.controlled_webhook_create_delete_proof/);
  assert.match(migration, /shopify_webhook_subscription/);
  assert.match(migration, /ws019-m4-4-phase-b\.invalid/);
  assert.match(projection, /assessIntelligenceAction\(operation\)\.allowed/);
});

test("Phase B first-party route derives tenant and actor and accepts exact empty bodies only", () => {
  assert.match(route, /resolveApplicationSession/);
  assert.match(route, /requirePermission\(resolution\.session, "actions\.execute"\)/);
  assert.match(route, /resolution\.session\.activeOrganization\.id !== WS019_M44_PHASE_B\.organizationId/);
  assert.match(route, /actorUserId: resolution\.session\.user\.id/);
  assert.match(route, /Object\.keys\(body\)\.length !== 0/);
  assert.match(route, /searchParams\.size !== 0/);
  assert.match(route, /sameOrigin/);
  assert.deepEqual([...route.matchAll(/"(create|resolve-awaiting|resolve-recovery)"/g)].map((match) => match[1]), ["create", "resolve-awaiting", "resolve-recovery"]);
});

test("Phase B persistence is atomic, idempotent, and fails closed on incompatible state", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /v_intent_count = 0/);
  assert.match(migration, /v_intent_count <> 3/);
  assert.match(migration, /acceptance fixture incompatible/g);
  assert.doesNotMatch(migration, /on conflict.*do update/is);
  assert.match(migration, /state in \('created','rollback_verified'\)/);
  assert.doesNotMatch(migration, /update public\.mcp_action_execution_results/i);
});

test("Phase B provider firewall has no credential, orchestration, delivery, or external audit path", () => {
  for (const text of [route, repository]) {
    assert.doesNotMatch(text, /resolveCredential|orchestrate|executeShopify|Everflow|Commas|edge_intelligence|external.*delivery/i);
  }
  assert.match(repository, /\/rest\/v1\/rpc\//);
  assert.doesNotMatch(repository, /provider-action|target-resolver|commerce-control-plane/);
  assert.doesNotMatch(migration, /mcp_external_(action|mutation)_audit|work_items|work_item_activity/i);
  assert.match(migration, /"providerMutation":false/);
  assert.match(migration, /"external_request_sent":false/);
});

test("Phase B lifecycle and presentation operations remain separated", () => {
  assert.match(migration, /resolve_ws019_m44_phase_b_awaiting/);
  assert.match(migration, /insert into public\.mcp_action_confirmations/);
  assert.match(migration, /resolve_ws019_m44_phase_b_recovery/);
  assert.match(migration, /set state='rollback_verified',rollback_verified=true/);
  assert.doesNotMatch(migration, /insert into public\.mcp_action_notification_states|update public\.mcp_action_notification_states/);
  assert.match(projection, /mcp_action_notification_states/);
});

test("Phase B functions are invoker-rights and service-role-only", () => {
  assert.equal((migration.match(/security invoker/g) || []).length, 3);
  assert.equal((migration.match(/grant execute on function/g) || []).length, 3);
  assert.equal((migration.match(/to service_role/g) || []).length, 3);
  assert.match(migration, /from public,anon,authenticated,authenticator/g);
});
