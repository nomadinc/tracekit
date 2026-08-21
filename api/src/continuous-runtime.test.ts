import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { unstable_readConfig } from "wrangler";
import runtime, { validateRuntimeMessage, validateRuntimeScope } from "../continuous-runtime/src/index.ts";

const id = "11111111-1111-4111-8111-111111111111";
const message = { schema_version: 1, job_type: "commerce_continuous", provider: "commas", account_id: id, organization_id: id, connection_id: id, provider_account_id: id, resource: "transactions", requested_mode: "continuous", scheduler_identity: "schedule:bucket", requested_at: "2026-08-10T00:00:00Z" } as const;
const config = unstable_readConfig({ config: new URL("../continuous-runtime/wrangler.toml", import.meta.url).pathname });

test("runtime configuration is inert and has no scheduler or queue bindings", () => {
  assert.equal(config.vars?.TRACEKIT_COMMERCE_SCHEDULER_ENABLED, "false");
  assert.equal(config.vars?.TRACEKIT_COMMERCE_KILL_SWITCH, "disabled");
  assert.equal(config.triggers?.crons, undefined);
  assert.deepEqual(config.queues, { producers: [], consumers: [] });
});

test("startup and disabled invocation cannot call a provider", async () => {
  const startup = await runtime.fetch(new Request("https://runtime/"), { TRACEKIT_COMMERCE_SCHEDULER_ENABLED: "false", TRACEKIT_COMMERCE_KILL_SWITCH: "disabled" });
  assert.equal(startup.status, 404);
  const disabled = await runtime.fetch(new Request("https://runtime/v1/commerce/sync", { method: "POST", headers: { "x-tracekit-runtime-secret": "test-only" }, body: JSON.stringify(message) }), { TRACEKIT_COMMERCE_SCHEDULER_ENABLED: "false", TRACEKIT_COMMERCE_KILL_SWITCH: "disabled", CONTINUOUS_RUNTIME_SHARED_SECRET: "test-only" });
  assert.equal(disabled.status, 503);
  assert.match(await disabled.text(), /continuous_runtime_disabled/);
});

test("direct invocation rejects missing and non-Commas scope", () => {
  assert.throws(() => validateRuntimeScope(undefined), /scope_unavailable/);
  assert.throws(() => validateRuntimeScope({ provider: "shopify", status: "connected", connectionId: id, organizationId: id, providerAccountId: id }), /provider_scope_invalid/);
  assert.throws(() => validateRuntimeScope({ provider: "commas", status: "connected", connectionId: id }), /provider_scope_invalid/);
  assert.deepEqual(validateRuntimeScope({ provider: "commas", status: "connected", connectionId: id, organizationId: id, providerAccountId: id }).provider, "commas");
});

test("runtime message contract cannot request live activation", () => {
  assert.deepEqual(validateRuntimeMessage(message), message);
  assert.throws(() => validateRuntimeMessage({ ...message, requested_mode: "live" }), /invalid_queue_message/);
  assert.doesNotMatch(readFileSync(new URL("../continuous-runtime/src/index.ts", import.meta.url), "utf8"), /commerce_provider_connections|platform_orders|live_beta|workspace_repository/);
});
