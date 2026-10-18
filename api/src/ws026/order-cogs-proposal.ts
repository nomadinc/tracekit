/**
 * WS-026 M2-A2: deterministic, read-only order-level COGS proposal.
 * This module cannot write or amend accounting records. Approval, immutable
 * persistence, refund treatment and tenant authorization are external gates.
 */
import { calculateLandedCogs, type CostLine, type CostRule, type CostResult } from "./landed-cogs.ts";

export type OrderCostLine = CostLine & {
  canonicalOrderId: string;
  canonicalOrderLineId: string;
};
export type LineCostEvidence = {
  canonicalOrderLineId: string;
  canonicalOrderId: string;
  organizationId: string;
  providerProductId: string;
  currency: string;
  quantity: number;
  ruleId: string;
  amountCents: number;
  occurredAt: string;
};
export type OrderCostProposal =
  | { status: "ready"; canonicalOrderId: string; organizationId: string; currency: string; totalCents: number; lines: LineCostEvidence[] }
  | { status: "unavailable"; reason: "invalid_order" | "duplicate_line" | "line_unavailable" | "amount_overflow"; failures?: Array<{ lineId: string; result: CostResult }> };

export function proposeOrderLandedCogs(lines: readonly OrderCostLine[], rules: readonly CostRule[]): OrderCostProposal {
  if (!lines.length) return { status: "unavailable", reason: "invalid_order" };
  const first = lines[0];
  if (!first.canonicalOrderId || !first.organizationId || !first.currency ||
      lines.some(line => !line.canonicalOrderLineId || line.canonicalOrderId !== first.canonicalOrderId ||
        line.organizationId !== first.organizationId || line.currency !== first.currency)) {
    return { status: "unavailable", reason: "invalid_order" };
  }
  const ids = lines.map(line => line.canonicalOrderLineId);
  if (new Set(ids).size !== ids.length) return { status: "unavailable", reason: "duplicate_line" };
  const evidence: LineCostEvidence[] = [];
  const failures: Array<{ lineId: string; result: CostResult }> = [];
  for (const line of lines) {
    const result = calculateLandedCogs(line, rules);
    if (result.status !== "ready") {
      failures.push({ lineId: line.canonicalOrderLineId, result });
      continue;
    }
    evidence.push({
      canonicalOrderLineId: line.canonicalOrderLineId,
      canonicalOrderId: line.canonicalOrderId,
      organizationId: line.organizationId,
      providerProductId: line.providerProductId,
      currency: line.currency,
      quantity: line.quantity,
      ruleId: result.ruleId,
      amountCents: result.amountCents,
      occurredAt: line.occurredAt,
    });
  }
  if (failures.length) return { status: "unavailable", reason: "line_unavailable", failures };
  const totalCents = evidence.reduce((sum, line) => sum + line.amountCents, 0);
  if (!Number.isSafeInteger(totalCents)) return { status: "unavailable", reason: "amount_overflow" };
  return { status: "ready", canonicalOrderId: first.canonicalOrderId, organizationId: first.organizationId,
    currency: first.currency, totalCents, lines: evidence };
}
