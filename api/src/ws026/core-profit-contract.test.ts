import assert from "node:assert/strict";
import test from "node:test";
import { inspectCoreProfitRead, type CoreProfitRead } from "./core-profit-contract.ts";
const base: CoreProfitRead = { workspaceId: "stem", orderId: "order-1", connectorId: "next29", currency: "USD",
 totals: { gross_revenue: 4999, cogs: 902, affiliate_payout: 800, processor_fees: 150, net_profit: 3147 },
 source: "commerce_order", costProvenanceComplete: true, commissionProvenanceComplete: true,
 feeProvenanceComplete: true, ledgerCurrent: true, canonicalOrderLinkVerified: true };
test("verified financial contract exposes existing profit value", () => {
 assert.deepEqual(inspectCoreProfitRead(base), { status: "ready", currency: "USD", reportedNetProfit: 3147, missing: [], provenance: "commerce_order" });
});
test("conversion rollup alone cannot prove commerce revenue completeness", () => {
 const r = inspectCoreProfitRead({ ...base, source: "conversion_rollup" });
 assert.equal(r.status, "limited");
 if (r.status === "limited") assert.equal(r.reportedNetProfit, null);
});
test("zero-filled legacy profit with missing cost provenance remains limited", () => {
 const r = inspectCoreProfitRead({ ...base, totals: { net_profit: 0 }, costProvenanceComplete: false, feeProvenanceComplete: false });
 assert.equal(r.status, "limited");
 if (r.status === "limited") assert.ok(r.missing.includes("landed_cogs_provenance_missing"));
});
test("unknown currency is not silently USD", () => {
 assert.deepEqual(inspectCoreProfitRead({ ...base, currency: null }), { status: "unavailable", reason: "unknown_currency" });
});
test("missing rollup and stale ledger explicitly reported", () => {
 const r = inspectCoreProfitRead({ ...base, totals: null, ledgerCurrent: false });
 assert.equal(r.status, "limited");
 if (r.status === "limited") assert.deepEqual(r.missing.filter(x => x.includes("rollup") || x.includes("stale")), ["missing_profit_rollup", "financial_ledger_stale"]);
});
test("unverified canonical order relationship blocks profit", () => {
 const r = inspectCoreProfitRead({ ...base, canonicalOrderLinkVerified: false });
 assert.equal(r.status, "limited");
});
test("invalid numeric source amounts fail closed", () => {
 assert.deepEqual(inspectCoreProfitRead({ ...base, totals: { net_profit: Number.NaN } }), { status: "unavailable", reason: "invalid_amount" });
});
