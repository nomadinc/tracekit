export const COMMAS_REFUND_CORRECTION_POLICY = "commas-refund-seller-cost-correction-v1" as const;
export const COMMAS_REFUND_CURRENCY = "USD" as const;
export const COMMAS_REFUND_CORRECTION_LEDGER_TYPE = "reversal" as const;

export type CommasRefundCorrectionInput = {
  providerRefundId: string;
  buyerAmount: number;
  creatorAmount: number;
  processorFee: number;
  providerRefundCost: number;
  legacyRefundAmount: number;
  legacyRefundFeeAmount: number;
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function planCommasRefundSellerCostCorrection(input: CommasRefundCorrectionInput) {
  const componentTotal = money(input.creatorAmount + input.processorFee);
  const providerCost = money(input.providerRefundCost);
  if (componentTotal !== providerCost) throw new Error("commas_refund_cost_components_do_not_conserve");
  const legacyLoss = money(Math.abs(input.legacyRefundAmount) + Math.abs(input.legacyRefundFeeAmount));
  const correctionAmount = money(legacyLoss - providerCost);
  if (correctionAmount < 0) throw new Error("commas_refund_legacy_economics_understated");
  return {
    providerRefundId: input.providerRefundId,
    currency: COMMAS_REFUND_CURRENCY,
    policyVersion: COMMAS_REFUND_CORRECTION_POLICY,
    ledgerType: COMMAS_REFUND_CORRECTION_LEDGER_TYPE,
    legacySellerLoss: legacyLoss,
    providerSellerLoss: providerCost,
    correctionAmount,
    requiresCorrection: correctionAmount > 0,
    idempotencyKey: `reversal:${COMMAS_REFUND_CORRECTION_POLICY}:${input.providerRefundId}`,
  };
}

/** A positive reversal corrects the legacy overstatement without becoming a second refund. */
export function isCommasRefundSellerCostCorrection(row: {
  ledger_type?: string | null;
  platform?: string | null;
  meta?: Record<string, unknown> | null;
  idempotency_key?: string | null;
}) {
  if (row.ledger_type !== COMMAS_REFUND_CORRECTION_LEDGER_TYPE || row.platform !== "commas") return false;
  const policy = String(row.meta?.policy_version || "");
  if (policy === COMMAS_REFUND_CORRECTION_POLICY) return true;
  return String(row.idempotency_key || "").startsWith(`reversal:${COMMAS_REFUND_CORRECTION_POLICY}:`);
}
