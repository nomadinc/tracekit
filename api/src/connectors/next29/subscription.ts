export type Next29CanonicalSubscriptionLine = {
  providerLineId: string;
  providerProductId: string | null;
  providerVariantId: string | null;
  sku: string | null;
  title: string | null;
  quantity: number;
  recurringUnitAmount: number | null;
};

export type Next29CanonicalSubscriptionOrder = {
  providerOrderId: string;
  billingCycle: number | null;
};

export type Next29CanonicalSubscription = {
  providerSubscriptionId: string;
  providerCustomerId: string | null;
  status: "active" | "past_due" | "canceled" | "retrying" | "paused" | "unknown";
  currency: string | null;
  recurringAmount: number | null;
  interval: "day" | "month" | "unknown";
  intervalCount: number | null;
  nextRenewalAt: string | null;
  createdAt: string | null;
  cancelReason: string | null;
  isTest: boolean;
  paymentMethod: string | null;
  lines: Next29CanonicalSubscriptionLine[];
  renewalOrders: Next29CanonicalSubscriptionOrder[];
  attribution: Record<string, unknown>;
};

const STATUSES = new Set(["active", "past_due", "canceled", "retrying", "paused"]);
const ATTRIBUTION_KEYS = [
  "affiliate", "funnel", "gclid", "subaffiliate1", "subaffiliate2", "subaffiliate3", "subaffiliate4", "subaffiliate5",
  "utm_campaign", "utm_content", "utm_medium", "utm_source", "utm_term",
];

export function normalizeNext29Subscription(raw: unknown): Next29CanonicalSubscription {
  const source = object(raw);
  const providerSubscriptionId = requiredId(source.id, "subscription id");
  const user = object(source.user);
  const intervalRaw = text(source.interval)?.toLowerCase() ?? null;
  const statusRaw = text(source.status)?.toLowerCase() ?? null;

  return {
    providerSubscriptionId,
    providerCustomerId: id(user.id),
    status: statusRaw && STATUSES.has(statusRaw) ? statusRaw as Next29CanonicalSubscription["status"] : "unknown",
    currency: currency(source.currency),
    recurringAmount: money(source.total),
    interval: intervalRaw === "day" || intervalRaw === "month" ? intervalRaw : "unknown",
    intervalCount: positiveInteger(source.interval_count),
    nextRenewalAt: timestamp(source.next_renewal_date),
    createdAt: timestamp(source.date_created),
    cancelReason: boundedText(source.cancel_reason, 200),
    isTest: source.is_test === true,
    paymentMethod: boundedText(source.payment_method, 100),
    lines: array(source.lines).map(normalizeLine).filter((line): line is Next29CanonicalSubscriptionLine => line !== null),
    renewalOrders: array(source.orders).map(normalizeRenewalOrder).filter((order): order is Next29CanonicalSubscriptionOrder => order !== null),
    attribution: safeAttribution(source.attribution),
  };
}

export function next29SubscriptionRebillKeys(subscription: Next29CanonicalSubscription) {
  return subscription.renewalOrders.map((order) => ({
    providerSubscriptionId: subscription.providerSubscriptionId,
    providerOrderId: order.providerOrderId,
    billingCycle: order.billingCycle,
    key: `next29:${subscription.providerSubscriptionId}:order:${order.providerOrderId}`,
  }));
}

function normalizeLine(value: unknown): Next29CanonicalSubscriptionLine | null {
  const source = object(value);
  const providerLineId = id(source.id);
  if (!providerLineId) return null;
  return {
    providerLineId,
    providerProductId: id(source.product_id),
    providerVariantId: id(source.variant_id),
    sku: boundedText(source.sku, 200),
    title: boundedText(source.product_title ?? source.variant_title, 500),
    quantity: nonNegativeInteger(source.quantity) ?? 0,
    recurringUnitAmount: money(source.price),
  };
}

function normalizeRenewalOrder(value: unknown): Next29CanonicalSubscriptionOrder | null {
  const source = object(value);
  const providerOrderId = id(source.order_number);
  if (!providerOrderId) return null;
  return {
    providerOrderId,
    billingCycle: nonNegativeInteger(source.billing_cycle),
  };
}

function safeAttribution(value: unknown) {
  const source = object(value);
  const out: Record<string, unknown> = {};
  for (const key of ATTRIBUTION_KEYS) {
    const normalized = boundedText(source[key], 500);
    if (normalized) out[key] = normalized;
  }
  if (source.metadata && typeof source.metadata === "object" && !Array.isArray(source.metadata)) out.metadata = source.metadata;
  return out;
}

function object(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function text(value: unknown) { const result = String(value ?? "").trim(); return result || null; }
function boundedText(value: unknown, max: number) { const result = text(value); return result && result.length <= max ? result : null; }
function id(value: unknown) { return boundedText(value, 200); }
function requiredId(value: unknown, label: string) { const result = id(value); if (!result) throw new Error(`29Next ${label} is required.`); return result; }
function money(value: unknown) { if (value === null || value === undefined || value === "") return null; const result = Number(value); return Number.isFinite(result) ? result : null; }
function positiveInteger(value: unknown) { const result = Number(value); return Number.isInteger(result) && result > 0 ? result : null; }
function nonNegativeInteger(value: unknown) { const result = Number(value); return Number.isInteger(result) && result >= 0 ? result : null; }
function currency(value: unknown) { const result = String(value ?? "").trim().toUpperCase(); return /^[A-Z]{3}$/.test(result) ? result : null; }
function timestamp(value: unknown) { const result = text(value); if (!result) return null; const parsed = new Date(result); return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString(); }
