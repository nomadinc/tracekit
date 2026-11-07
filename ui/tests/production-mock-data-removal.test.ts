import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { ProductionOrderRepository } from "../lib/orders/production-repository";

const scope: any = { authenticated: true, workspaceId: "tenant", organizationId: "tenant", businessContextId: "context", session: {} };

test("production Order reporting propagates denied/unavailable data and never substitutes examples", async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [401, 403, 503]) {
      globalThis.fetch = async () => Response.json({ error: "reporting unavailable" }, { status });
      await assert.rejects(new ProductionOrderRepository().listOrders(scope), /reporting unavailable/);
    }
    globalThis.fetch = async () => { throw new Error("offline"); };
    await assert.rejects(new ProductionOrderRepository().listOrders(scope), /offline/);
    globalThis.fetch = async () => Response.json({ ok: true, orders: [], next_offset: null });
    assert.deepEqual(await new ProductionOrderRepository().listOrders(scope), []);
  } finally { globalThis.fetch = original; }
});

test("production command palette does not invoke customer fixture search outside development", () => {
  const source = readFileSync(new URL("../components/shared/command-palette.tsx", import.meta.url), "utf8");
  assert.match(source, /session\.developmentOnly \? customerRepository\.search\(repositoryScope, trimmed\) : Promise\.resolve\(\[\]\)/);
  assert.match(source, /const items: PaletteItem\[\] = session\.developmentOnly \?/);
  assert.match(source, /fetch\(globalSearchQuery/);
  assert.match(source, /setOfferSearch\(\[\]\);[\s\S]*setCustomerSearch\(\[\]\);[\s\S]*setOrderSearch\(\[\]\)/);
});

test("missing Offer reporting is identified as unavailable rather than zero business performance", () => {
  const source = readFileSync(new URL("../components/offers/offer-workspace.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(!offers\.length\)[\s\S]*Offer data unavailable/);
  assert.match(source, /No observed Offer reporting is available for this session/);
});
