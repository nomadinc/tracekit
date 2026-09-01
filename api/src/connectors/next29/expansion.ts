export type Next29CanonicalOrderLine = {
  sourceLineKey: string;
  providerProductId: string | null;
  providerVariantId: string | null;
  sku: string | null;
  title: string | null;
  quantity: number;
  unitAmount: number | null;
  grossAmount: number | null;
  unitCost: number | null;
  currency: string | null;
  isUpsell: boolean;
};

export type Next29CanonicalCustomer = {
  providerCustomerId: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
};

export type Next29CanonicalTransaction = {
  providerTransactionId: string;
  parentTransactionId: string | null;
  externalId: string | null;
  networkTransactionId: string | null;
  authCode: string | null;
  type: string | null;
  status: string | null;
  paymentMethod: string | null;
  gatewayName: string | null;
  amount: number | null;
  currency: string | null;
  occurredAt: string | null;
  isDisputed: boolean;
  isExternal: boolean;
  isTest: boolean;
};

export type Next29CanonicalRefund = {
  providerRefundId: string;
  amount: number | null;
  currency: string | null;
  occurredAt: string | null;
  transactionIds: string[];
};

export type Next29CanonicalExpansion = {
  lines: Next29CanonicalOrderLine[];
  customer: Next29CanonicalCustomer | null;
  transactions: Next29CanonicalTransaction[];
  refunds: Next29CanonicalRefund[];
  attribution: Record<string, unknown>;
};

export function expandNext29Order(rawOrder: unknown): Next29CanonicalExpansion {
  const order = object(rawOrder);
  return {
    lines: array(order.lines).map(normalizeLine).filter((value): value is Next29CanonicalOrderLine => value !== null),
    customer: normalizeCustomer(order.user),
    transactions: array(order.transactions).map(normalizeTransaction).filter((value): value is Next29CanonicalTransaction => value !== null),
    refunds: array(order.refunds).map(normalizeRefund).filter((value): value is Next29CanonicalRefund => value !== null),
    attribution: safeAttribution(order.attribution),
  };
}

function normalizeLine(value: unknown): Next29CanonicalOrderLine | null {
  const line = object(value);
  const id = opaqueId(line.id);
  if (!id) return null;
  const quantity = integer(line.quantity);
  const unitAmount = money(line.price_incl_tax ?? line.original_price_incl_tax);
  return {
    sourceLineKey: id,
    providerProductId: opaqueId(line.product_id),
    providerVariantId: opaqueId(line.variant_id),
    sku: text(line.sku),
    title: text(line.product_title ?? line.variant_title),
    quantity: quantity ?? 0,
    unitAmount,
    grossAmount: unitAmount === null || quantity === null ? null : roundMoney(unitAmount * quantity),
    unitCost: money(line.unit_cost),
    currency: currency(line.currency),
    isUpsell: line.is_upsell === true,
  };
}

function normalizeCustomer(value: unknown): Next29CanonicalCustomer | null {
  const user = object(value);
  const providerCustomerId = opaqueId(user.id);
  if (!providerCustomerId) return null;
  const first = text(user.first_name);
  const last = text(user.last_name);
  const displayName = [first, last].filter(Boolean).join(" ") || null;
  return {
    providerCustomerId,
    email: email(user.email),
    phone: text(user.phone_number),
    displayName,
  };
}

function normalizeTransaction(value: unknown): Next29CanonicalTransaction | null {
  const tx = object(value);
  const providerTransactionId = opaqueId(tx.id);
  if (!providerTransactionId) return null;
  const paymentDetails = object(tx.payment_details);
  const gateway = object(paymentDetails.gateway);
  return {
    providerTransactionId,
    parentTransactionId: opaqueId(tx.parent_id),
    externalId: text(tx.external_id),
    networkTransactionId: text(tx.network_transaction_id),
    authCode: text(tx.auth_code),
    type: text(tx.type),
    status: text(tx.status),
    paymentMethod: text(tx.payment_method),
    gatewayName: text(gateway.name),
    amount: money(tx.amount),
    currency: currency(tx.currency),
    occurredAt: timestamp(tx.date_created),
    isDisputed: tx.is_disputed === true,
    isExternal: tx.is_external === true,
    isTest: tx.is_test === true,
  };
}

function normalizeRefund(value: unknown): Next29CanonicalRefund | null {
  const refund = object(value);
  const providerRefundId = opaqueId(refund.id);
  if (!providerRefundId) return null;
  const txIds = array(refund.transactions).map((tx) => opaqueId(object(tx).id)).filter((id): id is string => Boolean(id));
  const report = object(refund.report_values);
  return {
    providerRefundId,
    amount: money(refund.total_refund_amount ?? report.total_refund_amount),
    currency: currency(report.currency),
    occurredAt: timestamp(refund.created_at),
    transactionIds: [...new Set(txIds)],
  };
}

function safeAttribution(value: unknown): Record<string, unknown> {
  const source = object(value);
  const allowed = ["affiliate", "funnel", "gclid", "subaffiliate1", "subaffiliate2", "subaffiliate3", "subaffiliate4", "subaffiliate5", "utm_campaign", "utm_content", "utm_medium", "utm_source", "utm_term"];
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) out[key] = value.trim();
  }
  if (source.metadata && typeof source.metadata === "object" && !Array.isArray(source.metadata)) out.metadata = source.metadata;
  return out;
}

function object(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function text(value: unknown) { const result = String(value ?? "").trim(); return result || null; }
function opaqueId(value: unknown) { const result = text(value); return result && result.length <= 200 ? result : null; }
function integer(value: unknown) { const result = Number(value); return Number.isInteger(result) && result >= 0 ? result : null; }
function money(value: unknown) { if (value === null || value === undefined || value === "") return null; const result = Number(value); return Number.isFinite(result) ? result : null; }
function currency(value: unknown) { const result = String(value ?? "").trim().toUpperCase(); return /^[A-Z]{3}$/.test(result) ? result : null; }
function timestamp(value: unknown) { const result = String(value ?? "").trim(); if (!result) return null; const parsed = new Date(result); return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString(); }
function email(value: unknown) { const result = text(value)?.toLowerCase() ?? null; return result && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result) ? result : null; }
function roundMoney(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
