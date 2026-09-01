import assert from "node:assert/strict";
import test from "node:test";
import { runNext29HistoricalOrders } from "./connectors/next29/historical-sync.ts";
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

test("29Next historical ingestion follows cursor pagination but stops at maxOrders", async () => {
  const evidence = memoryEvidenceSink();
  const repo = persistence();
  let page = 0;
  const client = {
    apiVersion: "2024-04-01",
    async listOrders(input: any) {
      page += 1;
      if (page === 1) return { results: [{ number: "1" }, { number: "2" }], next: "https://demo.29next.store/api/admin/orders/?cursor=abc", previous: null, providerRequestId: null, correlationId: "c", rateLimit: { limit: 4, remaining: 3, retryAfterMs: null } };
      assert.equal(input.cursor, "abc");
      return { results: [{ number: "3" }], next: null, previous: null, providerRequestId: null, correlationId: "c", rateLimit: { limit: 4, remaining: 3, retryAfterMs: null } };
    },
    async getOrder(number: string) { return { item: order(number), providerRequestId: null, correlationId: "c" }; },
  };
  const result = await runNext29HistoricalOrders({ organizationId: "org", connectionId: "conn", providerAccountId: "acct", client, evidenceSink: evidence, persistence: repo, maxOrders: 2 });
  assert.equal(result.records, 2);
  assert.equal(result.pages, 1);
  assert.equal(page, 1);
  assert.equal(repo.calls.filter(([kind]) => kind === "order").length, 2);
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
