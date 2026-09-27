import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../../supabase/migrations/20260927041927_tkid_interrupted_event_recovery_v1.sql", import.meta.url), "utf8");

test("recovery primitive is generic and accepts no caller event content", () => {
  assert.doesNotMatch(migration, /buyecowatt|ecowatt/i);
  const signature = migration.slice(migration.indexOf("create or replace function public.recover_interrupted_tkid_event_v1"), migration.indexOf(")\nreturns table"));
  assert.doesNotMatch(signature, /journey_id|browser_session_id|event_name|payload|evidence_hash/);
});

test("recovery requires stopped ingestion and pre-existing admitted durable state", () => {
  assert.match(migration, /ingestion_state <> 'stopped'/);
  assert.match(migration, /exactly one event reservation is required/);
  assert.match(migration, /exactly one event evidence row is required/);
  assert.match(migration, /v_claim\.claimed_at < v_source\.proof_starts_at/);
  assert.doesNotMatch(migration, /now\(\)\s*[<>]=?\s*v_source\.proof_(starts|ends)_at/);
});

test("event reconstruction explicitly maps real columns without normalized-only fields", () => {
  const insert = migration.slice(migration.indexOf("insert into public.tkid_events("), migration.indexOf("insert into public.tracekit_audit_events("));
  assert.match(insert, /\bid\s*,\s*organization_id/);
  assert.doesNotMatch(insert, /\bevent_id\b/);
  assert.doesNotMatch(insert, /\bevidence_hash\b/);
  assert.match(insert, /p_event_id/);
});

test("replay and concurrency are mutation-idempotent", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /'already_recovered'::text, false/);
  assert.match(migration, /existing event conflicts with durable recovery state/);
  assert.match(migration, /tkid\.event_persistence_recovered/);
});

test("RPC is security-invoker and service-role-only", () => {
  assert.match(migration, /language plpgsql\nsecurity invoker/);
  assert.match(migration, /revoke all on function public\.recover_interrupted_tkid_event_v1[^;]+from public, anon, authenticated, authenticator/);
  assert.match(migration, /grant execute on function public\.recover_interrupted_tkid_event_v1[^;]+to service_role/);
});
