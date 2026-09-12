import test from "node:test";
import assert from "node:assert/strict";

import { advanceShopifyBulkBackfill } from "../lib/commerce/shopify-core/bulk-runtime";
import type { ShopifyBulkOperation } from "../lib/commerce/shopify-core/bulk-reader";

const scope = {
  organizationId: "org-1",
  connectionId: "conn-1",
  providerAccountId: "acct-1",
  resource: "customers" as const,
  historicalCutoff: "2026-01-01T00:00:00Z",
};

function operation(overrides: Partial<ShopifyBulkOperation> = {}): ShopifyBulkOperation {
  return {
    id: "gid://shopify/BulkOperation/1",
    status: "RUNNING",
    errorCode: null,
    objectCount: "0",
    fileSize: null,
    url: null,
    partialDataUrl: null,
    createdAt: "2026-09-11T00:00:00Z",
    completedAt: null,
    ...overrides,
  };
}

function stateStore(latest: any = null) {
  const updates: any[] = [];
  const creates: any[] = [];
  return {
    updates,
    creates,
    store: {
      async latest() { return latest; },
      async create(_scope: any, metadata: any) {
        creates.push(metadata);
        return { id: "run-1", status: "running", metadata };
      },
      async update(_scope: any, runId: string, body: any) {
        updates.push({ runId, body });
      },
    },
  };
}

test("starts and persists a new Shopify bulk operation", async () => {
  const state = stateStore();
  const result = await advanceShopifyBulkBackfill({
    ...scope,
    reader: {
      async start() { return operation({ status: "CREATED" }); },
      async current() { return null; },
      async download() { return ""; },
    },
    store: state.store,
    writer: async () => {},
  });
  assert.equal(result.outcome, "started");
  assert.equal(state.creates.length, 1);
  assert.equal(state.creates[0].bulk_operation_id, "gid://shopify/BulkOperation/1");
  assert.equal(state.creates[0].historical_cutoff, "2026-01-01T00:00:00.000Z");
});

test("persists waiting status for an in-progress operation", async () => {
  const state = stateStore({
    id: "run-1",
    status: "running",
    metadata: { bulk_operation_id: "gid://shopify/BulkOperation/1", historical_cutoff: "2026-01-01T00:00:00.000Z" },
  });
  const result = await advanceShopifyBulkBackfill({
    ...scope,
    reader: {
      async start() { throw new Error("should not start"); },
      async current() { return operation({ status: "RUNNING", objectCount: "42" }); },
      async download() { return ""; },
    },
    store: state.store,
    writer: async () => {},
  });
  assert.equal(result.outcome, "waiting");
  assert.equal(state.updates[0].body.metadata.bulk_object_count, "42");
});

test("downloads, normalizes, writes, and completes a finished bulk operation", async () => {
  const state = stateStore({
    id: "run-1",
    status: "running",
    metadata: { bulk_operation_id: "gid://shopify/BulkOperation/1", historical_cutoff: "2026-01-01T00:00:00.000Z" },
  });
  const writes: any[] = [];
  const result = await advanceShopifyBulkBackfill({
    ...scope,
    reader: {
      async start() { throw new Error("should not start"); },
      async current() { return operation({ status: "COMPLETED", objectCount: "2", url: "https://storage.example/result.jsonl", completedAt: "2026-09-11T00:01:00Z" }); },
      async download() {
        return [
          JSON.stringify({ id: "gid://shopify/Customer/1", email: "a@example.com", updatedAt: "2025-12-01T00:00:00Z" }),
          JSON.stringify({ id: "gid://shopify/Customer/2", email: "b@example.com", updatedAt: "2025-12-02T00:00:00Z" }),
        ].join("\n");
      },
    },
    store: state.store,
    writer: async (records, provenance) => writes.push({ records, provenance }),
  });
  assert.equal(result.outcome, "complete");
  assert.equal(result.records, 2);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].records[0].providerObjectId, "gid://shopify/Customer/1");
  assert.equal(writes[0].provenance.syncRunId, "run-1");
  assert.equal(state.updates[state.updates.length - 1].body.status, "completed");
  assert.equal(state.updates[state.updates.length - 1].body.records_seen, 2);
});

test("marks failed Shopify bulk operations failed without writing records", async () => {
  const state = stateStore({
    id: "run-1",
    status: "running",
    metadata: { bulk_operation_id: "gid://shopify/BulkOperation/1", historical_cutoff: "2026-01-01T00:00:00.000Z" },
  });
  let wrote = false;
  const result = await advanceShopifyBulkBackfill({
    ...scope,
    reader: {
      async start() { throw new Error("should not start"); },
      async current() { return operation({ status: "FAILED", errorCode: "INTERNAL_SERVER_ERROR" }); },
      async download() { return ""; },
    },
    store: state.store,
    writer: async () => { wrote = true; },
  });
  assert.equal(result.outcome, "failed");
  assert.equal(wrote, false);
  assert.equal(state.updates[0].body.status, "failed");
  assert.equal(state.updates[0].body.last_error_code, "INTERNAL_SERVER_ERROR");
});

test("returns complete without restarting a matching completed run", async () => {
  const state = stateStore({
    id: "run-1",
    status: "completed",
    metadata: { historical_cutoff: "2026-01-01T00:00:00.000Z", records_seen: 77 },
  });
  const result = await advanceShopifyBulkBackfill({
    ...scope,
    reader: {
      async start() { throw new Error("should not start"); },
      async current() { throw new Error("should not inspect"); },
      async download() { throw new Error("should not download"); },
    },
    store: state.store,
    writer: async () => { throw new Error("should not write"); },
  });
  assert.equal(result.outcome, "complete");
  assert.equal(result.alreadyComplete, true);
  assert.equal(result.records, 77);
});

test("rejects a mismatched Shopify current bulk operation", async () => {
  const state = stateStore({
    id: "run-1",
    status: "running",
    metadata: { bulk_operation_id: "gid://shopify/BulkOperation/1", historical_cutoff: "2026-01-01T00:00:00.000Z" },
  });
  await assert.rejects(() => advanceShopifyBulkBackfill({
    ...scope,
    reader: {
      async start() { throw new Error("should not start"); },
      async current() { return operation({ id: "gid://shopify/BulkOperation/OTHER" }); },
      async download() { return ""; },
    },
    store: state.store,
    writer: async () => {},
  }), /no longer matches/);
});
