import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const worker=readFileSync(new URL("./index.ts",import.meta.url),"utf8");
const migration=readFileSync(new URL("../../supabase/migrations/20260926060810_tkid_bounded_proof_enforcement_v1.sql",import.meta.url),"utf8");

test("bootstrap uses a durable idempotency key and claims before returning identity",()=>{
  assert.match(worker,/x-tracekit-bootstrap-key/);
  assert.match(worker,/tkidRoute === "bootstrap"[\s\S]*claimTkidProof[\s\S]*claimed\.journey_id/);
  assert.doesNotMatch(worker,/tkidRoute === "bootstrap"[\s\S]{0,800}return json\(\{journey_id:opaqueId\(\)/);
});

test("event ingestion preserves abuse control and claims capacity before any persistence",()=>{
  const ingest=worker.slice(worker.indexOf('if (tkidRoute === "ingest")'),worker.indexOf("const browserRoute"));
  const abuse=ingest.indexOf("enforceTkidDistributedRequest");
  const preflight=ingest.indexOf("proofPreflightDecision");
  const claim=ingest.indexOf("claimTkidProof");
  const journey=ingest.indexOf('from("tkid_journeys")');
  const evidence=ingest.indexOf('from("tkid_event_evidence")');
  const event=ingest.indexOf('from("tkid_events")');
  assert.ok(preflight>=0&&abuse>preflight&&claim>abuse&&journey>claim&&evidence>claim&&event>claim);
  assert.match(ingest,/claimed\.decision!=="accepted"\)return proofFailure/);
});

test("bounded proof failures are safe and do not disclose counts",()=>{
  const failure=worker.split("\n").find(line=>line.startsWith("function proofFailure("))||"";
  assert.match(failure,/TKID collection is unavailable/);
  assert.doesNotMatch(failure,/claimed_journeys|claimed_events|max_journeys|max_events/);
});

test("runtime adapter declarations fail closed instead of silently substituting",()=>{
  assert.match(worker,/source\.abuse_adapter!=="supabase_fixed_window_v1"/);
  assert.match(worker,/unsupported_abuse_adapter/);
  assert.match(migration,/s\.abuse_adapter is distinct from 'supabase_fixed_window_v1'/);
});

test("database reservations are serialized, unique, and conservatively retained",()=>{
  assert.match(migration,/pg_advisory_xact_lock/);
  assert.match(migration,/unique \(organization_id,source_id,bootstrap_key\)/);
  assert.match(migration,/unique \(organization_id,source_id,event_id\)/);
  assert.match(migration,/Failed persistence retains capacity to prevent overshoot/);
  assert.doesNotMatch(migration,/delete from public\.tkid_proof_(journey|event)_claims/);
});

test("ordinary TKID event persistence has no alternate browser route",()=>{
  assert.equal((worker.match(/from\("tkid_events"\)\.insert/g)||[]).length,1);
  assert.match(worker,/tkidRoute === "ingest"/);
});
