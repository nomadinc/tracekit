export type CheckoutChampTransactionEvidence = {
  providerTransactionId: string;
  parentProviderTransactionId: string | null;
  providerOrderId: string | null;
  actualOrderId: string | null;
  clientOrderId: string | null;
  transactionType: string | null;
  transactionStatus: string | null;
  billingCycleNumber: number | null;
  funnelReferenceId: string | null;
  attribution: {
    affiliateId: string | null;
    explicitEverflowTransactionId: string | null;
    custom1: string | null;
    custom2: string | null;
    custom3: string | null;
    utmSource: string | null;
    utmCampaign: string | null;
  };
  raw: Record<string, unknown>;
};

export function normalizeCheckoutChampTransaction(input: unknown): CheckoutChampTransactionEvidence | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const row = input as Record<string, unknown>;
  const providerTransactionId = text(row.transactionId ?? row.transaction_id ?? row.txnId);
  if (!providerTransactionId) return null;
  return {
    providerTransactionId,
    parentProviderTransactionId: nullable(row.parentTxnId ?? row.parentTransactionId ?? row.parent_transaction_id),
    providerOrderId: nullable(row.orderId ?? row.order_id),
    actualOrderId: nullable(row.actualOrderId ?? row.actual_order_id),
    clientOrderId: nullable(row.clientOrderId ?? row.client_order_id),
    transactionType: nullable(row.txnType ?? row.transactionType ?? row.type),
    transactionStatus: nullable(row.transactionStatus ?? row.status ?? row.responseType),
    billingCycleNumber: integerOrNull(row.billingCycleNumber ?? row.billing_cycle_number),
    funnelReferenceId: nullable(row.funnelReferenceId ?? row.funnel_reference_id ?? row.sessionId),
    attribution: {
      affiliateId: nullable(row.affId ?? row.affiliateId ?? row.affiliate_id),
      explicitEverflowTransactionId: explicitEverflowTid(row),
      custom1: nullable(row.custom1),
      custom2: nullable(row.custom2),
      custom3: nullable(row.custom3),
      utmSource: nullable(row.UTMSource ?? row.utmSource ?? row.utm_source),
      utmCampaign: nullable(row.UTMCampaign ?? row.utmCampaign ?? row.utm_campaign),
    },
    raw: row,
  };
}

export function explicitEverflowTid(row: Record<string, unknown>) {
  return nullable(row._ef_transaction_id ?? row.ef_transaction_id ?? row.everflow_transaction_id);
}

function text(value: unknown) { return String(value ?? "").trim(); }
function nullable(value: unknown) { const v=text(value); return v || null; }
function integerOrNull(value: unknown) { const n=Number(value); return Number.isInteger(n) && n >= 0 ? n : null; }
