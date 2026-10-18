/** WS-026 M2-C: read-only order financial evidence readiness.
 * No source amount is synthesized and no ledger placeholder is promoted.
 */
export type OrderFinancialEvidence = {
  currency: string | null;
  grossRevenue: { amount: string; evidenceId: string } | null;
  refunds: { amount: string; evidenceId: string }[] | null;
  affiliateCommission: { amount: string; evidenceId: string } | null;
  landedCogs: { amount: string; evidenceId: string; appliedVersionId: string; includesShipping: boolean } | null;
  processingFees: { amount: string; evidenceId: string; actual: boolean } | null;
  reconciliation: { statementEvidenceId: string; status: "closed" | "open"; accepted: boolean } | null;
  sourceCurrent: boolean;
};
export type OrderFinancialReadiness = {
  status: "unavailable" | "incomplete" | "operational_ready" | "reconciliation_pending";
  missing: string[];
  currency: string | null;
  operationalProfitDisplay: string | null;
  reconciledProfitDisplay: string | null;
};
function parseCents(value: string): bigint | null {
  if (!/^-?(?:0|[1-9]\d*)\.\d{2}$/.test(value)) return null;
  const negative = value.startsWith("-");
  const [whole, fraction] = (negative ? value.slice(1) : value).split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction);
  return negative ? -cents : cents;
}
function decimal(cents: bigint): string {
  const abs = cents < 0n ? -cents : cents;
  return (cents < 0n ? "-" : "") + (abs / 100n).toString() + "." + (abs % 100n).toString().padStart(2, "0");
}
export function assessOrderFinancialEvidence(e: OrderFinancialEvidence): OrderFinancialReadiness {
  const missing: string[] = [];
  if (!e.currency || !/^[A-Z]{3}$/.test(e.currency)) missing.push("source_currency");
  if (!e.sourceCurrent) missing.push("stale_financial_source");
  const valid = (entry: { amount: string; evidenceId: string } | null) =>
    Boolean(entry && entry.evidenceId && parseCents(entry.amount) !== null);
  if (!valid(e.grossRevenue)) missing.push("gross_revenue_evidence");
  if (!e.refunds || e.refunds.some(r => !valid(r))) missing.push("refund_completeness");
  if (!valid(e.affiliateCommission)) missing.push("affiliate_commission_evidence");
  if (!valid(e.landedCogs) || !e.landedCogs?.appliedVersionId) missing.push("historical_landed_cogs");
  if (!valid(e.processingFees) || !e.processingFees?.actual) missing.push("actual_processing_fees");
  if (!e.landedCogs?.includesShipping) missing.push("shipping_cost_treatment");
  if (missing.length) return { status: "incomplete", missing, currency: e.currency, operationalProfitDisplay: null, reconciledProfitDisplay: null };
  const refunds = e.refunds!.reduce((total, item) => total + parseCents(item.amount)!, 0n);
  const profit = parseCents(e.grossRevenue!.amount)! - refunds - parseCents(e.affiliateCommission!.amount)! -
    parseCents(e.landedCogs!.amount)! - parseCents(e.processingFees!.amount)!;
  // Other costs/adjustments and source completeness must be proven by the caller.
  // This is an advisory subtotal, not operational profit until a complete contract exists.
  void profit;
  return { status: "reconciliation_pending", missing: ["complete_financial_contract_not_verified",
    ...(!e.reconciliation?.accepted || e.reconciliation.status !== "closed" || !e.reconciliation.statementEvidenceId ? ["closed_reconciliation_evidence"] : [])],
    currency: e.currency, operationalProfitDisplay: null, reconciledProfitDisplay: null };
}
