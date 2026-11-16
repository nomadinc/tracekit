import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { createScopedCoreProxy } from "../lib/identity/scoped-core-runtime";
import { projectCustomerOrders } from "../lib/identity/customer-orders-projection";
import { exactRelatedOrder } from "../lib/reporting/order-relationship";

const require = createRequire(import.meta.url);
const { NextResponse } = require("next/server");
const source = readFileSync(new URL("../app/api/customer-orders/route.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const org = "nh", person = "person";
const base = { workspace_id: org, organization_id: org, platform: "next29", platform_order_id: "next29:103533", order_id: "103533", canonical_order_id: "canonical-103533", resolved_person_id: person, order_ts: "2026-11-13T01:04:10.984Z", currency: "USD", status: "completed", gross_amount: "134.96", connection_id: "conn1", provider_account_id: "acct1" };
const fixture = (patch: Record<string, unknown> = {}) => ({ ok: true, orders: [{ order: { ...base, ...patch, order_lines: [{ unit_amount: 999, tax: 100 }], subtotal: 1000 }, customer: { id: person }, identity_state: "resolved", amount: 999 }], next_offset: 17, total: 999 });
function handler(permissions: string[], payload: unknown = fixture()) {
  const session = { user: { id: "actor", status: "active" }, membership: { id: "membership", status: "active", effectiveFrom: "2020-01-01" }, activeOrganization: { id: org }, availableOrganizations: [{ id: org }], effectivePermissions: ["orders.view", ...permissions] };
  let calls = 0;
  const gateway = createScopedCoreProxy({
    resolveSession: async () => ({ kind: "authenticated", session: session as any }),
    apiBaseUrl: () => "https://synthetic.invalid", adminSecret: () => "synthetic",
    fetch: (async () => { calls++; return Response.json(payload); }) as typeof fetch,
  });
  const exports: Record<string, any> = {};
  new Function("require", "exports", transpiled)((name: string) => name === "next/server" ? { NextResponse } : name.includes("customer-orders-projection") ? { projectCustomerOrders } : { scopedCoreGet: gateway.scopedCoreGet }, exports);
  return { GET: exports.GET as (request: Request) => Promise<Response>, calls: () => calls };
}
const get = (h: ReturnType<typeof handler>, query = "") => h.GET(new Request("https://ui.invalid/api/customer-orders" + query));

test("actual GET denies financial narratives in every categorical field under all permission combinations", async () => {
  for (const permissions of [[], ["financials.view"], ["orders.view_financials"], ["financials.view", "orders.view_financials"]]) {
    for (const field of ["currency", "platform", "status", "status_norm", "identity_resolution"]) {
      const h = handler(permissions, fixture({ [field]: "Refund $987.65" }));
      const response = await get(h), json = JSON.stringify(await response.json());
      assert.equal(response.status, 200);
      assert.ok(!json.includes("$987.65"), field + " leaked");
      assert.equal(JSON.parse(json).orders[0].order[field], null);
    }
    const h = handler(permissions, { ...fixture(), orders: [{ ...fixture().orders[0], identity_state: "Refund $987.65" }] });
    const json = JSON.stringify(await (await get(h)).json());
    assert.ok(!json.includes("$987.65"));
  }
});
test("actual GET preserves provider and currency semantics, canonical purchase matching and 60-second interval", async () => {
  for (const permissions of [[], ["financials.view"], ["orders.view_financials"], ["financials.view", "orders.view_financials"]]) {
    const h = handler(permissions);
    const response = await get(h);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(body.next_offset, 17);
    const order = body.orders[0].order;
    assert.equal(order.currency, "USD");
    assert.equal(order.platform, "next29");
    assert.equal(order.canonical_order_id, "canonical-103533");
    assert.equal(body.orders[0].customer.id, person);
    assert.equal("gross_amount" in order, permissions.length === 2);
    const event = { canonical_order_id: "canonical-103533", platform_order_id: "next29:103533", workspace_id: org, organization_id: org };
    assert.equal(exactRelatedOrder(event, [order]), order);
    assert.equal((Date.parse(order.order_ts) - Date.parse("2026-11-13T01:03:10.984Z")) / 1000, 60);
    const serialized = JSON.stringify(body);
    for (const forbidden of ["order_lines", "unit_amount", "subtotal", '"total"', '"amount"']) assert.ok(!serialized.includes(forbidden));
  }
});
test("actual GET denies caller scope and foreign Order rows", async () => {
  const h = handler([]);
  assert.equal((await get(h, "?workspace_id=foreign")).status, 404);
  assert.equal(h.calls(), 0);
  await assert.rejects(() => get(handler([], fixture({ workspace_id: "foreign" }))), /scope unavailable/);
});
test("actual GET retains null currency and timestamp and withholds malformed identifiers", async () => {
  const body = await (await get(handler([], fixture({ currency: null, order_ts: null, status: null })))).json();
  assert.equal(body.orders[0].order.currency, null);
  assert.equal(body.orders[0].order.order_ts, null);
  assert.equal(body.orders[0].order.status, null);
  await assert.rejects(() => get(handler([], fixture({ canonical_order_id: "bad id $987.65" }))), /identity unavailable/);
});
