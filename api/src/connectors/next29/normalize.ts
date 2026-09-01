import type { Next29Attribution, Next29Order } from "./types.ts";

export type NormalizedNext29Order = {
  sourceObjectId: string;
  providerUpdatedAt: string;
  platformOrderId: string;
  orderId: string;
  orderTs: string;
  status: string | null;
  statusNorm: string | null;
  currency: string | null;
  grossAmount: number | null;
  productSubtotal: number | null;
  taxAmount: number | null;
  discountAmount: number | null;
  isTest: boolean;
  attribution: Record<string, string | null>;
};

export function normalizeNext29Order(order: Next29Order): NormalizedNext29Order {
  const number = requiredOrderNumber(order.number);
  const orderTs = firstTimestamp(order.date_placed, order.created_at, order.updated_at);
  if (!orderTs) throw new Error(`29Next order ${number} does not contain a valid order timestamp.`);
  const providerUpdatedAt = firstTimestamp(order.updated_at, order.date_placed, order.created_at) || orderTs;
  const currency = normalizeCurrency(order.currency);
  const status = optionalText(order.status);
  return {
    sourceObjectId: number,
    providerUpdatedAt,
    platformOrderId: `next29:${number}`,
    orderId: number,
    orderTs,
    status,
    statusNorm: normalizeStatus(status, optionalText(order.payment_status), optionalText(order.fulfillment_status)),
    currency,
    grossAmount: decimal(order.total_incl_tax),
    productSubtotal: decimal(order.total_excl_tax),
    taxAmount: decimal(order.total_tax),
    discountAmount: decimal(order.total_discount),
    isTest: order.is_test === true,
    attribution: normalizeAttribution(order.attribution),
  };
}

export function normalizeNext29Attribution(attribution: Next29Attribution | null | undefined) {
  return normalizeAttribution(attribution);
}

function normalizeAttribution(attribution: Next29Attribution | null | undefined): Record<string, string | null> {
  const source = attribution || {};
  return {
    affiliate: optionalText(source.affiliate),
    funnel: optionalText(source.funnel),
    gclid: optionalText(source.gclid),
    subaffiliate1: optionalText(source.subaffiliate1),
    subaffiliate2: optionalText(source.subaffiliate2),
    subaffiliate3: optionalText(source.subaffiliate3),
    subaffiliate4: optionalText(source.subaffiliate4),
    subaffiliate5: optionalText(source.subaffiliate5),
    utm_campaign: optionalText(source.utm_campaign),
    utm_content: optionalText(source.utm_content),
    utm_medium: optionalText(source.utm_medium),
    utm_source: optionalText(source.utm_source),
    utm_term: optionalText(source.utm_term),
  };
}

function requiredOrderNumber(value: unknown) {
  const result = String(value ?? "").trim();
  if (!result || result.length > 200) throw new Error("29Next order is missing a durable order number.");
  return result;
}

function firstTimestamp(...values: unknown[]) {
  for (const value of values) {
    const text = optionalText(value);
    if (!text) continue;
    const parsed = new Date(text);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  }
  return null;
}

function normalizeCurrency(value: unknown) {
  const currency = optionalText(value)?.toUpperCase() || null;
  return currency && /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function decimal(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStatus(status: string | null, payment: string | null, fulfillment: string | null) {
  const values = [status, payment, fulfillment].filter(Boolean).map((value) => String(value).toLowerCase());
  if (values.some((value) => /cancel|void|declin|fail/.test(value))) return "cancelled";
  if (values.some((value) => /refund/.test(value))) return "refunded";
  if (values.some((value) => /paid|complete|fulfilled|shipped/.test(value))) return "completed";
  if (values.some((value) => /pending|processing|unfulfilled/.test(value))) return "pending";
  return status ? status.toLowerCase() : null;
}

function optionalText(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const result = String(value).trim();
  return result || null;
}
