import assert from "node:assert/strict";
import test from "node:test";
import { expandNext29Order } from "./connectors/next29/expansion.ts";

test("29Next order evidence seeds deduplicated provider product observations", () => {
  const expanded = expandNext29Order({
    lines: [
      { id: 1, product_id: 10, variant_id: 11, sku: "SKU-A", product_title: "A", quantity: 1, unit_cost: "3.25" },
      { id: 2, product_id: 10, variant_id: 11, sku: "SKU-A", product_title: "A", quantity: 2, unit_cost: "3.25" },
      { id: 3, product_id: 10, variant_id: 12, sku: "SKU-B", product_title: "A / B", quantity: 1, unit_cost: "4.25" },
    ],
  });
  assert.deepEqual(expanded.products, [
    { providerProductId: "10", providerVariantId: "11", sku: "SKU-A", title: "A", unitCost: 3.25 },
    { providerProductId: "10", providerVariantId: "12", sku: "SKU-B", title: "A / B", unitCost: 4.25 },
  ]);
});
