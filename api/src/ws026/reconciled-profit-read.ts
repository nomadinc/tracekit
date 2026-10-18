/**
 * WS-026 M2-B2: reconciled profit is an independently evidenced closed-period
 * result, never a copy of operational profit or a boolean flag.
 * Read-only, integer minor units, no ledger mutation.
 */
export type ReconciliationAdjustment = {
  id: string; currency: string; amountCents: number; direction: "credit" | "debit";
  evidenceId: string; approvalId: string;
};
export type ClosedPeriodEvidence = {
  periodId: string; currency: string; status: "pending" | "variance" | "closed";
  operationalProfitCents: number | null; statementProfitCents: number | null;
  statementEvidenceId: string | null; closedBy: string | null; closedAt: string | null;
  adjustments: readonly ReconciliationAdjustment[];
};
export type ReconciledRead =
  | { status: "reconciled"; periodId: string; currency: string; profitCents: number; statementProfitCents: number; adjustmentCents: number }
  | { status: "limited"; reason: "period_open" | "missing_evidence" | "incomplete_operational" | "variance" }
  | { status: "unavailable"; reason: "invalid_amount" | "currency_mismatch" | "duplicate_adjustment" };
export function presentReconciledPeriod(period: ClosedPeriodEvidence): ReconciledRead {
  if (period.status !== "closed") return { status: "limited", reason: "period_open" };
  if (!period.periodId || !period.statementEvidenceId || !period.closedBy || !period.closedAt)
    return { status: "limited", reason: "missing_evidence" };
  if (period.operationalProfitCents === null) return { status: "limited", reason: "incomplete_operational" };
  if (period.statementProfitCents === null) return { status: "limited", reason: "missing_evidence" };
  if (![period.operationalProfitCents, period.statementProfitCents].every(Number.isSafeInteger) ||
      period.adjustments.some(a => !Number.isSafeInteger(a.amountCents) || a.amountCents < 0 || !a.id || !a.evidenceId || !a.approvalId))
    return { status: "unavailable", reason: "invalid_amount" };
  if (!/^[A-Z]{3}$/.test(period.currency) || period.adjustments.some(a => a.currency !== period.currency))
    return { status: "unavailable", reason: "currency_mismatch" };
  if (new Set(period.adjustments.map(a => a.id)).size !== period.adjustments.length)
    return { status: "unavailable", reason: "duplicate_adjustment" };
  const adjustmentCents = period.adjustments.reduce((n, a) => n + (a.direction === "credit" ? a.amountCents : -a.amountCents), 0);
  const profitCents = period.operationalProfitCents + adjustmentCents;
  if (!Number.isSafeInteger(adjustmentCents) || !Number.isSafeInteger(profitCents))
    return { status: "unavailable", reason: "invalid_amount" };
  if (profitCents !== period.statementProfitCents) return { status: "limited", reason: "variance" };
  return { status: "reconciled", periodId: period.periodId, currency: period.currency,
    profitCents, statementProfitCents: period.statementProfitCents, adjustmentCents };
}
