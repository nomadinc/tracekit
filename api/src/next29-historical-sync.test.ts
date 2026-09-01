import assert from "node:assert/strict";
import test from "node:test";
import { runNext29HistoricalOrders } from "./connectors/next29/historical-sync.ts";
import { createNext29HistoricalPersistence, next29PlatformOrderRow } from "./connectors/next29/repository.ts";
import type { Next29EvidenceSink } from "./connectors/next29/types.ts";

function order(number: string) {
  return {
    number,
    created_at: "2026-08-01T12:00:00Z",
    updated_at: "2026-08-01T12:05:00Z",
    currency: "usd",
    status: "completed",
    payment_status: "paid",
    total_incl_tax: "39.99",
    total_excl_tax: "36.99",
    total_tax: "3.00",
    total_discount: "5.00",
    attribution: { affiliate: "42", subaffiliate1: "ef-tid", utm_source: "affiliate" },
  };
}

function memoryEvidenceSink(): Next29EvidenceSink & { writes: any[] } {
  const writes: any[] = [];
  return {
    writes,
    async putImmutable(input) {
      writes.push(input);
      return { storageReference: `memory://${input.organizationId}/${input.sourceObjectId}`, payloadHash: `hash-${input.sourceObjectId}`, byteSize: input.payload.byteLength };
    },
  };
}

function persistence() {
  const calls: any[] = [];
  return {
    calls,
    async beginRun(input: any) { calls.push(["begin", input]); return { syncRunId: "run-1" }; },
    async persistOrder(input: any) { calls.push(["order", input]); },
    async appendCheckpoint(input: any) { calls.push(["checkpoint", input]); },
    async completeRun(input: any) { calls.push(["complete", input]); },
    async failRun(input: any) { calls.push(["fail", input]); },
  };
}

test("29Next historical ingestion persists detail evidence and canonical-order inputs with tenant scope", async () => {
  const evidence = memoryEvidenceSink();
  const repo = persistence();
  const listed: any[] = [];
  const client = {
    apiVersion: "2024-04-01",
    async listOrders(input: any) {
      listed.push(input);
      return { results: [{ number: "1001" }], next: null, previous: null, providerRequestId: null, correlationId: "c", rateLimit: { limit: 4, remaining: 3, retryAfterMs: null } };
    },
    async getOrder(number: string) { return { item: order(number), providerRequestId: null, correlationId: "c" }; },
  };

  const result = await runNext29HistoricalOrders({
    organizationId: "org-1",
    connectionId: "conn-1",
    providerAccountId: "acct-1",
    client,
    evidenceSink: evidence,
    persistence: repo,
    observedAt: () => "2026-09-01T00:00:00Z",
  });

  assert.equal(result.records, 1);
  assert.equal(result.pages, 1);
  assert.equal(result.bounded, true);
  assert.equal(result.hasMore, false);
  assert.equal(result.resumeCursor, null);
  assert.equal(evidence.writes.length, 1);
  assert.equal(evidence.writes[0].organizationId, "org-1");
  assert.equal(evidence.writes[0].sourceObjectType, "next29_order");
  const write = repo.calls.find(([kind]) => kind === "order")[1];
  assert.equal(write.normalized.platformOrderId, "next29:1001");
  assert.equal(write.normalized.currency, "USD");
  assert.equal(write.normalized.grossAmount, 39.99);
  assert.equal(write.normalized.attribution.subaffiliate1, "ef-tid");
  assert.equal(write.evidence.payloadHash, "hash-1001");
  assert.deepEqual(listed[0], { cursor: null, query: undefined });
});

test("29Next historical ingestion stops at maxOrders and returns a durable resume cursor", async () => {
  const evidence = memoryEvidenceSink();
  const repo = persistence();
  let page = 0;
  const client = {
    apiVersion: "2024-04-01",
    async listOrders() {
      page += 1;
      return { results: [{ number: "1" }, { number: "2" }], next: "https://demo.29next.store/api/admin/orders/?cursor=abc", previous: null, providerRequestId: null, correlationId: "c", rateLimit: { limit: 4, remaining: 3, retryAfterMs: null } };
    },
    async getOrder(number: string) { return { item: order(number), providerRequestId: null, correlationId: "c" }; },
  };
  const result = await runNext29HistoricalOrders({ organizationId: "org", connectionId: "conn", providerAccountId: "acct", client, evidenceSink: evidence, persistence: repo, maxOrders: 2 });
  assert.equal(result.records, 2);
  assert.equal(result.pages, 1);
  assert.equal(result.hasMore, true);
  assert.equal(result.resumeCursor, "abc");
  assert.equal(page, 1);
  assert.equal(repo.calls.filter(([kind]) => kind === "order").length, 2);
});

test("29Next historical ingestion resumes from a prior cursor without replaying first-page query filters", async () => {
  const repo = persistence();
  let received: any = null;
  const client = {
    apiVersion: "2024-04-01",
    async listOrders(input: any) {
      received = input;
      return { results: [], next: null, previous: null, providerRequestId: null, correlationId: "c", rateLimit: { limit: 4, remaining: 3, retryAfterMs: null } };
    },
    async getOrder() { throw new Error("not called"); },
  };
  const result = await runNext29HistoricalOrders({ organizationId: "org", connectionId: "conn", providerAccountId: "acct", client, evidenceSink: memoryEvidenceSink(), persistence: repo, startCursor: "resume-1", query: { status: "complete" } });
  assert.deepEqual(received, { cursor: "resume-1", query: undefined });
  assert.equal(result.records, 0);
});

test("29Next historical ingestion fails closed when list and detail order identities disagree", async () => {
  const repo = persistence();
  const client = {
    apiVersion: "2024-04-01",
    async listOrders() { return { results: [{ number: "1001" }], next: null, previous: null, providerRequestId: null, correlationId: "c", rateLimit: { limit: 4, remaining: 3, retryAfterMs: null } }; },
    async getOrder() { return { item: order("different"), providerRequestId: null, correlationId: "c" }; },
  };
  await assert.rejects(() => runNext29HistoricalOrders({ organizationId: "org", connectionId: "conn", providerAccountId: "acct", client, evidenceSink: memoryEvidenceSink(), persistence: repo }), /identity does not match/);
  assert.equal(repo.calls.filter(([kind]) => kind === "fail").length, 1);
  assert.equal(repo.calls.filter(([kind]) => kind === "complete").length, 0);
});

test("29Next historical ingestion rejects unsafe bounds before provider reads", async () => {
  let reads = 0;
  const client = { apiVersion: "2024-04-01", async listOrders() { reads += 1; throw new Error("unreachable"); }, async getOrder() { throw new Error("unreachable"); } };
  await assert.rejects(() => runNext29HistoricalOrders({ organizationId: "org", connectionId: "conn", providerAccountId: "acct", client, evidenceSink: memoryEvidenceSink(), persistence: persistence(), maxPages: 26 }), /between 1 and 25/);
  assert.equal(reads, 0);
});

test("29Next commerce persistence writes Evidence and source mapping before canonical expansion", async () => {
  const calls: string[] = [];
  const repository = createNext29HistoricalPersistence({
    async createHistoricalRun() { calls.push("run"); return { id: "run-1" }; },
    async appendHistoricalCheckpoint() { calls.push("checkpoint"); },
    async finishHistoricalRun() { calls.push("complete"); },
    async failHistoricalRun() { calls.push("fail"); },
    async ensureOrderEvidence() { calls.push("evidence"); return { evidenceId: "ev-1" }; },
    async ensureOrderSourceMapping() { calls.push("mapping"); return { id: "map-1", canonicalObjectId: "order-1" }; },
    async upsertPlatformOrder(input) {
      calls.push("order");
      const row = next29PlatformOrderRow(input);
      assert.equal(row.platform, "next29");
      assert.equal(row.canonical_order_id, "order-1");
      assert.equal(row.source_mapping_id, "map-1");
      assert.equal(row.evidence_id, "ev-1");
      assert.equal((row.metadata as any).attribution.subaffiliate1, "ef-tid");
    },
    async upsertOrderLines() { calls.push("lines"); },
    async upsertCustomerIdentity() { calls.push("customer"); },
    async upsertTransactions() { calls.push("transactions"); },
    async upsertRefunds() { calls.push("refunds"); },
  });
  const normalized = {
    sourceObjectId: "1001", providerUpdatedAt: "2026-08-01T12:05:00.000Z", platformOrderId: "next29:1001", orderId: "1001", orderTs: "2026-08-01T12:00:00.000Z", status: "completed", statusNorm: "completed", currency: "USD", grossAmount: 39.99, productSubtotal: 36.99, taxAmount: 3, discountAmount: 5, isTest: false, attribution: { subaffiliate1: "ef-tid" },
  };
  await repository.beginRun({ organizationId: "org", connectionId: "conn", providerAccountId: "acct", resource: "orders", checkpoint: { page: 1, next: null, lastSourceObjectId: null } });
  await repository.persistOrder({ organizationId: "org", connectionId: "conn", providerAccountId: "acct", syncRunId: "run-1", normalized, evidence: { storageReference: "obj://1", payloadHash: "hash", byteSize: 12 }, rawOrder: order("1001") });
  assert.deepEqual(calls, ["run", "evidence", "mapping", "order", "lines", "customer", "transactions", "refunds"]);
});
