import test from "node:test";
import assert from "node:assert/strict";
import { observedOrderLines } from "../lib/orders/observed-lines";

const org = "8f6bb14b-2126-49b8-bfdb-c60edbc3549b";
const canonical = "15f0b290-aaad-4962-b1d6-42f69db3966c";
const row = {
  id: "86446fa1-10dd-43d9-8de9-5d36162f0fb9",
  organization_id: org, canonical_order_id: canonical,
  quantity: "1", unit_amount: "116.99", gross_amount: "116.99",
  currency: "USD", evidence_id: "82b81078-0b73-4c31-90bf-c4d380e09eda",
  metadata: { title: "20 Treatments (5)", sku: null, provider_product_id: "8", provider_variant_id: "9" },
};
test("projects exact canonical line without fabricating missing SKU", () => {
  assert.deepEqual(observedOrderLines([row], canonical, org), [{
    id: row.id, name: "20 Treatments (5)", sku: null,
    providerProductId: "8", providerVariantId: "9", quantity: 1,
    unitAmount: 116.99, grossAmount: 116.99, currency: "USD", evidenceId: row.evidence_id,
  }]);
});
test("rejects cross-tenant and wrong canonical order lines", () => {
  assert.deepEqual(observedOrderLines([row], canonical, "other-org"), []);
  assert.deepEqual(observedOrderLines([row], "other-order", org), []);
});
test("missing projection never becomes inferred product or zero", () => {
  assert.deepEqual(observedOrderLines(undefined, canonical, org), []);
  const lines = observedOrderLines([{...row, unit_amount:null, gross_amount:null, quantity:null}], canonical, org);
  assert.equal(lines[0].unitAmount, null);
  assert.equal(lines[0].grossAmount, null);
  assert.equal(lines[0].quantity, null);
});
