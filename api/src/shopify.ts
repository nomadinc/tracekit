export const DEFAULT_SHOPIFY_API_VERSION = "2026-07";

export type ShopifyLedgerType = "sale" | "refund" | "chargeback" | "processor_fee";

export type ShopifyLedgerEvent = {
  ledgerType: ShopifyLedgerType;
  transactionId: string;
  parentTransactionId?: string | null;
  amount: number;
  currency: string;
  status: string;
  reason: string;
  occurredAt: string;
  orderId: string;
  raw: any;
};

export type ShopifyPlatformOrderDraft = {
  platform: "shopify";
  platform_order_id: string;
  platform_store_id: string;
  order_id: string;
  order_ts: string;
  status: string;
  status_norm: string;
  gross_amount: number;
  currency: string;
  email: string | null;
  phone: string | null;
  transaction_id: string | null;
  tkid: string | null;
  affiliate_id: string | null;
  everflow_offer_id: string | null;
  source_id: string | null;
  sub1: string | null;
  sub2: string | null;
  sub3: string | null;
  sub4: string | null;
  sub5: string | null;
  product_subtotal: number | null;
  shipping_amount: number | null;
  tax_amount: number | null;
  product_cost: number | null;
  shipping_cost: number | null;
  gateway_fee: number | null;
  chargeback_fee: number | null;
  tracking_number: string | null;
  shipping_carrier: string | null;
  raw_json: any;
};

const SHOPIFY_API_VERSION_RE = /^\d{4}-\d{2}$/;

export function normalizeShopifyApiVersion(value: unknown) {
  const raw = String(value ?? "").trim();
  return SHOPIFY_API_VERSION_RE.test(raw) ? raw : DEFAULT_SHOPIFY_API_VERSION;
}

export function normalizeShopifyShopDomain(value: unknown) {
  let raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";

  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

  let host = "";
  try {
    host = new URL(raw).hostname;
  } catch {
    return "";
  }

  host = host.replace(/^admin\./, "").replace(/\/+$/, "");
  if (/^[a-z0-9][a-z0-9-]*$/.test(host)) host = `${host}.myshopify.com`;
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(host)) return "";
  return host;
}

export function shopifyAdminGraphqlUrl(shopDomain: string, apiVersion: string) {
  return `https://${shopDomain}/admin/api/${normalizeShopifyApiVersion(apiVersion)}/graphql.json`;
}

export function buildShopifyOrderSearchQuery(args: { from: string; to: string; filter?: string | null }) {
  const parts = [`created_at:>=${args.from}`, `created_at:<=${args.to}`];
  const filter = String(args.filter ?? "").trim().toLowerCase();

  const financialStatusMap: Record<string, string> = {
    authorized: "authorized",
    paid: "paid",
    completed: "paid",
    pending: "pending",
    refunded: "refunded",
    partially_refunded: "partially_refunded",
    voided: "voided",
  };

  if (filter === "cancelled" || filter === "canceled") {
    parts.push("cancelled_at:*");
  } else if (filter && filter !== "all_sales" && financialStatusMap[filter]) {
    parts.push(`financial_status:${financialStatusMap[filter]}`);
  }

  return parts.join(" ");
}

export function gidTail(value: unknown) {
  const s = String(value ?? "").trim();
  if (!s) return "";
  return s.split("/").filter(Boolean).pop() || s;
}

export function moneyAmount(value: any): number | null {
  const amount =
    value?.shopMoney?.amount ??
    value?.presentmentMoney?.amount ??
    value?.amount ??
    value?.amountSet?.shopMoney?.amount ??
    value;
  const n = Number(String(amount ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function moneyCurrency(value: any, fallback = "USD") {
  return String(
    value?.shopMoney?.currencyCode ??
      value?.presentmentMoney?.currencyCode ??
      value?.currencyCode ??
      value?.amountSet?.shopMoney?.currencyCode ??
      fallback,
  );
}

function edgesToNodes(connection: any) {
  if (Array.isArray(connection)) return connection;
  if (!connection?.edges || !Array.isArray(connection.edges)) return [];
  return connection.edges.map((edge: any) => edge?.node).filter(Boolean);
}

function firstNonEmpty(...values: any[]) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

function normalizeShopifyOrderStatus(order: any) {
  if (order?.cancelledAt) return "CANCELLED";

  const raw = String(order?.displayFinancialStatus ?? order?.financialStatus ?? order?.status ?? "").toUpperCase();
  if (!raw) return "UNKNOWN";
  if (raw.includes("REFUND")) return "REFUNDED";
  if (raw.includes("PAID")) return "COMPLETED";
  if (raw.includes("AUTHORIZED") || raw.includes("PENDING")) return "PENDING";
  if (raw.includes("VOID") || raw.includes("EXPIRED") || raw.includes("CANCEL")) return "CANCELLED";
  return raw;
}

function customAttributeMap(order: any) {
  const attrs: Record<string, string> = {};
  for (const attr of order?.customAttributes || []) {
    const key = String(attr?.key ?? "").trim().toLowerCase();
    const value = String(attr?.value ?? "").trim();
    if (key && value) attrs[key] = value;
  }
  return attrs;
}

function pickAttribute(attrs: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const value = attrs[key.toLowerCase()];
    if (value) return value;
  }
  return "";
}

function normalizedLineItems(order: any) {
  return edgesToNodes(order?.lineItems).map((item: any) => ({
    id: item?.id ?? null,
    title: item?.title ?? item?.name ?? null,
    name: item?.name ?? item?.title ?? null,
    sku: item?.sku ?? item?.variant?.sku ?? null,
    quantity: Number(item?.quantity ?? 0) || 0,
    variant_id: item?.variant?.id ?? null,
    product_id: item?.product?.id ?? null,
    original_total: moneyAmount(item?.originalTotalSet),
    discounted_total: moneyAmount(item?.discountedTotalSet),
  }));
}

function normalizedRefunds(order: any) {
  return (order?.refunds || []).map((refund: any) => ({
    id: refund?.id ?? null,
    created_at: refund?.createdAt ?? null,
    note: refund?.note ?? null,
    total_refunded: moneyAmount(refund?.totalRefundedSet),
    currency: moneyCurrency(refund?.totalRefundedSet, moneyCurrency(order?.totalPriceSet)),
    refund_line_items: edgesToNodes(refund?.refundLineItems).map((item: any) => ({
      id: item?.id ?? null,
      quantity: Number(item?.quantity ?? 0) || 0,
      subtotal: moneyAmount(item?.subtotalSet),
      tax: moneyAmount(item?.totalTaxSet),
      line_item_id: item?.lineItem?.id ?? null,
      sku: item?.lineItem?.sku ?? item?.lineItem?.variant?.sku ?? null,
      title: item?.lineItem?.title ?? item?.lineItem?.name ?? null,
    })),
  }));
}

function normalizedTransactions(order: any) {
  return edgesToNodes(order?.transactions).map((tx: any) => ({
    id: tx?.id ?? null,
    kind: tx?.kind ?? null,
    status: tx?.status ?? null,
    gateway: tx?.gateway ?? null,
    created_at: tx?.createdAt ?? tx?.processedAt ?? null,
    amount: moneyAmount(tx?.amountSet),
    currency: moneyCurrency(tx?.amountSet, moneyCurrency(order?.totalPriceSet)),
    fees: (tx?.fees || []).map((fee: any) => ({
      type: fee?.type ?? null,
      amount: moneyAmount(fee?.amount),
      currency: moneyCurrency(fee?.amount, moneyCurrency(tx?.amountSet, moneyCurrency(order?.totalPriceSet))),
    })),
  }));
}

export function normalizeShopifyOrderForPlatformOrder(order: any, shopDomain: string): ShopifyPlatformOrderDraft | null {
  const orderGid = String(order?.id ?? "").trim();
  const fallbackId = firstNonEmpty(order?.legacyResourceId, order?.name, order?.orderNumber);
  const canonicalOrderId = orderGid || fallbackId;
  if (!canonicalOrderId) return null;

  const attrs = customAttributeMap(order);
  const lineItems = normalizedLineItems(order);
  const refunds = normalizedRefunds(order);
  const transactions = normalizedTransactions(order);
  const status = normalizeShopifyOrderStatus(order);
  const currency = moneyCurrency(order?.currentTotalPriceSet, moneyCurrency(order?.totalPriceSet, String(order?.currencyCode ?? "USD")));
  const gross =
    moneyAmount(order?.currentTotalPriceSet) ??
    moneyAmount(order?.totalPriceSet) ??
    0;

  const saleTransaction = transactions.find((tx: any) => {
    const kind = String(tx.kind ?? "").toUpperCase();
    const txStatus = String(tx.status ?? "").toUpperCase();
    return ["SALE", "CAPTURE"].includes(kind) && ["SUCCESS", "SUCCESSFUL"].includes(txStatus);
  }) || transactions.find((tx: any) => String(tx.id ?? "").trim());

  const email = firstNonEmpty(order?.email, order?.customer?.email);
  const phone = firstNonEmpty(order?.phone, order?.customer?.phone, order?.shippingAddress?.phone, order?.billingAddress?.phone);
  const sourceId = firstNonEmpty(
    order?.sourceIdentifier,
    pickAttribute(attrs, "source_id", "source", "utm_source"),
    order?.sourceName,
  );

  return {
    platform: "shopify",
    platform_order_id: canonicalOrderId,
    platform_store_id: shopDomain,
    order_id: firstNonEmpty(order?.name, order?.orderNumber, order?.legacyResourceId, gidTail(orderGid)),
    order_ts: firstNonEmpty(order?.processedAt, order?.createdAt, order?.updatedAt) || new Date(0).toISOString(),
    status,
    status_norm: status,
    gross_amount: gross,
    currency,
    email: email || null,
    phone: phone || null,
    transaction_id: saleTransaction?.id ?? null,
    tkid: pickAttribute(attrs, "tkid", "tk_id", "tracekit_id") || null,
    affiliate_id: pickAttribute(attrs, "affiliate_id", "affid", "affiliate") || null,
    everflow_offer_id: pickAttribute(attrs, "offer_id", "oid", "everflow_offer_id") || null,
    source_id: sourceId || null,
    sub1: pickAttribute(attrs, "sub1", "s1") || null,
    sub2: pickAttribute(attrs, "sub2", "s2") || null,
    sub3: pickAttribute(attrs, "sub3", "s3") || null,
    sub4: pickAttribute(attrs, "sub4", "s4") || null,
    sub5: pickAttribute(attrs, "sub5", "s5", "everflow_transaction_id", "ef_transaction_id") || null,
    product_subtotal: moneyAmount(order?.subtotalPriceSet),
    shipping_amount: moneyAmount(order?.totalShippingPriceSet),
    tax_amount: moneyAmount(order?.currentTotalTaxSet) ?? moneyAmount(order?.totalTaxSet),
    product_cost: null,
    shipping_cost: null,
    gateway_fee: totalTransactionFees(transactions),
    chargeback_fee: null,
    tracking_number: firstNonEmpty(order?.fulfillments?.[0]?.trackingInfo?.[0]?.number) || null,
    shipping_carrier: firstNonEmpty(order?.fulfillments?.[0]?.trackingInfo?.[0]?.company) || null,
    raw_json: {
      ...order,
      shop_domain: shopDomain,
      customer_gid: order?.customer?.id ?? null,
      customer_legacy_resource_id: order?.customer?.legacyResourceId ?? null,
      line_items: lineItems,
      refunds,
      transactions,
      discounts: {
        total_discounts: moneyAmount(order?.currentTotalDiscountsSet) ?? moneyAmount(order?.totalDiscountsSet),
        discount_codes: order?.discountCodes ?? [],
        discount_applications: edgesToNodes(order?.discountApplications),
      },
      attribution: {
        source_name: order?.sourceName ?? null,
        source_identifier: order?.sourceIdentifier ?? null,
        custom_attributes: order?.customAttributes ?? [],
      },
    },
  };
}

function totalTransactionFees(transactions: any[]) {
  let total = 0;
  for (const tx of transactions) {
    for (const fee of tx.fees || []) {
      const amount = Number(fee.amount ?? 0);
      if (Number.isFinite(amount)) total += Math.abs(amount);
    }
  }
  return total > 0 ? total : null;
}

export function stableShopifySaleEventId(shopDomain: string, orderId: string) {
  return `shopify:${shopDomain}:${orderId}:sale`;
}

export function stableShopifyRefundEventId(shopDomain: string, refundId: string) {
  return `shopify:${shopDomain}:${refundId}:refund`;
}

export function stableShopifyProcessorFeeEventId(shopDomain: string, transactionId: string, feeIndex: number, feeType: string) {
  return `shopify:${shopDomain}:${transactionId}:${feeType || feeIndex}:processor_fee`;
}

export function stableShopifyChargebackEventId(shopDomain: string, disputeId: string) {
  return `shopify:${shopDomain}:${disputeId}:chargeback`;
}

export function buildShopifyLedgerEventsFromOrder(order: any, shopDomain: string): ShopifyLedgerEvent[] {
  const normalized = normalizeShopifyOrderForPlatformOrder(order, shopDomain);
  if (!normalized) return [];

  const currency = normalized.currency || "USD";
  const events: ShopifyLedgerEvent[] = [];
  const transactions = normalized.raw_json.transactions || [];
  const saleTx = transactions.find((tx: any) => {
    const kind = String(tx.kind ?? "").toUpperCase();
    const status = String(tx.status ?? "").toUpperCase();
    return ["SALE", "CAPTURE"].includes(kind) && ["SUCCESS", "SUCCESSFUL"].includes(status);
  });

  const saleAmount = moneyAmount(saleTx?.amount) ?? moneyAmount(order?.totalPriceSet);
  if (saleAmount != null && saleAmount > 0) {
    events.push({
      ledgerType: "sale",
      transactionId: stableShopifySaleEventId(shopDomain, normalized.platform_order_id),
      parentTransactionId: saleTx?.id ?? null,
      amount: saleAmount,
      currency: saleTx?.currency || currency,
      status: "sale",
      reason: "Shopify import sale",
      occurredAt: firstNonEmpty(saleTx?.created_at, normalized.order_ts),
      orderId: normalized.order_id,
      raw: order,
    });
  }

  for (const refund of normalized.raw_json.refunds || []) {
    const refundId = String(refund.id ?? "").trim();
    const amount = Number(refund.total_refunded ?? 0);
    if (!refundId || !Number.isFinite(amount) || amount <= 0) continue;

    events.push({
      ledgerType: "refund",
      transactionId: stableShopifyRefundEventId(shopDomain, refundId),
      parentTransactionId: normalized.platform_order_id,
      amount,
      currency: refund.currency || currency,
      status: "refund",
      reason: "Shopify import refund",
      occurredAt: firstNonEmpty(refund.created_at, normalized.order_ts),
      orderId: normalized.order_id,
      raw: { ...refund, order },
    });
  }

  for (const tx of transactions) {
    const transactionId = String(tx.id ?? "").trim();
    if (!transactionId) continue;
    for (const [index, fee] of (tx.fees || []).entries()) {
      const amount = Number(fee.amount ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) continue;

      events.push({
        ledgerType: "processor_fee",
        transactionId: stableShopifyProcessorFeeEventId(shopDomain, transactionId, index, String(fee.type ?? "")),
        parentTransactionId: transactionId,
        amount,
        currency: fee.currency || currency,
        status: "processor_fee",
        reason: "Shopify import processor fee",
        occurredAt: firstNonEmpty(tx.created_at, normalized.order_ts),
        orderId: normalized.order_id,
        raw: { ...fee, transaction: tx, order },
      });
    }
  }

  const explicitDisputes = Array.isArray(order?.disputes) ? order.disputes : [];
  for (const dispute of explicitDisputes) {
    const disputeId = String(dispute?.id ?? "").trim();
    const amount = moneyAmount(dispute?.amountSet ?? dispute?.amount);
    if (!disputeId || amount == null || amount <= 0) continue;

    events.push({
      ledgerType: "chargeback",
      transactionId: stableShopifyChargebackEventId(shopDomain, disputeId),
      parentTransactionId: normalized.platform_order_id,
      amount,
      currency: moneyCurrency(dispute?.amountSet, currency),
      status: "chargeback",
      reason: "Shopify import chargeback",
      occurredAt: firstNonEmpty(dispute?.createdAt, normalized.order_ts),
      orderId: normalized.order_id,
      raw: { ...dispute, order },
    });
  }

  return events;
}

export function signedShopifyLedgerAmount(event: Pick<ShopifyLedgerEvent, "ledgerType" | "amount">) {
  if (["refund", "chargeback", "processor_fee"].includes(event.ledgerType)) return -Math.abs(event.amount);
  return Math.abs(event.amount);
}

export const SHOPIFY_CONNECTION_TEST_QUERY = `#graphql
query TraceKitShopifyConnectionTest {
  shop {
    id
    name
    myshopifyDomain
    primaryDomain {
      host
      url
    }
  }
}`;

export const SHOPIFY_ORDERS_QUERY = `#graphql
query TraceKitShopifyOrders($first: Int!, $after: String, $query: String!) {
  orders(first: $first, after: $after, sortKey: CREATED_AT, query: $query) {
    pageInfo {
      hasNextPage
      endCursor
    }
    edges {
      node {
        id
        legacyResourceId
        name
        email
        phone
        createdAt
        processedAt
        updatedAt
        cancelledAt
        displayFinancialStatus
        displayFulfillmentStatus
        currencyCode
        sourceName
        sourceIdentifier
        tags
        customAttributes {
          key
          value
        }
        customer {
          id
          legacyResourceId
          email
          phone
        }
        billingAddress {
          phone
        }
        shippingAddress {
          phone
        }
        currentTotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        subtotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalShippingPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        currentTotalTaxSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalTaxSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        currentTotalDiscountsSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalDiscountsSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        discountCodes
        discountApplications(first: 20) {
          edges {
            node {
              __typename
              allocationMethod
              targetSelection
              targetType
              value {
                __typename
              }
            }
          }
        }
        lineItems(first: 100) {
          edges {
            node {
              id
              name
              title
              sku
              quantity
              originalTotalSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              discountedTotalSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              variant {
                id
                sku
              }
              product {
                id
              }
            }
          }
        }
        refunds {
          id
          createdAt
          note
          totalRefundedSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          refundLineItems(first: 100) {
            edges {
              node {
                id
                quantity
                subtotalSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                totalTaxSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                lineItem {
                  id
                  name
                  title
                  sku
                  variant {
                    sku
                  }
                }
              }
            }
          }
        }
        transactions(first: 100) {
          id
          kind
          status
          gateway
          createdAt
          processedAt
          amountSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          fees {
            type
            amount {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
}`;
