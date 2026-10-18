/**
 * WS-026 M2-A2: immutable financial proposal comparison.
 * Pure decision only: no writes, no historical recalculation or ledger mutation.
 */
import type { OrderCostProposal } from "./order-cogs-proposal.ts";

export type AppliedLineCost = {
  canonicalOrderLineId: string;
  ruleId: string;
  amountCents: number;
};
export type AppliedOrderCost = {
  canonicalOrderId: string;
  organizationId: string;
  currency: string;
  totalCents: number;
  lines: readonly AppliedLineCost[];
};
export type CostApplicationDecision =
  | { status: "propose_new"; proposed: Extract<OrderCostProposal, { status: "ready" }> }
  | { status: "unchanged"; canonicalOrderId: string }
  | { status: "review_required"; reason: "proposal_unavailable" | "scope_mismatch" | "historical_difference" | "invalid_existing" };

function safeAmount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
export function compareHistoricalCost(
  proposed: OrderCostProposal,
  existing: AppliedOrderCost | null,
): CostApplicationDecision {
  if (proposed.status !== "ready") return { status: "review_required", reason: "proposal_unavailable" };
  if (!safeAmount(proposed.totalCents) || proposed.lines.some(line => !line.ruleId || !safeAmount(line.amountCents)))
    return { status: "review_required", reason: "proposal_unavailable" };
  if (!existing) return { status: "propose_new", proposed };
  if (existing.canonicalOrderId !== proposed.canonicalOrderId ||
      existing.organizationId !== proposed.organizationId || existing.currency !== proposed.currency)
    return { status: "review_required", reason: "scope_mismatch" };
  if (!safeAmount(existing.totalCents) || existing.lines.some(line => !line.ruleId || !safeAmount(line.amountCents)) ||
      new Set(existing.lines.map(line => line.canonicalOrderLineId)).size !== existing.lines.length)
    return { status: "review_required", reason: "invalid_existing" };
  const expected = new Map(existing.lines.map(line => [line.canonicalOrderLineId, line]));
  if (expected.size !== proposed.lines.length || existing.totalCents !== proposed.totalCents)
    return { status: "review_required", reason: "historical_difference" };
  for (const line of proposed.lines) {
    const prior = expected.get(line.canonicalOrderLineId);
    if (!prior || prior.ruleId !== line.ruleId || prior.amountCents !== line.amountCents)
      return { status: "review_required", reason: "historical_difference" };
  }
  return { status: "unchanged", canonicalOrderId: proposed.canonicalOrderId };
}
