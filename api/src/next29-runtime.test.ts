import assert from "node:assert/strict";
import test from "node:test";
import { NEXT29_RUNTIME_CAPABILITIES, next29RuntimeCapability, runNext29BoundedBackfill } from "./connectors/next29/runtime.ts";

function page() { return { results: [], next: null, previous: null, providerRequestId: null, correlationId: "c", rateLimit: { limit: 4, remaining: 3, retryAfterMs: null } }; }
function evidenceSink() { return { async putImmutable(input: any) { return { storageReference: "mem://unused", payloadHash: "hash", byteSize: input.payload.byteLength }; } }; }
function persistence(resource: string, calls: string[]) {
  return {
    async beginRun() { calls.push(`${resource}:begin`); return { syncRunId: `run-${resource}` }; },
    async persistOrder() { calls.push(`${resource}:record`); },
    async persistSubscription() { calls.push(`${resource}:record`); },
    async persistDispute() { calls.push(`${resource}:record`); },
    async appendCheckpoint() { calls.push(`${resource}:checkpoint`); },
    async completeRun() { calls.push(`${resource}:complete`); },
    async failRun() { calls.push(`${resource}:fail`); },
  } as any;
}

function runtimeArgs(calls: string[] = []) {
  return {
    organizationId: "org",
    connectionId: "conn",
    providerAccountId: "acct",
    client: {
      apiVersion: "2024-04-01",
      async listOrders() { calls.push("orders:list"); return page(); },
      async getOrder() { throw new Error("unexpected order detail"); },
      async listSubscriptions() { calls.push("subscriptions:list"); return page(); },
      async getSubscription() { throw new Error("unexpected subscription detail"); },
      async listDisputes() { calls.push("disputes:list"); return page(); },
      async getDispute() { throw new Error("unexpected dispute detail"); },
    },
    evidenceSink: evidenceSink(),
    persistence: {
      orders: persistence("orders", calls),
      subscriptions: persistence("subscriptions", calls),
      disputes: persistence("disputes", calls),
    },
  } as any;
}

test("29Next runtime publishes one explicit provider capability manifest", () => {
  assert.deepEqual(NEXT29_RUNTIME_CAPABILITIES.map((entry) => entry.resource), ["orders", "subscriptions", "disputes", "webhooks"]);
  assert.equal(next29RuntimeCapability("orders")?.get, true);
  assert.equal(next29RuntimeCapability("webhooks")?.list, false);
  assert.equal(next29RuntimeCapability("unknown"), null);
});

test("29Next bounded runtime converges orders subscriptions and disputes through one operator surface", async () => {
  const calls: string[] = [];
  const result = await runNext29BoundedBackfill(runtimeArgs(calls));
  assert.equal(result.provider, "next29");
  assert.equal(result.bounded, true);
  assert.deepEqual(Object.keys(result.resources), ["orders", "subscriptions", "disputes"]);
  assert.deepEqual(result.totals, { pages: 3, records: 0 });
  assert.deepEqual(calls.filter((call) => call.endsWith(":list")), ["orders:list", "subscriptions:list", "disputes:list"]);
});

test("29Next bounded runtime can target one resource without activating others", async () => {
  const calls: string[] = [];
  const result = await runNext29BoundedBackfill({ ...runtimeArgs(calls), resources: ["disputes"] });
  assert.deepEqual(Object.keys(result.resources), ["disputes"]);
  assert.deepEqual(calls.filter((call) => call.endsWith(":list")), ["disputes:list"]);
});

test("29Next bounded runtime rejects unsafe shared bounds before provider reads", async () => {
  const calls: string[] = [];
  await assert.rejects(
    () => runNext29BoundedBackfill({ ...runtimeArgs(calls), bounds: { maxPagesPerResource: 26 } }),
    /between 1 and 25/,
  );
  assert.equal(calls.length, 0);
});

test("29Next bounded runtime de-duplicates requested resources deterministically", async () => {
  const calls: string[] = [];
  const result = await runNext29BoundedBackfill({ ...runtimeArgs(calls), resources: ["orders", "orders", "subscriptions"] });
  assert.deepEqual(Object.keys(result.resources), ["orders", "subscriptions"]);
  assert.deepEqual(calls.filter((call) => call.endsWith(":list")), ["orders:list", "subscriptions:list"]);
});
