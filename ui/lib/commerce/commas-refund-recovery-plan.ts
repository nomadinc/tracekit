/** Read-only planning. This module never posts economics or changes ownership epochs. */
export type RefundScope = { organizationId: string; connectionId: string; providerAccountId: string };
export type RefundRecoveryCandidate = RefundScope & {
  observationId: string; refundIdentity: string; canonicalOrderId: string | null;
  status: string; orderMatchState: string; evidenceVerified: boolean;
  sellerCost: string; creatorAmount: string; processorFee: string;
  currencyContractVerified: boolean;
  /** Provider-proven identity bridge; amount/time similarity is insufficient. */
  numericRefundIdentity: string | null; identityBridgeVerified: boolean;
  existingWebhookLedgerRows: number; existingEmbeddedLedgerRows: number;
};
function cents(value: string): bigint | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
}
export function planCommasRefundRecovery(scope: RefundScope, candidates: RefundRecoveryCandidate[]) {
  if (!candidates.length || candidates.length > 100) throw new Error("Recovery requires 1–100 explicit observations.");
  const observations = new Set<string>(), refunds = new Set<string>(), numeric = new Set<string>();
  for (const c of candidates) {
    if (c.organizationId !== scope.organizationId || c.connectionId !== scope.connectionId || c.providerAccountId !== scope.providerAccountId)
      throw new Error("Recovery scope mismatch.");
    if (!c.observationId || !c.refundIdentity || observations.has(c.observationId) || refunds.has(c.refundIdentity))
      throw new Error("Duplicate or missing recovery identity.");
    if (c.numericRefundIdentity && numeric.has(c.numericRefundIdentity)) throw new Error("Ambiguous refund identity bridge.");
    if (![c.existingWebhookLedgerRows,c.existingEmbeddedLedgerRows].every(n => Number.isInteger(n) && n >= 0))
      throw new Error("Invalid ledger inspection.");
    observations.add(c.observationId); refunds.add(c.refundIdentity);
    if (c.numericRefundIdentity) numeric.add(c.numericRefundIdentity);
  }
  const rows = candidates.map(c => {
    const blockers: string[] = [];
    if (c.status !== "success") blockers.push("refund_not_final_success");
    if (!c.canonicalOrderId || c.orderMatchState !== "exact_ord") blockers.push("exact_order_relationship_required");
    if (!c.evidenceVerified) blockers.push("verified_retained_evidence_required");
    if (!c.currencyContractVerified) blockers.push("currency_contract_required");
    const cost=cents(c.sellerCost), creator=cents(c.creatorAmount), fee=cents(c.processorFee);
    if (cost === null || creator === null || fee === null || creator + fee !== cost) blockers.push("seller_cost_contract_invalid");
    if (!c.identityBridgeVerified || !c.numericRefundIdentity || !/^\d+$/.test(c.numericRefundIdentity)) blockers.push("provider_refund_identity_bridge_required");
    if (c.existingEmbeddedLedgerRows || c.existingWebhookLedgerRows) blockers.push("existing_economics_require_reconciliation");
    return { observationId:c.observationId, refundIdentity:c.refundIdentity, canonicalOrderId:c.canonicalOrderId,
      numericRefundIdentity:c.numericRefundIdentity, state:blockers.length ? "blocked" : "ready_for_atomic_recovery", blockers };
  });
  return { mode:"read_only" as const, writes:0, ownershipEpochChanged:false,
    ready:rows.filter(r=>!r.blockers.length).length, blocked:rows.filter(r=>r.blockers.length).length, rows,
    executionRequirements:["atomic_per_refund_ownership_claim", "transaction_page_guard_uses_exact_identity_bridge", "recheck_evidence_and_ledger_under_lock", "append_audit_and_post_once"] };
}
