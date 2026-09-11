import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  EVERFLOW_FIREHOSE_MAX_BODY_BYTES,
  EVERFLOW_FIREHOSE_ROUTING_TIMEOUT_MS,
  EverflowRoutingUnavailableError,
  constantTimeSecretEqual,
  firehoseEventTypeForPath,
  handleEverflowFirehose,
  privacySafePayload,
  processEverflowFirehoseEnvelope,
  resolveEverflowNetwork,
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
  const deps = { recordMetric: async (metric: string) => { metrics.push(metric); }, now: () => new Date("2026-09-10T12:00:00.000Z") };
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

test("receiver accepts a valid click without routing, strips sensitive fields, and queues", async () => {
  const f = fixture();
  const res = await handleEverflowFirehose(request(), "click", f.env, f.deps);
  assert.equal(res.status, 202);
  assert.equal(f.messages.length, 1);
  assert.equal("organization_id" in f.messages[0], false);
  assert.equal("connection_id" in f.messages[0], false);
  assert.equal("provider_account_id" in f.messages[0], false);
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

test("strict validation rejects missing identity but queues any syntactically valid network for async routing", async () => {
  const f = fixture();
  assert.equal((await handleEverflowFirehose(request({ network_id: 1, unix_timestamp: 1 }), "click", f.env, f.deps)).status, 422);
  assert.equal((await handleEverflowFirehose(request({ ...click, network_id: 999 }), "click", f.env, f.deps)).status, 202);
  assert.equal(f.messages.length, 1);
});

test("click, conversion, and update queue while the routing database is unavailable", async () => {
  for (const [eventType, payload] of [["click", click], ["conversion", conversion], ["conversion_update", { ...conversion, update_timestamp: 1715788460 }]] as const) {
    const f = fixture();
    assert.equal((await handleEverflowFirehose(request(payload), eventType, f.env, f.deps)).status, 202);
    assert.equal(f.messages.length, 1);
  }
});

test("conversion and update payloads use conversion identity without field inference", async () => {
  for (const eventType of ["conversion", "conversion_update"]) {
    const f = fixture();
    const payload = eventType === "conversion_update" ? { ...conversion, update_timestamp: 1715788460 } : conversion;
    assert.equal((await handleEverflowFirehose(request(payload), eventType as "conversion" | "conversion_update", f.env, f.deps)).status, 202);
    assert.equal(f.messages[0].event_type, eventType);
    assert.equal(f.messages[0].network_id, "1");
  }
});

test("same transaction in a different network retains distinct async routing input", async () => {
  const f = fixture();
  await handleEverflowFirehose(request(), "click", f.env, f.deps);
  await handleEverflowFirehose(request({ ...click, network_id: 2 }), "click", f.env, f.deps);
  assert.notEqual(f.messages[0].network_id, f.messages[1].network_id);
});

test("queue publication failure is retryable and never acknowledged", async () => {
  const f = fixture({ everflow_firehose: { send: async () => { throw new Error("queue down"); } } });
  const response = await handleEverflowFirehose(request(), "click", f.env, f.deps);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, error: "queue_publication_failed" });
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

test("consumer resolves tenant scope before calling the single atomic persistence RPC", async () => {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const db = { from: () => { throw new Error("unused"); }, rpc: async (name: string, args: Record<string, unknown>) => { calls.push([name, args]); return { data: { status: "processed" }, error: null }; } };
  const envelope: EverflowFirehoseEnvelope = { schema_version: 1, provider: "everflow", transport: "firehose", received_at: new Date().toISOString(), event_type: "click", network_id: "1", payload: click };
  const result = await processEverflowFirehoseEnvelope(db, envelope, { resolveNetwork: async () => ({ status: "resolved", scope }) });
  assert.equal(result.status, "processed");
  assert.equal(calls[0][0], "ingest_everflow_firehose_event_v1");
  assert.equal(calls[0][1].p_organization_id, "org");
});

test("consumer retries availability errors and bounds routing lookup to five seconds", async () => {
  const db = { from: () => { throw new Error("unused"); }, rpc: async () => ({ data: null, error: null }) };
  const envelope: EverflowFirehoseEnvelope = { schema_version: 1, provider: "everflow", transport: "firehose", received_at: new Date().toISOString(), event_type: "click", network_id: "1", payload: click };
  for (const failure of [Object.assign(new Error("unavailable"), { status: 503 }), Object.assign(new Error("cache"), { code: "PGRST002" }), new TypeError("fetch failed")]) {
    await assert.rejects(() => processEverflowFirehoseEnvelope(db, envelope, { resolveNetwork: async () => { throw failure; } }), EverflowRoutingUnavailableError);
  }
  await assert.rejects(() => processEverflowFirehoseEnvelope(db, envelope, { resolveNetwork: async () => new Promise(() => undefined), routingTimeoutMs: 5 }), EverflowRoutingUnavailableError);
  assert.equal(EVERFLOW_FIREHOSE_ROUTING_TIMEOUT_MS, 5_000);
});

test("unknown and ambiguous networks never reach persistence", async () => {
  let rpcCalls = 0;
  const db = { from: () => { throw new Error("unused"); }, rpc: async () => { rpcCalls += 1; return { data: null, error: null }; } };
  const envelope: EverflowFirehoseEnvelope = { schema_version: 1, provider: "everflow", transport: "firehose", received_at: new Date().toISOString(), event_type: "click", network_id: "1", payload: click };
  for (const status of ["unknown_network", "ambiguous_network"] as const) {
    assert.deepEqual(await processEverflowFirehoseEnvelope(db, envelope, { resolveNetwork: async () => ({ status }) }), { status });
  }
  assert.equal(rpcCalls, 0);
});

test("network lookup distinguishes zero, one, and multiple eligible mappings", async () => {
  const mapping = { id: "provider", organization_id: "org", connection_id: "connection", commerce_provider_connections: { account_id: "account" } };
  const dbFor = (data: unknown[]) => {
    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    builder.eq = () => builder;
    builder.limit = async () => ({ data, error: null });
    return { from: () => builder, rpc: async () => ({ data: null, error: null }) };
  };
  assert.deepEqual(await resolveEverflowNetwork(dbFor([]), "1"), { status: "unknown_network" });
  assert.deepEqual(await resolveEverflowNetwork(dbFor([mapping, mapping]), "1"), { status: "ambiguous_network" });
  assert.deepEqual(await resolveEverflowNetwork(dbFor([mapping]), "1"), { status: "resolved", scope });
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
  const branch = source.slice(start, source.indexOf("if (isQueueObservabilityTest", start));
  assert.match(branch, /msg\.retry\(\)/);
  assert.match(branch, /ctx\.waitUntil\(recordFirehoseMetric/);
  assert.doesNotMatch(branch, /body\.payload|JSON\.stringify\(body/);
  assert.doesNotMatch(branch, /network_id:/);
});

test("worker receipt path has no tenant-routing database dependency", () => {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const source = readFileSync(`${here}/index.ts`, "utf8");
  const start = source.indexOf("const firehoseEventType = firehoseEventTypeForPath(path)");
  const branch = source.slice(start, source.indexOf("if (path === EVERFLOW_FIREHOSE_BASE_PATH", start));
  assert.doesNotMatch(branch, /resolveEverflowNetwork|resolveNetwork/);
});
