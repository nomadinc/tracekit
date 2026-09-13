import assert from "node:assert/strict";
import test from "node:test";
import { advanceShopifyBulkBackfill } from "../lib/commerce/shopify-core/bulk-runtime";

const cutoff = "2026-09-12T23:20:00.000Z";
const scope = {
  organizationId: "org_test",
  connectionId: "conn_test",
  providerAccountId: "shop_test",
  resource: "customers" as const,
  historicalCutoff: cutoff,
};

function operation(overrides: Record<string, unknown> = {}) {
  return {
    id: "gid://shopify/BulkOperation/123",
    status: "COMPLETED",
    errorCode: null,
    objectCount: "10",
    fileSize: "1000",
    url: "https://example.com/result.jsonl",
    partialDataUrl: null,
    createdAt: cutoff,
    completedAt: cutoff,
    ...overrides,
  } as any;
}

test("missing persisted Shopify operation is durably failed so the next pass can restart", async () => {
  let latest: any = {
    id: "run_stale",
    status: "running",
    metadata: {
      bulk_operation_id: "gid://shopify/BulkOperation/stale",
      bulk_status: "CREATED",
      historical_cutoff: cutoff,
    },
  };
  const updates: Array<Record<string, unknown>> = [];
  let starts = 0;
  let creates = 0;

  const store = {
    async latest() { return latest; },
    async create(_scope: unknown, metadata: Record<string, unknown>) {
      creates += 1;
      latest = { id: "run_restarted", status: "running", metadata };
      return latest;
    },
    async update(_scope: unknown, _runId: string, body: Record<string, unknown>) {
      updates.push(body);
      latest = { ...latest, status: body.status || latest.status, metadata: body.metadata || latest.metadata };
    },
  } as any;

  const reader = {
    async start() {
      starts += 1;
      return operation({ id: "gid://shopify/BulkOperation/restarted", status: "CREATED", url: null, completedAt: null });
    },
    async get() { return null; },
    async download() { throw new Error("download should not run"); },
  } as any;

  const failed = await advanceShopifyBulkBackfill({ ...scope, store, reader, writer: async () => {} });
  assert.equal(failed.outcome, "failed");
  assert.equal(failed.status, "UNAVAILABLE");
  assert.equal((failed as any).errorCode, "shopify_bulk_operation_unavailable");
  assert.equal(starts, 0);
  assert.equal(creates, 0);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].status, "failed");
  assert.equal(updates[0].last_error_code, "shopify_bulk_operation_unavailable");
  assert.equal((updates[0].metadata as any).bulk_operation_id, "gid://shopify/BulkOperation/stale");
  assert.equal((updates[0].metadata as any).bulk_status, "UNAVAILABLE");

  const restarted = await advanceShopifyBulkBackfill({ ...scope, store, reader, writer: async () => {} });
  assert.equal(restarted.outcome, "started");
  assert.equal(starts, 1);
  assert.equal(creates, 1);
  assert.equal(restarted.operationId, "gid://shopify/BulkOperation/restarted");
});

test("completed Shopify operation without result URL is durably failed when objects exist", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const store = {
    async latest() {
      return {
        id: "run_missing_url",
        status: "running",
        metadata: {
          bulk_operation_id: "gid://shopify/BulkOperation/123",
          bulk_status: "RUNNING",
          historical_cutoff: cutoff,
        },
      };
    },
    async create() { throw new Error("create should not run"); },
    async update(_scope: unknown, _runId: string, body: Record<string, unknown>) { updates.push(body); },
  } as any;
  const reader = {
    async start() { throw new Error("start should not run"); },
    async get() { return operation({ objectCount: "10", url: null }); },
    async download() { throw new Error("download should not run"); },
  } as any;

  const result = await advanceShopifyBulkBackfill({ ...scope, store, reader, writer: async () => {} });
  assert.equal(result.outcome, "failed");
  assert.equal(result.status, "COMPLETED");
  assert.equal((result as any).errorCode, "shopify_bulk_result_url_missing");
  assert.equal(updates.length, 1);
  assert.equal(updates[0].status, "failed");
  assert.equal(updates[0].last_error_code, "shopify_bulk_result_url_missing");
  assert.equal(updates[0].last_error_summary, "Completed Shopify bulk operation is missing its result URL.");
});

test("completed zero-object Shopify operation without result URL is a successful empty backfill", async () => {
  const updates: Array<Record<string, unknown>> = [];
  let downloads = 0;
  let writes = 0;
  const store = {
    async latest() {
      return {
        id: "run_empty",
        status: "running",
        metadata: {
          bulk_operation_id: "gid://shopify/BulkOperation/123",
          bulk_status: "RUNNING",
          historical_cutoff: cutoff,
        },
      };
    },
    async create() { throw new Error("create should not run"); },
    async update(_scope: unknown, _runId: string, body: Record<string, unknown>) { updates.push(body); },
  } as any;
  const reader = {
    async start() { throw new Error("start should not run"); },
    async get() { return operation({ objectCount: "0", fileSize: null, url: null }); },
    async download() { downloads += 1; return ""; },
  } as any;

  const result = await advanceShopifyBulkBackfill({
    ...scope,
    store,
    reader,
    writer: async () => { writes += 1; },
  });

  assert.equal(result.outcome, "complete");
  assert.equal(result.records, 0);
  assert.equal(result.alreadyComplete, false);
  assert.equal(downloads, 0);
  assert.equal(writes, 0);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].status, "completed");
  assert.equal(updates[0].records_seen, 0);
  assert.equal(updates[0].last_error_code, null);
  assert.equal(updates[0].last_error_summary, null);
  assert.equal((updates[0].metadata as any).bulk_status, "COMPLETED");
  assert.equal((updates[0].metadata as any).bulk_object_count, "0");
  assert.equal((updates[0].metadata as any).records_seen, 0);
});
