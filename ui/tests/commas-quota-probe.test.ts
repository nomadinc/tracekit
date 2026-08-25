import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { COMMAS_QUOTA_OBSERVATION_MAX_AGE_MS, isFreshCommasQuotaObservation, persistCommasQuotaObservation, persistenceDiagnostic } from "../lib/commerce/commas-continuous-worker.ts";

test("quota observation freshness is explicit and fail-closed", () => {
  const now = Date.parse("2026-08-24T12:00:00.000Z");
  assert.equal(COMMAS_QUOTA_OBSERVATION_MAX_AGE_MS, 15 * 60 * 1000);
  assert.equal(isFreshCommasQuotaObservation("2026-08-24T11:50:01.000Z", now), true);
  assert.equal(isFreshCommasQuotaObservation("2026-08-24T11:44:59.000Z", now), false);
  assert.equal(isFreshCommasQuotaObservation(null, now), false);
});

test("quota probe is one-request, state-only, and never enters normalization", () => {
  const source = readFileSync(new URL("../lib/commerce/commas-continuous-worker.ts", import.meta.url), "utf8");
  const start = source.indexOf("export async function runCommasQuotaProbe");
  const end = source.indexOf("async function scopedConnection", start);
  const probe = source.slice(start, end);
  assert.match(probe, /fetchProviderPage\(scope\.secret, 1, 1/);
  assert.match(probe, /providerRequests: 1/);
  assert.match(probe, /operator_quota_probe/);
  assert.doesNotMatch(probe, /normalizeCommasTransaction|evidenceForPage|commerce_sync_runs.*POST|enqueue_commerce/);
});

test("quota observation updates the existing continuous state row without an upsert insert", async () => {
  const calls: Array<{path:string;init?:RequestInit}> = [];
  const result = await persistCommasQuotaObservation({accountId:"a",organizationId:"o",connectionId:"c",providerAccountId:"p",quotaLimit:10000,quotaRemaining:9980,quotaReset:"2026-08-24T13:00:00Z",observedAt:"2026-08-24T12:00:00Z"}, async (path,init) => {
    calls.push({path,init});
    return [{id:"state"}];
  });
  assert.equal(result.mode, "updated_existing");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init?.method, "PATCH");
  assert.match(calls[0].path, /connection_id=eq\.c/);
  assert.match(String(calls[0].init?.body), /quota_remaining/);
});

test("quota observation creates a schema-complete state row only when absent", async () => {
  const calls: Array<{path:string;init?:RequestInit}> = [];
  const result = await persistCommasQuotaObservation({accountId:"a",organizationId:"o",connectionId:"c",providerAccountId:"p",quotaLimit:null,quotaRemaining:9980,quotaReset:null,observedAt:"2026-08-24T12:00:00Z"}, async (path,init) => {
    calls.push({path,init});
    return calls.length === 1 ? [] : [{id:"created"}];
  });
  assert.equal(result.mode, "created_state");
  assert.equal(calls.length, 2);
  const body = JSON.parse(String(calls[1].init?.body)) as Record<string, unknown>;
  assert.equal(body.normalizer_version, "commas-transaction-v1");
  assert.equal(body.evidence_contract_version, "commerce-provider-raw-v1");
  assert.deepEqual(body.recent_source_ids, []);
  assert.deepEqual(body.warnings, []);
});

test("persistence diagnostics are sanitized and quota persistence does not refetch", () => {
  const source = readFileSync(new URL("../lib/commerce/commas-continuous-worker.ts", import.meta.url), "utf8");
  const persistenceStart = source.indexOf("export async function persistCommasQuotaObservation");
  const persistence = source.slice(persistenceStart, source.indexOf("async function scopedConnection", persistenceStart));
  assert.doesNotMatch(persistence, /fetchProviderPage|fetch\(/);
  assert.match(source, /status:response\.status/);
  assert.match(source, /code:safePersistenceText\(body\.code/);
  assert.match(source, /table:path\.split/);
});

test("PostgREST failures expose only bounded persistence diagnostics", () => {
  const diagnostic = persistenceDiagnostic(400, "commerce_continuous_sync_state?on_conflict=connection_id,provider_account_id,resource", "POST", {
    code: "PGRST204", message: "Column was not found", details: "schema cache", hint: "refresh schema",
    secret: "must-not-appear", email: "person@example.com",
  });
  assert.deepEqual(diagnostic, {
    status:400, code:"PGRST204", message:"Column was not found", detail:"schema cache", hint:"refresh schema",
    table:"commerce_continuous_sync_state", operation:"POST",
  });
  assert.doesNotMatch(JSON.stringify(diagnostic), /secret|example\.com/);
});
