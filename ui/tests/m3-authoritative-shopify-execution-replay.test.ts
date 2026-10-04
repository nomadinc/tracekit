import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const service = readFileSync(new URL("../lib/mcp/action-service.ts", import.meta.url), "utf8");
const repository = readFileSync(new URL("../lib/mcp/m15-shopify-intent-repository.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../supabase/migrations/20261004175820_authoritative_shopify_execution_replay.sql", import.meta.url), "utf8");
const execution = service.split("async executeShopifyControlledProof")[1].split("async executeCommasTestDelivery")[0];

test("completed replay is resolved before confirmation and provider target resolution", () => {
  const replay = execution.indexOf("resolveCompletedShopifyControlledProofReplay");
  const confirmation = execution.indexOf("resolveShopifyControlledProofConfirmation");
  const provider = execution.indexOf("resolveApprovedShopifyControlledProofExecution");
  assert.ok(replay > 0 && confirmation > replay && provider > confirmation);
  assert.match(execution.slice(replay, confirmation), /replay_same_result/);
});

test("completed replay returns the durable result without orchestration", () => {
  const replayBranch = execution.slice(execution.indexOf('replay?.decision === "replay_same_result"'), execution.indexOf("const resolved"));
  assert.match(replayBranch, /execution: replay\.result/);
  assert.match(replayBranch, /netProviderConfigurationMutation: false/);
  assert.doesNotMatch(replayBranch, /resolveApproved|orchestrate|credential|fetch/);
});

test("requested_at is metadata while database time owns validity", () => {
  assert.match(migration, /i\.expires_at>clock_timestamp\(\)/);
  assert.match(migration, /c\.expires_at>clock_timestamp\(\)/);
  assert.match(migration, /v_now:=clock_timestamp\(\)/);
  assert.match(migration, /expires_at<=v_now/);
  assert.match(migration, /'available',v_confirmation\.expires_at,p_requested_at/);
  assert.doesNotMatch(migration, /expires_at<=p_requested_at/);
});

test("replay is tenant actor confirmation operation and immutable-result bound", () => {
  assert.match(migration, /c\.organization_id=p_organization_id/);
  assert.match(migration, /c\.actor_user_id=p_actor_user_id/);
  assert.match(migration, /c\.confirmation_id=p_confirmation_id/);
  assert.match(migration, /i\.operation=p_expected_operation/);
  assert.match(migration, /a\.state='consumed'/);
  assert.match(migration, /r\.consumption_id=a\.consumption_id::text/);
  assert.match(migration, /r\.result->>'status'='completed'/);
});

test("only service role can invoke the new execution RPCs", () => {
  assert.match(migration, /revoke all on function public\.resolve_completed_mcp_shopify_execution_replay[\s\S]*from public,anon,authenticated,authenticator/);
  assert.match(migration, /grant execute on function public\.resolve_completed_mcp_shopify_execution_replay[\s\S]*to service_role/);
  assert.match(migration, /revoke all on function public\.authorize_mcp_shopify_execution_atomic[\s\S]*from public,anon,authenticated,authenticator/);
  assert.match(repository, /rpc\/authorize_mcp_shopify_execution_atomic/);
});
