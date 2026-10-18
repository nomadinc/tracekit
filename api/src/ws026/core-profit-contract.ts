/**
 * WS-026 M2-B4: read-only Core Profit Engine contract assessment.
 * This does NOT turn legacy aggregate zeros into authoritative order economics.
 * The source ledger has signed values and may not share the canonical order key.
 */
export type CoreProfitTotals = {
  gross_revenue?: number | null; refunds?: number | null; chargebacks?: number | null;
  processor_fees?: number | null; shipping_cost?: number | null; cogs?: number | null;
  affiliate_payout?: number | null; reversals?: number | null;
  net_revenue?: number | null; net_profit?: number | null;
};
export type CoreProfitRead = {
  workspaceId: string; orderId: string; connectorId: string; currency: string | null;
  totals: CoreProfitTotals | null;
  source: "conversion_rollup" | "commerce_order" | "unknown";
  costProvenanceComplete: boolean;
  commissionProvenanceComplete: boolean;
  feeProvenanceComplete: boolean;
  ledgerCurrent: boolean;
  canonicalOrderLinkVerified: boolean;
};
export type CoreFinancialContractAssessment =
  | { status: "unavailable"; reason: "invalid_scope" | "unknown_currency" | "invalid_amount" }
  | { status: "limited" | "ready"; currency: string; reportedNetProfit: number | null; missing: string[]; provenance: string };
export function inspectCoreProfitRead(row: CoreProfitRead): CoreFinancialContractAssessment {
  if (!row.workspaceId || !row.orderId || !row.connectorId)
    return { status: "unavailable", reason: "invalid_scope" };
  if (!row.currency || !/^[A-Z]{3}$/.test(row.currency))
    return { status: "unavailable", reason: "unknown_currency" };
  if (row.totals && Object.values(row.totals).some(n => n !== null && n !== undefined && (!Number.isFinite(n) || typeof n !== "number")))
    return { status: "unavailable", reason: "invalid_amount" };
  const missing = [
    ...(!row.totals ? ["missing_profit_rollup"] : []),
    ...(row.source !== "commerce_order" ? ["commerce_revenue_not_verified"] : []),
    ...(!row.canonicalOrderLinkVerified ? ["canonical_order_link_unverified"] : []),
    ...(!row.costProvenanceComplete ? ["landed_cogs_provenance_missing"] : []),
    ...(!row.commissionProvenanceComplete ? ["affiliate_commission_provenance_missing"] : []),
    ...(!row.feeProvenanceComplete ? ["processing_fee_provenance_missing"] : []),
    ...(!row.ledgerCurrent ? ["financial_ledger_stale"] : []),
    ...(row.totals?.net_profit == null ? ["net_profit_unavailable"] : []),
  ];
  return { status: missing.length ? "limited" : "ready", currency: row.currency,
    reportedNetProfit: missing.length ? null : row.totals!.net_profit!,
    missing, provenance: row.source };
}
