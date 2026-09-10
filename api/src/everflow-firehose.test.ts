import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  EVERFLOW_FIREHOSE_MAX_BODY_BYTES,
  constantTimeSecretEqual,
  firehoseEventTypeForPath,
  handleEverflowFirehose,
  privacySafePayload,
  processEverflowFirehoseEnvelope,
  type EverflowFirehoseEnvelope,
} from "./everflow-firehose.ts";

const secret = "s".repeat(43);
const scope = { organization_id: "org", account_id: "account", connection_id: "connection", provider_account_id: "provider" };
const click = { transaction_id: "tx-1", unix_timestamp: 1715788261, network_id: 1, sub1: "partner", user_ip: "127.0.0.1" };
const conversion = { conversion_id: "cv-1", transaction_id: "tx-1", conversion_timestamp: 1715788399, network_id: "1", conversion_status: "approved" };

function request(payload: unknown = click, options: { method?: string; auth?: string; contentType?: string; body?: string } = {}) {
  return new Request("https://webhooks.trace-kit.io/v1/everflow/firehose/clicks", {
    method: options.method || "POST",
    headers: {
      authorization: options.auth === undefined ? `Bearer ${secret}` : options.auth,
      "content-type": options.contentType || "application/json",
    },
    body: (options.method || "POST") === "GET" ? undefined : options.body === undefined ? JSON.stringify(payload) : options.body,
  });
}

function fixture(overrides: Record<string, unknown> = {}) {
  const messages: EverflowFirehoseEnvelope[] = [];
  const metrics: string[] = [];
  const env = { EVERFLOW_FIREHOSE_SECRET: secret, everflow_firehose: { send: async (message: EverflowFirehoseEnvelope) => { messages.push(message); } }, ...overrides };
  const deps = { resolveNetwork: async (networkId: string) => networkId === "1" ? scope : null, recordMetric: async (metric: string) => { metrics.push(metric); }, now: () => new Date("2026-09-10T12:00:00.000Z") };
  return { env, deps, messages, metrics };
}

test("constant-time comparison and path-authoritative event discriminator", () => {
  assert.equal(constantTimeSecretEqual(secret, secret), true);
  assert.equal(constantTimeSecretEqual(secret, `${secret}x`), false);
  assert.equal(firehoseEventTypeForPath("/v1/everflow/firehose/clicks"), "click");
  assert.equal(firehoseEventTypeForPath("/v1/everflow/firehose/conversions"), "conversion");
  assert.equal(firehoseEventTypeForPath("/v1/everflow/firehose/conversion-updates"), "conversion_update");
  assert.equal(firehoseEventTypeForPath("/v1/everflow/firehose"), null);
  assert.equal(firehoseEventTypeForPath("/v1/everflow/firehose/impressions"), null);
});

test("receiver accepts a valid click, resolves tenant scope, strips sensitive fields, and queues", async () => {
  const f = fixture();
  const res = await handleEverflowFirehose(request(), "click", f.env, f.deps);
  assert.equal(res.status, 202);
  assert.equal(f.messages.length, 1);
  assert.deepEqual({ organization_id: f.messages[0].organization_id, connection_id: f.messages[0].connection_id, provider_account_id: f.messages[0].provider_account_id }, { organization_id: "org", connection_id: "connection", provider_account_id: "provider" });
  assert.equal(f.messages[0].payload.user_ip, undefined);
  assert.deepEqual(f.metrics, ["authenticated", "received", "queued"]);
});

test("authentication rejects missing and invalid bearer secrets", async () => {
  for (const auth of ["", "Bearer invalid"]) {
    const f = fixture();
    assert.equal((await handleEverflowFirehose(request(click, { auth }), "click", f.env, f.deps)).status, 401);
    assert.equal(f.messages.length, 0);
  }
});

test("receiver enforces method, JSON content, malformed JSON, size, and supported types", async () => {
  const f = fixture();
  assert.equal((await handleEverflowFirehose(request(click, { method: "GET" }), "click", f.env, f.deps)).status, 405);
  assert.equal((await handleEverflowFirehose(request(click, { contentType: "text/plain" }), "click", f.env, f.deps)).status, 415);
  assert.equal((await handleEverflowFirehose(request(click, { body: "{" }), "click", f.env, f.deps)).status, 400);
  assert.equal((await handleEverflowFirehose(request(click, { body: JSON.stringify({ ...click, padding: "x".repeat(EVERFLOW_FIREHOSE_MAX_BODY_BYTES) }) }), "click", f.env, f.deps)).status, 413);
});

test("strict validation and routing reject missing identity and unknown networks", async () => {
  const f = fixture();
  assert.equal((await handleEverflowFirehose(request({ network_id: 1, unix_timestamp: 1 }), "click", f.env, f.deps)).status, 422);
  assert.equal((await handleEverflowFirehose(request({ ...click, network_id: 999 }), "click", f.env, f.deps)).status, 422);
  assert.equal(f.messages.length, 0);
});

test("conversion and update payloads use conversion identity without field inference", async () => {
  for (const eventType of ["conversion", "conversion_update"]) {
    const f = fixture();
    const payload = eventType === "conversion_update" ? { ...conversion, update_timestamp: 1715788460 } : conversion;
    assert.equal((await handleEverflowFirehose(request(payload), eventType as "conversion" | "conversion_update", f.env, f.deps)).status, 202);
    assert.equal(f.messages[0].event_type, eventType);
    assert.match(f.messages[0].dedupe_identity, /cv-1$/);
  }
});

test("same transaction in a different network cannot share tenant scope", async () => {
  const f = fixture();
  const second = { ...scope, organization_id: "org-2", connection_id: "connection-2", provider_account_id: "provider-2" };
  f.deps.resolveNetwork = async (networkId: string) => networkId === "1" ? scope : second;
  await handleEverflowFirehose(request(), "click", f.env, f.deps);
  await handleEverflowFirehose(request({ ...click, network_id: 2 }), "click", f.env, f.deps);
  assert.notEqual(f.messages[0].dedupe_identity, f.messages[1].dedupe_identity);
});

test("queue publication failure is retryable and never acknowledged", async () => {
  const f = fixture({ everflow_firehose: { send: async () => { throw new Error("queue down"); } } });
  assert.equal((await handleEverflowFirehose(request(), "click", f.env, f.deps)).status, 503);
  assert.ok(f.metrics.includes("queue_failure"));
});

test("best-effort telemetry failure cannot block queue publication", async () => {
  const f = fixture();
  f.deps.recordMetric = async () => { throw new Error("metrics unavailable"); };
  assert.equal((await handleEverflowFirehose(request(), "click", f.env, f.deps)).status, 202);
  assert.equal(f.messages.length, 1);
});

test("privacy snapshot removes raw IP, user agent, redirect, geo, secrets, and raw query string", () => {
  const safe = privacySafePayload({ user_ip: "1", http_user_agent: "ua", redirect_url: "https://secret", geolocation: { city: "x" }, raw_query_string: "a=b", api_key: "secret", transaction_id: "tx" });
  assert.deepEqual(safe, { transaction_id: "tx" });
});

test("consumer calls the single atomic persistence RPC", async () => {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const db = { from: () => { throw new Error("unused"); }, rpc: async (name: string, args: Record<string, unknown>) => { calls.push([name, args]); return { data: { status: "processed" }, error: null }; } };
  const envelope: EverflowFirehoseEnvelope = { schema_version: 1, provider: "everflow", transport: "firehose", received_at: new Date().toISOString(), event_type: "click", network_id: "1", ...scope, dedupe_identity: "d", payload: click };
  assert.deepEqual(await processEverflowFirehoseEnvelope(db, envelope), { status: "processed" });
  assert.equal(calls[0][0], "ingest_everflow_firehose_event_v1");
});

test("migration codifies duplicate, out-of-order, stale-update, and poll convergence semantics", () => {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const sql = readFileSync(`${here}/../../supabase/migrations/20260910151937_everflow_firehose_v1.sql`, "utf8");
  assert.match(sql, /on conflict\(organization_id,connection_id,provider_account_id,transaction_id\)/i);
  assert.match(sql, /everflow_firehose_pending_updates/i);
  assert.match(sql, /provider_update_authoritative/i);
  assert.match(sql, /on conflict\(connection_id,provider_account_id,source_identity\)/i);
  assert.match(sql, /transport in \('poll','firehose'\)/i);
  assert.match(sql, /persistence_failure/i);
  assert.match(sql, /commerce_evidence_records/i);
  assert.match(sql, /commerce_managed_evidence_payloads/i);
  assert.match(sql, /everflow_conversion_state_history/i);
  assert.match(sql, /to_timestamp\(\(p_payload->>'unix_timestamp'\)::numeric\)/i);
  assert.match(sql, /commerce_provider_accounts_external_active_idx/i);
  for (const metric of ["first_persisted", "exact_replay", "newer_update_applied", "stale_update_ignored", "pending_update_staged", "pending_update_applied"]) assert.match(sql, new RegExp(metric));
});

test("worker accepts only the three documented path-discriminated endpoints", () => {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const source = readFileSync(`${here}/index.ts`, "utf8");
  assert.match(source, /firehoseEventTypeForPath\(path\)/);
  assert.match(source, /firehose_endpoint_not_found/);
  assert.doesNotMatch(source, /x-everflow-event-type/i);
});

test("worker consumer retries failures and never logs raw payloads", () => {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const source = readFileSync(`${here}/index.ts`, "utf8");
  const start = source.indexOf('body.provider === "everflow"');
  const branch = source.slice(start, source.indexOf("continue;", start) + 9);
  assert.match(branch, /msg\.retry\(\)/);
  assert.doesNotMatch(branch, /body\.payload|JSON\.stringify\(body/);
});
