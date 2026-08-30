import type { ShopifyPersistedRecord } from "./persistence";

export type ShopifyOrderDraft = {
  platform: "shopify";
  platform_order_id: string;
  platform_store_id: string | null;
  provider_order_id: string;
  order_id: string;
  order_ts: string;
  status: string;
  status_norm: string;
  currency: string;
  gross_amount: number | null;
  product_subtotal: number | null;
  shipping_amount: number | null;
  tax_amount: number | null;
  email: string | null;
  phone: string | null;
  transaction_id: string | null;
  raw_json: Record<string, unknown>;
};

export function normalizeShopifyOrderRecord(record: ShopifyPersistedRecord, shopDomain?: string | null): ShopifyOrderDraft {
  if (record.resource !== "orders") throw new Error("Shopify order normalization only accepts order records.");
  const order = record.payload as Record<string, any>;
  const providerOrderId = required(order.id, "Shopify order id");
  const storeId = clean(shopDomain);
  if (!storeId) throw new Error("Shopify order normalization requires a shop domain for multi-store identity.");
  const createdAt = iso(order.createdAt || order.processedAt || order.updatedAt, "Shopify order timestamp");
  const status = String(order.displayFinancialStatus || order.financialStatus || order.status || "UNKNOWN").toUpperCase();
  const cancelled = Boolean(order.cancelledAt);
  const statusNorm = cancelled ? "CANCELLED" : normalizeFinancialStatus(status);
  const total = money(order.currentTotalPriceSet ?? order.totalPriceSet ?? order.totalPrice);
  const subtotal = money(order.currentSubtotalPriceSet ?? order.subtotalPriceSet ?? order.subtotalPrice);
  const shipping = money(order.currentTotalShippingPriceSet ?? order.totalShippingPriceSet ?? order.totalShippingPrice);
  const tax = money(order.currentTotalTaxSet ?? order.totalTaxSet ?? order.totalTax);
  const currency = currencyCode(order.currentTotalPriceSet ?? order.totalPriceSet ?? order.totalPrice, order.currencyCode || "USD");
  const transactions = connectionNodes(order.transactions);
  const sale = transactions.find((tx) => ["SALE", "CAPTURE"].includes(String(tx.kind || "").toUpperCase()) && String(tx.status || "").toUpperCase().startsWith("SUCCESS")) || transactions[0];

  return {
    platform: "shopify",
    platform_order_id: `shopify:${storeId}:${providerOrderId}`,
    platform_store_id: storeId,
    provider_order_id: providerOrderId,
    order_id: clean(order.name) || clean(order.legacyResourceId) || gidTail(providerOrderId),
    order_ts: createdAt,
    status,
    status_norm: statusNorm,
    currency,
    gross_amount: total,
    product_subtotal: subtotal,
    shipping_amount: shipping,
    tax_amount: tax,
    email: clean(order.email) || clean(order.customer?.email) || null,
    phone: clean(order.phone) || clean(order.customer?.phone) || clean(order.shippingAddress?.phone) || clean(order.billingAddress?.phone) || null,
    transaction_id: clean(sale?.id) || null,
    raw_json: order,
  };
}

export function normalizeShopifyProductRecord(record: ShopifyPersistedRecord) {
  if (record.resource !== "products") throw new Error("Shopify product normalization only accepts product records.");
  const product = record.payload as Record<string, any>;
  return {
    provider_product_id: required(product.id, "Shopify product id"),
    title: clean(product.title) || "Unknown Shopify Product",
    description: clean(product.descriptionPlainSummary) || clean(product.description) || null,
    updated_at: record.providerUpdatedAt,
    variants: connectionNodes(product.variants).map((variant) => ({
      provider_variant_id: required(variant.id, "Shopify variant id"),
      title: clean(variant.title) || null,
      sku: clean(variant.sku) || null,
      price: money(variant.price),
    })),
    raw_json: product,
  };
}

export function normalizeShopifyCustomerRecord(record: ShopifyPersistedRecord) {
  if (record.resource !== "customers") throw new Error("Shopify customer normalization only accepts customer records.");
  const customer = record.payload as Record<string, any>;
  const name = [clean(customer.firstName), clean(customer.lastName)].filter(Boolean).join(" ");
  return {
    provider_customer_id: required(customer.id, "Shopify customer id"),
    display_name: name || clean(customer.displayName) || null,
    email: clean(customer.email) || null,
    phone: clean(customer.phone) || null,
    updated_at: record.providerUpdatedAt,
    raw_json: customer,
  };
}

function normalizeFinancialStatus(value: string) {
  if (value.includes("REFUND")) return "REFUNDED";
  if (value.includes("PAID")) return "COMPLETED";
  if (value.includes("AUTHORIZED") || value.includes("PENDING")) return "PENDING";
  if (value.includes("VOID") || value.includes("CANCEL")) return "CANCELLED";
  return value || "UNKNOWN";
}

function connectionNodes(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.nodes)) return value.nodes.filter(Boolean);
  if (Array.isArray(value?.edges)) return value.edges.map((edge: any) => edge?.node).filter(Boolean);
  return [];
}

function money(value: any): number | null {
  const raw = value?.shopMoney?.amount ?? value?.presentmentMoney?.amount ?? value?.amount ?? value;
  if (raw === null || raw === undefined || raw === "") return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

function currencyCode(value: any, fallback: string) {
  return String(value?.shopMoney?.currencyCode ?? value?.presentmentMoney?.currencyCode ?? value?.currencyCode ?? fallback).toUpperCase();
}

function gidTail(value: string) {
  return value.split("/").filter(Boolean).at(-1) || value;
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function required(value: unknown, label: string) {
  const result = clean(value);
  if (!result) throw new Error(`${label} is required.`);
  return result;
}

function iso(value: unknown, label: string) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) throw new Error(`${label} is required.`);
  return date.toISOString();
}
