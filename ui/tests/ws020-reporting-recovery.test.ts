import assert from "node:assert/strict";
import test from "node:test";
import { ProductionCustomerRepository } from "../lib/customers/production-repository";
import { ProductionOrderRepository } from "../lib/orders/production-repository";
import { observedAmount, formatObservedMoney } from "../lib/reporting/observed-money";
import { exactRelatedOrder } from "../lib/reporting/order-relationship";
import { readJourneyPages } from "../lib/reporting/journey-pages";

const scope: any = { authenticated: true, workspaceId: "tenant", organizationId: "tenant", businessContextId: "context", session: {} };
async function withResponses(run: () => Promise<void>, respond: (url: URL) => Response) {
  const originalFetch = globalThis.fetch;
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  globalThis.fetch = async (url) => respond(new URL(String(url), "https://ui.test"));
  try { await run(); } finally {
    globalThis.fetch = originalFetch;
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
  }
}
const customer = (id: number) => ({ customer: { id: `c${id}`, display_name: `Customer ${id}` }, order_count: id === 105 ? 2 : 1 });

test("Customer Explorer reads 106 customers with opaque cursors and preserves scope/search on every page", async () => {
  const calls: string[] = [];
  await withResponses(async () => {
    const rows = await new ProductionCustomerRepository().listCustomers(scope, { query: "query" });
    assert.equal(rows.length, 106);
    assert.equal(rows[105].id, "c105");
    assert.deepEqual(calls, ["", "opaque/second?", "opaque/third?"]);
  }, (url) => {
    assert.equal(url.pathname, "/api/customers");
    assert.equal(url.searchParams.get("workspace_id"), "tenant");
    assert.equal(url.searchParams.get("search"), "query");
    const cursor = url.searchParams.get("cursor") || ""; calls.push(cursor);
    const offset = cursor === "" ? 0 : cursor === "opaque/second?" ? 50 : 100;
    return Response.json({ ok: true, customers: Array.from({ length: Math.min(50, 106 - offset) }, (_, i) => customer(offset + i)), has_more: offset < 100, next_cursor: offset === 0 ? "opaque/second?" : offset === 50 ? "opaque/third?" : null });
  });
});

test("Customer Explorer deduplicates stable customer IDs across pages", async () => {
  await withResponses(async () => {
    const rows = await new ProductionCustomerRepository().listCustomers(scope);
    assert.deepEqual(rows.map((r) => r.id), ["c1", "c2"]);
  }, (url) => Response.json(url.searchParams.has("cursor")
    ? { customers: [customer(1), customer(2)], has_more: false }
    : { customers: [customer(1)], has_more: true, next_cursor: "next" }));
});

test("Repeat customers on later pages remain discoverable", async () => {
  await withResponses(async () => {
    const rows = await new ProductionCustomerRepository().listCustomers(scope, { state: "repeat" });
    assert.deepEqual(rows.map((row) => row.id), ["c105"]);
  }, (url) => Response.json(url.searchParams.has("cursor")
    ? { customers: [customer(105)], has_more: false }
    : { customers: [customer(1)], has_more: true, next_cursor: "next" }));
});

test("Customer pagination fails closed for repeated/missing cursors and later-page errors", async () => {
  for (const mode of ["repeat", "missing", "failure"]) {
    await withResponses(async () => {
      await assert.rejects(() => new ProductionCustomerRepository().listCustomers(scope));
    }, (url) => {
      if (mode === "failure" && url.searchParams.has("cursor")) return Response.json({ error: "unavailable" }, { status: 503 });
      return Response.json({ customers: [customer(1)], has_more: true, next_cursor: mode === "missing" ? null : "repeat" });
    });
  }
});

test("Orders distinguish genuine empty data from API failures, malformed pages and incomplete pagination", async () => {
  for (const result of [Response.json({ ok: false }), Response.json({ ok: true }), Response.json({ orders: [], next_offset: 0 }), Response.json({ error: "unavailable" }, { status: 503 })]) {
    await withResponses(async () => { await assert.rejects(() => new ProductionOrderRepository().listOrders(scope)); }, () => result);
  }
  await withResponses(async () => { assert.deepEqual(await new ProductionOrderRepository().listOrders(scope), []); }, () => Response.json({ orders: [], next_offset: null }));
});

test("Order amount adapters preserve zero and mark null, missing and invalid values unavailable", async () => {
  const amounts = [0, null, undefined, "bad", ""];
  await withResponses(async () => {
    const rows = await new ProductionOrderRepository().listOrders(scope);
    assert.deepEqual(rows.map((r) => r.revenueAvailable), [true, false, false, false, false]);
    assert.equal(rows[0].currency, "EUR");
  }, () => Response.json({ orders: amounts.map((gross_amount, i) => ({ order: { platform_order_id: `next29:${i}`, gross_amount, currency: "EUR" } })), next_offset: null }));
});

test("Orders refuse records explicitly outside the requested tenant instead of relabeling them", async () => {
  for (const wrongScope of [{ organization_id: "foreign" }, { workspace_id: "default" }]) {
    await withResponses(async () => {
      await assert.rejects(() => new ProductionOrderRepository().listOrders(scope), /scope/);
    }, () => Response.json({ orders: [{ order: { platform_order_id: "o", ...wrongScope } }], next_offset: null }));
  }
});

test("Customer order navigation retains unique platform identity and currency without asserting missing amounts", async () => {
  await withResponses(async () => {
    const workspace = await new ProductionCustomerRepository().loadWorkspace(scope, "c1");
    assert.equal(workspace?.orders[0].id, "next29:connection:101");
    assert.equal(workspace?.orders[0].amountAvailable, false);
    assert.equal(workspace?.lifetimeRevenueAvailable, false);
    assert.deepEqual(workspace?.journey, []);
    assert.equal(workspace?.journeyId, "No canonical journey");
    const drawer = await new ProductionCustomerRepository().loadDrawer(scope, "c1", "related-order:next29:connection:101");
    assert.equal(drawer?.relationships[1].id, "next29:connection:101");
    assert.equal(drawer?.facts[0].value, "Unavailable");
  }, () => Response.json({ customer: { id: "c1" }, summary: {}, journeys: [], orders: [{ order_id: "101", platform_order_id: "next29:connection:101", currency: "GBP", amount: null }] }));
});

test("Financial presentation preserves currency and never formats absent evidence as zero", () => {
  for (const value of [null, undefined, "", "bad", Infinity, false, []]) assert.equal(observedAmount(value), null);
  assert.equal(formatObservedMoney(0, "USD"), "$0.00");
  assert.equal(formatObservedMoney("12.34", "GBP"), "£12.34");
  assert.equal(formatObservedMoney(12.34, "EUR"), "€12.34");
  assert.equal(formatObservedMoney(null, "USD"), "Unavailable");
  assert.equal(formatObservedMoney(12, null), "Unavailable");
});

test("Journey Order relationships require exact provider-scoped evidence, never timestamp proximity or substrings", () => {
  const orders = [{ platform: "next29", platform_order_id: "next29:a:101", order_id: "101", created_at: "2026-11-01T00:00:00Z" }, { platform: "shopify", platform_order_id: "shopify:b:101", order_id: "101" }];
  assert.equal(exactRelatedOrder({ event_time: orders[0].created_at }, orders), null);
  assert.equal(exactRelatedOrder({ order_id: "1010", source_platform: "next29" }, orders), null);
  assert.equal(exactRelatedOrder({ order_id: "101" }, orders), null);
  assert.equal(exactRelatedOrder({ order_id: "101", source_platform: "next29" }, orders), null);
  assert.equal(exactRelatedOrder({ platform_order_id: "shopify:b:101" }, orders), orders[1]);
  assert.equal(exactRelatedOrder({ order_id: "101", source_platform: "next29" }, [...orders, { platform: "next29", order_id: "101", platform_order_id: "next29:other:101" }]), null);
});

test("Customer Journey consumes later canonical event pages without duplicating derived activity", async () => {
  await withResponses(async () => {
    const snapshot = await new ProductionCustomerRepository().loadWorkspace(scope, "c1");
    assert.equal(snapshot?.journey.length, 120);
    assert.equal(snapshot?.journey[119].id, "e119");
  }, (url) => {
    assert.equal(url.searchParams.get("workspace_id"), "tenant");
    if (!url.pathname.includes("/journeys/")) return Response.json({ customer: { id: "c1" }, canonical_journey_id: "j1", orders: [], journeys: [{ id: "j1" }] });
    const offset = url.searchParams.has("cursor") ? 100 : 0;
    return Response.json({ events: Array.from({ length: offset ? 20 : 100 }, (_, i) => ({ id: `e${offset + i}`, event_type: "click" })), activity: [{ id: "derived" }], page: { has_more: offset === 0, next_cursor: "opaque/next?" } });
  });
  let calls = 0;
  const result = await readJourneyPages(async () => ({ events: [{ id: `e${calls++}` }], activity: [{ id: "same" }], page: { has_more: calls === 1, next_cursor: "next" } }));
  assert.equal(result.activity.length, 1);
});

test("Journey API failure and cursor cycles never become an empty or apparently complete timeline", async () => {
  let calls = 0;
  await assert.rejects(() => readJourneyPages(async () => {
    if (calls++) throw new Error("upstream unavailable");
    return { events: [{ id: "observed" }], page: { has_more: true, next_cursor: "next" } };
  }), /upstream unavailable/);
  await assert.rejects(() => readJourneyPages(async () => ({ events: [], page: { has_more: true, next_cursor: "same" } })), /pagination/);
});

test("Customer Journey renders same-time purchase evidence without inventing an Order relationship", async () => {
  await withResponses(async () => {
    const workspace = await new ProductionCustomerRepository().loadWorkspace(scope, "c1");
    assert.equal(workspace?.journey.length, 1);
    assert.deepEqual(workspace?.journey[0].relationships, []);
    assert.doesNotMatch(workspace?.journey[0].confidence || "", /Order 101/);
  }, (url) => url.pathname.includes("/journeys/")
    ? Response.json({ events: [{ id: "e1", event_type: "purchase", event_time: "2026-11-01T00:00:00Z" }], page: { has_more: false } })
    : Response.json({ customer: { id: "c1" }, canonical_journey_id: "j1", journeys: [{ id: "j1" }], orders: [{ platform: "next29", platform_order_id: "next29:a:101", order_id: "101", created_at: "2026-11-01T00:00:00Z" }] }));
});

test("unverified Journey list is never used as an implicit first-record fallback",async()=>{
 let journeyRequests=0;
 await withResponses(async()=>{
  const snapshot=await new ProductionCustomerRepository().loadWorkspace(scope,"c1");
  assert.deepEqual(snapshot?.journey,[]);assert.equal(snapshot?.journeyId,"No canonical journey");assert.equal(journeyRequests,0);
 },url=>{if(url.pathname.includes("/journeys/"))journeyRequests++;return Response.json({customer:{id:"c1"},journeys:[{id:"unrelated-first"},{id:"other"}],orders:[]});});
});
