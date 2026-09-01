import assert from "node:assert/strict";
import test from "node:test";
import { Next29Client } from "./connectors/next29/client.ts";
import { runNext29HistoricalSubscriptions } from "./connectors/next29/subscription-historical-sync.ts";
import { createNext29SubscriptionPersistence, next29SubscriptionOrderLinkRow, next29SubscriptionRow } from "./connectors/next29/subscription-repository.ts";
import type { Next29EvidenceSink } from "./connectors/next29/types.ts";

function subscription(id = "sub-1") {
  return {
    id,
    status: "active",
    currency: "usd",
    total: "39.99",
    interval: "month",
    interval_count: 1,
    next_renewal_date: "2026-09-15T12:00:00Z",
    date_created: "2026-08-15T12:00:00Z",
    user: { id: "cust-1" },
    lines: [{ id: "line-1", product_id: "prod-1", variant_id: "var-1", quantity: 1, price: "39.99" }],
    orders: [{ order_number: "1001", billing_cycle: 1 }, { order_number: "1002", billing_cycle: 2 }],
    attribution: { subaffiliate1: "ef-tid" },
  };
}

function evidenceSink(): Next29EvidenceSink & { writes: any[] } {
  const writes: any[] = [];
  return { writes, async putImmutable(input) { writes.push(input); return { storageReference: `memory://${input.sourceObjectId}`, payloadHash: `hash-${input.sourceObjectId}`, byteSize: input.payload.byteLength }; } };
}

function persistence() {
  const calls: any[] = [];
  return {
    calls,
    async beginRun(input: any) { calls.push(["begin", input]); return { syncRunId: "run-sub" }; },
    async persistSubscription(input: any) { calls.push(["subscription", input]); },
    async appendCheckpoint(input: any) { calls.push(["checkpoint", input]); },
    async completeRun(input: any) { calls.push(["complete", input]); },
    async failRun(input: any) { calls.push(["fail", input]); },
  };
}

test("29Next client reads subscription list and detail with stable auth contract", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new Next29Client({ store: "demo", accessToken: "secret", maxAttempts: 1 }, {
    fetch: async (url, init) => {
      requests.push({ url: String(url), init });
      const body = String(url).includes("subscriptions/sub-1/") ? subscription() : { results: [{ id: "sub-1" }], next: null, previous: null };
      return new Response(JSON.stringify(body), { status: 200 });
    },
    correlationId: () => "corr",
  });
  const page = await client.listSubscriptions();
  const detail = await client.getSubscription("sub-1");
  assert.equal(page.results[0].id, "sub-1");
  assert.equal(detail.item.id, "sub-1");
  assert.match(requests[0].url, /\/api\/admin\/subscriptions\/$/);
  assert.match(requests[1].url, /\/api\/admin\/subscriptions\/sub-1\/$/);
  assert.equal(new Headers(requests[0].init?.headers).get("Authorization"), "Bearer secret");
  assert.equal(new Headers(requests[0].init?.headers).get("X-29Next-Api-Version"), "2024-04-01");
});

test("29Next bounded subscription ingestion writes detail evidence and canonical input", async () => {
  const sink = evidenceSink();
  const repo = persistence();
  const client = {
    apiVersion: "2024-04-01",
    async listSubscriptions() { return { results: [{ id: "sub-1" }], next: null, previous: null, providerRequestId: null, correlationId: "c", rateLimit: { limit: 4, remaining: 3, retryAfterMs: null } }; },
    async getSubscription() { return { item: subscription(), providerRequestId: null, correlationId: "c" }; },
  };
  const result = await runNext29HistoricalSubscriptions({ organizationId: "org", connectionId: "conn", providerAccountId: "acct", client, evidenceSink: sink, persistence: repo, observedAt: () => "2026-09-01T00:00:00Z" });
  assert.equal(result.records, 1);
  assert.equal(result.hasMore, false);
  assert.equal(sink.writes[0].sourceObjectType, "next29_subscription");
  const write = repo.calls.find(([kind]) => kind === "subscription")[1];
  assert.equal(write.normalized.providerSubscriptionId, "sub-1");
  assert.equal(write.normalized.renewalOrders.length, 2);
});

test("29Next subscription ingestion returns resume cursor when bounded", async () => {
  let reads = 0;
  const client = {
    apiVersion: "2024-04-01",
    async listSubscriptions() { reads += 1; return { results: [{ id: "sub-1" }, { id: "sub-2" }], next: "https://demo.29next.store/api/admin/subscriptions/?cursor=next-sub", previous: null, providerRequestId: null, correlationId: "c", rateLimit: { limit: 4, remaining: 3, retryAfterMs: null } }; },
    async getSubscription(id: string) { return { item: subscription(id), providerRequestId: null, correlationId: "c" }; },
  };
  const result = await runNext29HistoricalSubscriptions({ organizationId: "org", connectionId: "conn", providerAccountId: "acct", client, evidenceSink: evidenceSink(), persistence: persistence(), maxSubscriptions: 1 });
  assert.equal(result.records, 1);
  assert.equal(result.hasMore, true);
  assert.equal(result.resumeCursor, "next-sub");
  assert.equal(reads, 1);
});

test("29Next subscription ingestion fails closed on list/detail identity mismatch", async () => {
  const repo = persistence();
  const client = { apiVersion: "2024-04-01", async listSubscriptions() { return { results: [{ id: "sub-1" }], next: null, previous: null, providerRequestId: null, correlationId: "c", rateLimit: { limit: 4, remaining: 3, retryAfterMs: null } }; }, async getSubscription() { return { item: subscription("other"), providerRequestId: null, correlationId: "c" }; } };
  await assert.rejects(() => runNext29HistoricalSubscriptions({ organizationId: "org", connectionId: "conn", providerAccountId: "acct", client, evidenceSink: evidenceSink(), persistence: repo }), /identity does not match/);
  assert.equal(repo.calls.filter(([kind]) => kind === "fail").length, 1);
});

test("29Next subscription persistence links resolved rebills and retains unresolved orders", async () => {
  const calls: any[] = [];
  const repository = createNext29SubscriptionPersistence({
    async createSubscriptionRun() { return { id: "run" }; }, async appendSubscriptionCheckpoint() {}, async finishSubscriptionRun() {}, async failSubscriptionRun() {},
    async ensureSubscriptionEvidence() { calls.push("evidence"); return { evidenceId: "ev" }; },
    async ensureSubscriptionSourceMapping() { calls.push("mapping"); return { id: "map", canonicalObjectId: "canonical-sub" }; },
    async upsertSubscription() { calls.push("subscription"); }, async replaceSubscriptionLines() { calls.push("lines"); },
    async resolveCanonicalOrder(input) { calls.push(["resolve", input.providerOrderId]); return input.providerOrderId === "1001" ? { canonicalOrderId: "order-1" } : null; },
    async upsertSubscriptionOrderLink(input) { calls.push(["link", input.providerOrderId, input.canonicalOrderId]); },
  });
  await repository.persistSubscription({ organizationId: "org", connectionId: "conn", providerAccountId: "acct", syncRunId: "run", normalized: (await import("./connectors/next29/subscription.ts")).normalizeNext29Subscription(subscription()), evidence: { storageReference: "obj", payloadHash: "hash", byteSize: 1 }, rawSubscription: subscription() });
  assert.deepEqual(calls, ["evidence", "mapping", "subscription", "lines", ["resolve", "1001"], ["link", "1001", "order-1"], ["resolve", "1002"], ["link", "1002", null]]);
});

test("29Next subscription rows preserve pending rebill reconciliation without guessing", async () => {
  const normalized = (await import("./connectors/next29/subscription.ts")).normalizeNext29Subscription(subscription());
  const row = next29SubscriptionRow({ organizationId: "org", connectionId: "conn", providerAccountId: "acct", accountId: "account", normalized, canonicalSubscriptionId: "sub", sourceMappingId: "map", evidenceId: "ev", observedAt: "2026-09-01T00:00:00Z" });
  assert.equal(row.status, "active");
  assert.equal(row.interval_unit, "month");
  const link = next29SubscriptionOrderLinkRow({ organizationId: "org", connectionId: "conn", providerAccountId: "acct", canonicalSubscriptionId: "sub", providerOrderId: "1002", canonicalOrderId: null, billingCycle: 2, evidenceId: "ev", observedAt: "2026-09-01T00:00:00Z" });
  assert.equal(link.canonical_order_id, null);
  assert.equal((link.metadata as any).reconciliation_state, "pending_order");
});
