import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../../supabase/migrations/20260926190838_tkid_retention_erasure_execution_v1.sql", import.meta.url), "utf8");
const workerConfig = readFileSync(new URL("../../api/wrangler.toml", import.meta.url), "utf8");

test("M2 is tenant-generic and seeds no executable privacy policy", () => {
  assert.doesNotMatch(migration, /buyecowatt|ecowatt|b0d5abc3|b784b15c|push-button-system/i);
  assert.doesNotMatch(migration, /insert into public\.tkid_(retention|erasure)_policies/i);
  assert.match(migration, /retention_policy_unapproved/);
  assert.match(migration, /erasure_policy_unapproved/);
});

test("policy registries require approved executable contracts", () => {
  assert.match(migration, /create table public\.tkid_retention_policies/);
  assert.match(migration, /create table public\.tkid_erasure_policies/);
  assert.match(migration, /status in \('draft','active','retired'\)/);
  assert.match(migration, /selector_version = 'tkid-retention-selector-v1'/);
  assert.match(migration, /execution_strategy = 'tkid-object-first-v1'/);
  assert.match(migration, /'canonical_commerce' = any\(preservation_exceptions\)/);
});

test("selection and execution are bounded, leased, idempotent, and source scoped", () => {
  assert.match(migration, /p_limit<1 or p_limit>100/);
  assert.match(migration, /order by j\.started_at,j\.id limit p_limit/);
  assert.match(migration, /on conflict on constraint tkid_erasure_runs_organization_id_journey_id_policy_id_key do nothing/);
  assert.match(migration, /for update of er skip locked limit 1/);
  assert.match(migration, /foreign key \(organization_id,source_id\) references public\.tkid_sources/);
});

test("existing privacy contract redacts TKID evidence and preserves canonical Commerce", () => {
  assert.match(migration, /complete_tkid_journey_erasure/);
  assert.match(migration, /object_type<>'tkid_event_evidence'/);
  assert.match(migration, /last_error_code='unsupported_object_type'/);
  assert.doesNotMatch(migration, /delete from public\.(platform_orders|canonical_)/i);
});

test("ingestion start requires active policies and enabled execution capability", () => {
  assert.match(migration, /tkid_retention_policies where id=s\.retention_policy_id and status='active'/);
  assert.match(migration, /tkid_erasure_policies where id=s\.erasure_policy_id and status='active'/);
  assert.match(migration, /ctl\.execution_state='enabled'/);
  assert.match(migration, /privacy_executor_disabled/);
});

test("operator RPCs are security invoker and service-role only", () => {
  assert.match(migration, /language plpgsql security invoker/g);
  assert.match(migration, /revoke all on function[\s\S]*from public,anon,authenticated,authenticator/);
  assert.match(migration, /grant execute on function[\s\S]*to service_role/);
  assert.match(migration, /language sql stable security invoker/);
});

test("scheduler remains explicitly off until deployment configuration is approved", () => {
  assert.match(workerConfig, /TRACEKIT_TKID_ERASURE_EXECUTOR_ENABLED = "false"/);
});
