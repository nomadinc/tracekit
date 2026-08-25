import assert from "node:assert/strict";
import test from "node:test";
import handler, { validateRuntimeMessage, validateRuntimeScope } from "./index.ts";

const message = {
  schema_version: 1, job_type: "commerce_continuous", provider: "commas",
  account_id: "44444444-4444-4444-8444-444444444444",
  organization_id: "22222222-2222-4222-8222-222222222222",
  connection_id: "11111111-1111-4111-8111-111111111111",
  provider_account_id: "33333333-3333-4333-8333-333333333333",
  resource: "transactions", requested_mode: "continuous", scheduler_identity: "schedule:quota-bootstrap",
  requested_at: "2026-08-21T00:00:00Z", bootstrap: true, bootstrap_mode: "quota-bootstrap",
} as const;
const normalMessage = { ...message, bootstrap: undefined, bootstrap_mode: undefined };
const env = { TRACEKIT_COMMERCE_SCHEDULER_ENABLED: "false", TRACEKIT_COMMERCE_KILL_SWITCH: "disabled", CONTINUOUS_RUNTIME_SHARED_SECRET: "test-only" };

test("startup is inert and makes no provider request", async () => {
  const response = await handler.fetch(new Request("https://runtime/v1/commerce/sync", { method: "POST", headers: { "x-tracekit-runtime-secret": "test-only" }, body: JSON.stringify(normalMessage) }), env);
  assert.equal(response.status, 503);
  assert.match(await response.text(), /continuous_runtime_disabled/);
});

test("quota bootstrap is explicitly allowed through the internal path while normal controls remain disabled", async () => {
  const response = await handler.fetch(new Request("https://runtime/v1/commerce/sync", { method: "POST", headers: { "x-tracekit-runtime-secret": "test-only" }, body: JSON.stringify(message) }), env);
  assert.notEqual(response.status, 503);
});

test("manual invocation is explicitly allowed through the internal path while normal controls remain disabled", async () => {
  const response = await handler.fetch(new Request("https://runtime/v1/commerce/sync", { method: "POST", headers: { "x-tracekit-runtime-secret": "test-only" }, body: JSON.stringify({ ...message, bootstrap: undefined, bootstrap_mode: undefined, manual: true }) }), env);
  assert.notEqual(response.status, 503);
});

test("operator one-shot is allowed without scheduler enablement but remains kill-switch guarded", async () => {
  const operatorMessage = { ...normalMessage, operator_one_shot: true, acceptance_cycle: true, max_pages: 8, per_page: 100, request_key: "55555555-5555-4555-8555-555555555555", reserved_run_id: "66666666-6666-4666-8666-666666666666" };
  const allowed = await handler.fetch(new Request("https://runtime/v1/commerce/sync", { method: "POST", headers: { "x-tracekit-runtime-secret": "test-only" }, body: JSON.stringify(operatorMessage) }), { ...env, TRACEKIT_COMMERCE_KILL_SWITCH: "enabled" });
  assert.notEqual(allowed.status, 503);
  const blocked = await handler.fetch(new Request("https://runtime/v1/commerce/sync", { method: "POST", headers: { "x-tracekit-runtime-secret": "test-only" }, body: JSON.stringify(operatorMessage) }), env);
  assert.equal(blocked.status, 503);
});

test("ordinary direct HTTP invocation cannot bypass the internal contract", async () => {
  const response = await handler.fetch(new Request("https://runtime/v1/commerce/sync", { method: "POST", body: JSON.stringify(message) }), { ...env, TRACEKIT_COMMERCE_SCHEDULER_ENABLED: "true", TRACEKIT_COMMERCE_KILL_SWITCH: "enabled" });
  assert.equal(response.status, 403);
});
test("runtime dispatch probe requires the shared secret and performs no commerce execution", async () => {
  const body = JSON.stringify({ type: "runtime-dispatch-probe" });
  const denied = await handler.fetch(new Request("https://runtime/v1/commerce/sync", { method: "POST", body }), { ...env, CONTINUOUS_RUNTIME_SHARED_SECRET: "correct" });
  assert.equal(denied.status, 403);
  const accepted = await handler.fetch(new Request("https://runtime/v1/commerce/sync", { method: "POST", headers: { "x-tracekit-runtime-secret": "correct" }, body }), { ...env, CONTINUOUS_RUNTIME_SHARED_SECRET: "correct" });
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { ok: true, probe: "runtime-dispatch-probe", runtimeReached: true, authPassed: true, statusCode: 200 });
});

test("runtime requires connected Commas scope and explicit IDs", () => {
  assert.deepEqual(validateRuntimeScope({ provider: "commas", status: "connected", connectionId: message.connection_id, organizationId: message.organization_id, providerAccountId: message.provider_account_id }).provider, "commas");
  assert.throws(() => validateRuntimeScope({ provider: "shopify", status: "connected", connectionId: message.connection_id, organizationId: message.organization_id, providerAccountId: message.provider_account_id }), /provider_scope_invalid/);
  assert.throws(() => validateRuntimeScope({ provider: "commas", status: "pending", connectionId: message.connection_id, organizationId: message.organization_id, providerAccountId: message.provider_account_id }), /provider_scope_invalid/);
  assert.throws(() => validateRuntimeScope(undefined), /scope_unavailable/);
});

test("bootstrap message is Commas-only and cannot become deep reconciliation", () => {
  assert.equal(validateRuntimeMessage(message).bootstrap, true);
  assert.throws(() => validateRuntimeMessage({ ...message, provider: "shopify" }), /invalid_queue_message/);
  assert.throws(() => validateRuntimeMessage({ ...message, requested_mode: "deep_reconciliation", job_type: "commerce_deep_reconciliation" }), /invalid_queue_message/);
});
