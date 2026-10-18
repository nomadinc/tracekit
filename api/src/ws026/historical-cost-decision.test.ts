import assert from "node:assert/strict";
import test from "node:test";
import { compareHistoricalCost, type AppliedOrderCost } from "./historical-cost-decision.ts";
import type { OrderCostProposal } from "./order-cogs-proposal.ts";
const proposed: OrderCostProposal = { status: "ready", canonicalOrderId: "order-1", organizationId: "stem", currency: "USD",
 totalCents: 902, lines: [{ canonicalOrderLineId: "line-1", canonicalOrderId: "order-1", organizationId: "stem",
 providerProductId: "4", currency: "USD", quantity: 1, ruleId: "cost-v1", amountCents: 902, occurredAt: "2026-10-15T00:00:00Z" }] };
const prior: AppliedOrderCost = { canonicalOrderId: "order-1", organizationId: "stem", currency: "USD",
 totalCents: 902, lines: [{ canonicalOrderLineId: "line-1", ruleId: "cost-v1", amountCents: 902 }] };
test("new cost proposal is not a write", () => assert.equal(compareHistoricalCost(proposed, null).status, "propose_new"));
test("identical replay is unchanged", () => assert.deepEqual(compareHistoricalCost(proposed, prior), { status: "unchanged", canonicalOrderId: "order-1" }));
test("changed effective cost version requires review", () => assert.deepEqual(compareHistoricalCost(proposed, { ...prior, lines: [{ ...prior.lines[0], ruleId: "cost-v2" }] }), { status: "review_required", reason: "historical_difference" }));
test("changed historical amount requires review", () => assert.deepEqual(compareHistoricalCost(proposed, { ...prior, totalCents: 1050 }), { status: "review_required", reason: "historical_difference" }));
test("foreign tenant is denied", () => assert.deepEqual(compareHistoricalCost(proposed, { ...prior, organizationId: "other" }), { status: "review_required", reason: "scope_mismatch" }));
test("missing cost proposal never overwrites existing history", () => assert.deepEqual(compareHistoricalCost({ status: "unavailable", reason: "line_unavailable" }, prior), { status: "review_required", reason: "proposal_unavailable" }));
test("duplicate persisted lines require review", () => assert.deepEqual(compareHistoricalCost(proposed, { ...prior, lines: [prior.lines[0], prior.lines[0]] }), { status: "review_required", reason: "invalid_existing" }));
test("comparison never mutates historical inputs", () => {
 const before = JSON.stringify({ proposed, prior });
 compareHistoricalCost(proposed, prior);
 assert.equal(JSON.stringify({ proposed, prior }), before);
});
