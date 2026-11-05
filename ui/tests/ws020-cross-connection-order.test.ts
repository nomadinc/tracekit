import assert from "node:assert/strict";
import test from "node:test";
import { ProductionOrderRepository } from "../lib/orders/production-repository";

const scope: any = { authenticated: true, workspaceId: "tenant", organizationId: "tenant", businessContextId: "context", session: {} };
const orderA = { organization_id: "tenant", workspace_id: "tenant", platform: "shopify", connection_id: "connection-a", provider_account_id: "account-a", platform_order_id: "shopify:connection-a:account-a:101", order_id: "101", gross_amount: 42, currency: "USD" };
const orderB = { ...orderA, connection_id: "connection-b", provider_account_id: "account-b", platform_order_id: "shopify:connection-b:account-b:101" };

async function workspace(purchase: Record<string, unknown>, selectedOrder = orderA) {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), "https://ui.test");
    assert.equal(url.searchParams.get("workspace_id"), "tenant");
    if (url.pathname === "/api/customer-orders") {
      assert.equal(url.searchParams.get("order_id"), selectedOrder.platform_order_id);
      return Response.json({ orders: [{ order: selectedOrder, customer: { id: "customer" } }], next_offset: null });
    }
    if (!url.pathname.includes("/journeys/")) return Response.json({ customer: { id: "customer" }, journeys: [{ id: "journey" }], orders: [orderA, orderB] });
    return Response.json({ events: [
      { id: "click", event_type: "click", event_time: "2026-11-04T12:00:00Z" },
      { id: "purchase", event_type: "purchase", event_time: "2026-11-04T12:01:00Z", source_platform: "shopify", order_id: "101", ...purchase },
    ], page: { has_more: false } });
  };
  try {
    const result = await new ProductionOrderRepository().loadWorkspace(scope, selectedOrder.platform_order_id);
    assert.ok(result);
    assert.equal(result.order.id, selectedOrder.platform_order_id);
    return result;
  } finally { globalThis.fetch = previousFetch; }
}

test("production caller rejects a foreign canonical Order despite overlapping provider number", async (t) => {
  const result = await workspace({ platform_order_id: orderB.platform_order_id });
  t.diagnostic(JSON.stringify({ selectedOrder: result.order.id, eventOrder: orderB.platform_order_id, relationships: result.timeline[1].relationships, clickPurchaseDelta: result.attribution.clickPurchaseDelta }));
  assert.deepEqual(result.timeline[1].relationships, []);
  assert.doesNotMatch(result.timeline[1].context, /Order 101/);
  assert.equal(result.attribution.clickPurchaseDelta, "Not calculated");
});

test("production caller preserves the legitimate canonical Order association and navigation", async () => {
  for (const selected of [orderA, orderB]) {
    const result = await workspace({ platform_order_id: selected.platform_order_id }, selected);
    assert.deepEqual(result.timeline[1].relationships, [{ type: "Order", id: selected.platform_order_id, label: "101" }]);
    assert.equal(result.attribution.clickPurchaseDelta, "1m 0s");
  }
});

test("production caller rejects canonical conflicts in secondary technical evidence", async () => {
  const result = await workspace({ platform_order_id: orderA.platform_order_id, technical_evidence: { platform_order_id: orderB.platform_order_id } });
  assert.deepEqual(result.timeline[1].relationships, []);
  assert.equal(result.attribution.clickPurchaseDelta, "Not calculated");
});

test("production caller respects connection and provider account even when the canonical key matches", async () => {
  for (const conflict of [{ connection_id: "connection-b" }, { provider_account_id: "account-b" }]) {
    const result = await workspace({ platform_order_id: orderA.platform_order_id, ...conflict });
    assert.deepEqual(result.timeline[1].relationships, []);
    assert.equal(result.attribution.clickPurchaseDelta, "Not calculated");
  }
});

test("production caller allows number fallback only with matching connection and provider-account evidence", async () => {
  for (const provider of [{ source_platform: "shopify" }, { source_platform: undefined, platform: "shopify" }]) {
    const result = await workspace({ ...provider, connection_id: "connection-a", provider_account_id: "account-a" });
    assert.deepEqual(result.timeline[1].relationships, [{ type: "Order", id: orderA.platform_order_id, label: "101" }]);
    assert.equal(result.attribution.clickPurchaseDelta, "1m 0s");
  }
});

test("production caller never links overlapping numbers from another or an unidentified connection", async () => {
  for (const evidence of [{ connection_id: "connection-b", provider_account_id: "account-b" }, {}, { connection_id: "connection-a" }]) {
    const result = await workspace(evidence);
    assert.deepEqual(result.timeline[1].relationships, []);
    assert.equal(result.attribution.clickPurchaseDelta, "Not calculated");
  }
});

test("production caller requires all canonical identifier kinds to agree", async () => {
  const selected = { ...orderA, canonical_order_id: "canonical-a" };
  for (const evidence of [
    { platform_order_id: orderA.platform_order_id, canonical_order_id: "canonical-b" },
    { platform_order_id: orderA.platform_order_id, related_order_id: orderB.platform_order_id },
  ]) {
    const result = await workspace(evidence, selected);
    assert.deepEqual(result.timeline[1].relationships, []);
    assert.equal(result.attribution.clickPurchaseDelta, "Not calculated");
  }
  const valid = await workspace({ platform_order_id: orderA.platform_order_id, canonical_order_id: "canonical-a" }, selected);
  assert.equal(valid.timeline[1].relationships[0].id, orderA.platform_order_id);
});

test("production caller cannot fall back across provider accounts within one connection", async () => {
  const result = await workspace({ connection_id: "connection-a", provider_account_id: "account-b" });
  assert.deepEqual(result.timeline[1].relationships, []);
  assert.equal(result.attribution.clickPurchaseDelta, "Not calculated");
});

test("production caller retains connection and account encoded by the canonical provider key", async () => {
  const selected = { ...orderA };
  delete (selected as any).connection_id;
  delete (selected as any).provider_account_id;
  const valid = await workspace({ connection_id: "connection-a", provider_account_id: "account-a" }, selected);
  assert.equal(valid.timeline[1].relationships[0].id, orderA.platform_order_id);
  const invalid = await workspace({ connection_id: "connection-b", provider_account_id: "account-b" }, selected);
  assert.deepEqual(invalid.timeline[1].relationships, []);
});

test("production caller preserves retained scope for legitimate legacy keys that do not encode it", async () => {
  const selected = { ...orderA, platform_order_id: "legacy-order-a" };
  const valid = await workspace({ connection_id: "connection-a", provider_account_id: "account-a" }, selected);
  assert.deepEqual(valid.timeline[1].relationships, [{ type: "Order", id: "legacy-order-a", label: "101" }]);
  const invalid = await workspace({ connection_id: "connection-b", provider_account_id: "account-b" }, selected);
  assert.deepEqual(invalid.timeline[1].relationships, []);
});
