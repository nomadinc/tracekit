export type ChargebackSummaryCounts = {
  total: number;
  statuses: Record<string, number>;
  confidence: Record<string, number>;
};

/** Shape returned by the review API; amounts stay unavailable when currency is unproven. */
export function summaryFromExactCounts(counts: ChargebackSummaryCounts) {
  return {
    total: counts.total,
    disputedAmount: null,
    fees: null,
    currencies: [],
    statuses: counts.statuses,
    confidence: counts.confidence,
  };
}
