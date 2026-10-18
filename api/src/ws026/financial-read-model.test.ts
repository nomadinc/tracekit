import assert from "node:assert/strict";
import test from "node:test";
import { presentOrderFinancials, type FinancialComponent } from "./financial-read-model.ts";
const item = (id: string, category: FinancialComponent["category"], amountCents: number): FinancialComponent =>
 ({ id, category, amountCents, currency: "USD", source: "imported", evidenceId: "ev-" + id });
const components = [item("sale", "sale", 4999), item("commission", "affiliate_commission", 800),
 item("cogs", "landed_cogs", 902), item("fee", "processing_fee", 150)];
const base = { currency: "USD", components, knownAbsent: [] as string[], reconciled: false,
 sourceCurrent: true, includesShippingInLandedCogs: true };
test("single-item order profit is revenue minus distinct costs", () => {
 const r = presentOrderFinancials(base);
 assert.equal(r.status, "ready");
 if (r.status !== "unavailable") assert.deepEqual([r.grossRevenueCents, r.netRevenueCents, r.operationalProfitCents], [4999, 4999, 3147]);
});
test("partial and full refunds, reversals remain distinct", () => {
 const partial = presentOrderFinancials({ ...base, components: [...components, item("refund1", "refund", 1000)] });
 assert.equal(partial.status, "ready");
 if (partial.status !== "unavailable") assert.equal(partial.netRevenueCents, 3999);
 const full = presentOrderFinancials({ ...base, components: [...components, item("refund1", "refund", 4999)] });
 if (full.status !== "unavailable") assert.equal(full.netRevenueCents, 0);
 const reversal = presentOrderFinancials({ ...base, components: [...components, item("refund1", "refund", 1000), item("reverse1", "reversal", 1000)] });
 if (reversal.status !== "unavailable") assert.equal(reversal.netRevenueCents, 4999);
});
test("duplicate identical event counted once, conflicting duplicate refused", () => {
 const repeat = presentOrderFinancials({ ...base, components: [...components, components[0]] });
 if (repeat.status !== "unavailable") assert.equal(repeat.grossRevenueCents, 4999);
 assert.deepEqual(presentOrderFinancials({ ...base, components: [...components, { ...components[0], amountCents: 5999 }] }), { status: "unavailable", reason: "duplicate_conflict" });
});
test("missing COGS and processing fees never report complete profit", () => {
 for (const category of ["landed_cogs", "processing_fee"]) {
  const r = presentOrderFinancials({ ...base, components: components.filter(c => c.category !== category) });
  assert.equal(r.status, "limited");
  if (r.status !== "unavailable") assert.equal(r.operationalProfitCents, null);
 }
});
test("shipping included in landed COGS is not deducted again", () => {
 const r = presentOrderFinancials(base);
 if (r.status !== "unavailable") assert.equal(r.operationalProfitCents, 3147);
});
test("currency mismatch rejected", () => assert.deepEqual(presentOrderFinancials({ ...base, components: [...components, { ...components[0], id: "euro", currency: "EUR" }] }), { status: "unavailable", reason: "currency_mismatch" }));
test("negative margin remains a valid financial result", () => {
 const r = presentOrderFinancials({ ...base, components: [item("sale", "sale", 100), ...components.slice(1)] });
 if (r.status !== "unavailable") assert.ok((r.operationalProfitCents ?? 0) < 0);
});
test("stale sources, estimates and incomplete reconciliation cannot assert complete profit", () => {
 assert.equal(presentOrderFinancials({ ...base, sourceCurrent: false }).status, "limited");
 const estimated = presentOrderFinancials({ ...base, components: components.map(c => c.id === "fee" ? { ...c, source: "estimated" } : c) });
 assert.equal(estimated.status, "limited");
 const unverified = presentOrderFinancials({ ...base, reconciled: true });
 if (unverified.status !== "unavailable") assert.equal(unverified.reconciledProfitCents, null);
});
