export const COMMAS_REFUND_CREATED_EVENT_TYPE = "refund.created" as const;
export const COMMAS_REFUND_CREATED_POLICY = "commas-refund-created-seller-cost-v1" as const;
export const COMMAS_REFUND_CURRENCY = "USD" as const;

export type CommasRefundStatus = "success" | "pending" | "failed";
export type CommasRefundType = "full" | "partial" | null;

type Json = Record<string, unknown>;
const object = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const text = (value: unknown, max = 512) => typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : null;
const money = (value: unknown) => { const n = Number(value); return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : null; };

export function isCommasPublicTransactionId(value: unknown): value is string {
  return typeof value === "string" && /^ORD-[A-Za-z0-9_-]{1,120}$/.test(value.trim());
}

export type NormalizedCommasRefundCreated = {
  providerEventId: string;
  providerRefundId: string;
  originalPaymentId: string;
  paymentIdentityState: "ord" | "legacy_hashid";
  refundTransactionId: string | null;
  buyerAmount: number;
  providerRefundCost: number;
  creatorAmount: number;
  processorFee: number | null;
  affiliateCommissionClawback: number | null;
  status: CommasRefundStatus;
  refundType: CommasRefundType;
  reason: string | null;
  arn: string | null;
  createdAt: string;
  updatedAt: string | null;
  processorRefundId: string | null;
  processorChargeId: string | null;
  currency: typeof COMMAS_REFUND_CURRENCY;
  policyVersion: typeof COMMAS_REFUND_CREATED_POLICY;
};

export function normalizeCommasRefundCreated(payload: unknown): NormalizedCommasRefundCreated | null {
  const root = object(payload);
  if (text(root.type ?? root.event_type, 64) !== COMMAS_REFUND_CREATED_EVENT_TYPE) return null;
  const data = object(root.data);
  const processor = object(data.processor ?? root.processor);
  const providerEventId = text(root.id ?? root.event_id, 256);
  const providerRefundId = text(data.refund_id ?? root.refund_id, 256);
  const originalPaymentId = text(data.original_payment_id ?? root.original_payment_id, 256);
  const createdAt = text(data.created_at ?? root.created_at, 64);
  const statusRaw = text(data.status ?? root.status, 32)?.toLowerCase();
  const status = statusRaw === "success" || statusRaw === "pending" || statusRaw === "failed" ? statusRaw : null;
  const refundTypeRaw = text(data.refund_type ?? root.refund_type, 32)?.toLowerCase();
  const refundType = refundTypeRaw === "full" || refundTypeRaw === "partial" ? refundTypeRaw : null;
  const buyerAmount = money(data.amount ?? root.amount);
  const providerRefundCost = money(data.refund_cost ?? root.refund_cost);
  const creatorAmount = money(data.refund_cost_creator_amount ?? root.refund_cost_creator_amount);
  const processorFee = money(processor.processor_refund_cost_fee);
  if (!providerEventId || !providerRefundId || !originalPaymentId || !createdAt || !status || buyerAmount === null || providerRefundCost === null || creatorAmount === null) return null;
  if (buyerAmount < 0 || providerRefundCost < 0 || creatorAmount < 0 || (processorFee !== null && processorFee < 0)) return null;
  if (processorFee !== null && Math.abs((creatorAmount + processorFee) - providerRefundCost) > 0.005) return null;
  return {
    providerEventId, providerRefundId, originalPaymentId,
    paymentIdentityState: isCommasPublicTransactionId(originalPaymentId) ? "ord" : "legacy_hashid",
    refundTransactionId: text(data.refund_transaction_id ?? root.refund_transaction_id, 256),
    buyerAmount, providerRefundCost, creatorAmount, processorFee,
    affiliateCommissionClawback: money(data.refund_cost_affiliate_commission ?? root.refund_cost_affiliate_commission),
    status, refundType, reason: text(data.reason ?? root.reason, 512), arn: text(data.arn ?? root.arn, 256),
    createdAt, updatedAt: text(data.updated_at ?? root.updated_at, 64),
    processorRefundId: text(processor.processor_refund_id, 256), processorChargeId: text(processor.processor_charge_id, 256),
    currency: COMMAS_REFUND_CURRENCY, policyVersion: COMMAS_REFUND_CREATED_POLICY,
  };
}

export function refundCreatedFinancialDecision(refund: NormalizedCommasRefundCreated) {
  if (refund.status === "pending") return { state: "provider_settlement_unobservable" as const, postEconomics: false, amount: null, currency: COMMAS_REFUND_CURRENCY };
  if (refund.status === "failed") return { state: "failed_no_economics" as const, postEconomics: false, amount: null, currency: COMMAS_REFUND_CURRENCY };
  return { state: "realized" as const, postEconomics: true, amount: -Math.abs(refund.providerRefundCost), currency: COMMAS_REFUND_CURRENCY };
}

export function pendingCommasRefundSettlementReadContract() {
  return { supported: false as const, reason: "unsupported_pending_settlement_read" as const };
}
