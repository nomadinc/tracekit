export const COMMAS_REFUND_FORWARD_POLICY = "commas-refund-created-seller-cost-v1" as const;

export type RefundEconomicSource = "transaction_page" | "refund_created";

export function commasRefundEconomicOwner(input: {
  source: RefundEconomicSource;
  refundCreatedAt: string;
  forwardActivatedAt: string | null;
}) {
  const refundAt = Date.parse(input.refundCreatedAt);
  if (!Number.isFinite(refundAt)) return { owned: false as const, reason: "invalid_refund_created_at" as const };
  if (!input.forwardActivatedAt) {
    return input.source === "transaction_page"
      ? { owned: true as const, reason: "pre_activation_transaction_authority" as const }
      : { owned: false as const, reason: "refund_created_not_activated" as const };
  }
  const activationAt = Date.parse(input.forwardActivatedAt);
  if (!Number.isFinite(activationAt)) return { owned: false as const, reason: "invalid_activation_epoch" as const };
  const forward = refundAt >= activationAt;
  if (forward) {
    return input.source === "refund_created"
      ? { owned: true as const, reason: "forward_webhook_authority" as const }
      : { owned: false as const, reason: "forward_transaction_reconciliation_only" as const };
  }
  return input.source === "transaction_page"
    ? { owned: true as const, reason: "historical_transaction_authority" as const }
    : { owned: false as const, reason: "pre_epoch_webhook_non_authority" as const };
}

export function crossSurfaceRefundIdEqualitySupported() {
  return false as const;
}
