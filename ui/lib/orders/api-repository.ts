import type { OrderRepository } from "./repository";
import type {
  OrderDeepLinkState,
  OrderDrawerRecord,
  OrderListFilter,
  OrderScope,
  OrderSearchResult,
  OrderSummary,
  OrderTimelineEvent,
  OrderTrackingHealth,
  OrderWorkspaceSnapshot,
} from "./types";
import { normalizeOrderDeepLink, orderDeepLinkHref } from "./deep-link";
import { withDevelopmentIdentity } from "@/lib/identity/development-state";

async function apiGet(path: string) {
  const response = await fetch(path, { method: "GET", cache: "no-store", headers: { accept: "application/json" } });
  const text = await response.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  if (!response.ok) throw new Error(body?.error || `Order request failed (${response.status})`);
  return body;
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusValue(value: unknown): OrderSummary["status"] {
  const text = String(value || "").toLowerCase();
  if (text.includes("chargeback")) return "Chargeback";
  if (text.includes("refund") || text.includes("void") || text.includes("return")) return "Refunded";
  if (text.includes("pending") || text.includes("open")) return "Pending";
  return "Paid";
}

function trackingHealth(value: unknown): OrderTrackingHealth {
  const text = String(value || "").toLowerCase();
  if (text.includes("healthy") || text.includes("verified")) return "Healthy";
  if (text.includes("degraded")) return "Degraded";
  if (text.includes("interference")) return "Interference Likely";
  if (text.includes("incomplete")) return "Incomplete";
  return "Unknown";
}

function profit(row: any) {
  const knownCosts = [row.product_cost, row.shipping_cost, row.gateway_fee, row.chargeback_fee].map(numberValue).reduce((a, b) => a + b, 0);
  return numberValue(row.gross_amount) - knownCosts;
}

function dateLabel(value: unknown) {
  if (!value) return "Unknown";
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return String(value);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function summary(row: any): OrderSummary {
  const revenue = numberValue(row.gross_amount);
  const calculatedProfit = profit(row);
  const reconciled = String(row.reconciliation_state || "").toLowerCase().includes("reconciled");
  return {
    id: String(row.platform_order_id || row.id || ""),
    organizationId: String(row.organization_id || row.workspace_id || ""),
    offerId: String(row.everflow_offer_id || ""),
    customerId: String(row.person_id || row.email || ""),
    number: String(row.platform_order_id || row.id || "Order"),
    customerName: String(row.email || "Customer"),
    customerEmail: String(row.email || ""),
    customerPhone: String(row.phone || ""),
    sensitiveMasked: false,
    scenario: "Recorded order",
    date: dateLabel(row.order_ts),
    status: statusValue(row.status),
    profitStatus: reconciled ? "Reconciled" : "Estimated",
    profit: calculatedProfit,
    revenue,
    trackingHealth: trackingHealth(row.data_quality_state),
    shippingLoss: numberValue(row.shipping_amount) < numberValue(row.shipping_cost),
    highFee: numberValue(row.gateway_fee) > revenue * 0.05,
    highAffiliate: false,
  };
}

function timeline(row: any): OrderTimelineEvent[] {
  return [{
    id: `order:${String(row.platform_order_id || row.id || "observed")}`,
    label: "Order observed",
    timestamp: String(row.order_ts || new Date().toISOString()),
    status: "Observed",
    confidence: "Recorded",
    originalUrl: "",
    referrer: "",
    destinationUrl: "",
    queryParameters: {},
    identifiers: [],
    redirects: [],
    diagnostics: [{ label: "Tenant scope", result: "Observed" }],
    evidence: ["platform_orders"],
    relationships: [],
  }];
}

function workspace(row: any): OrderWorkspaceSnapshot {
  const order = summary(row);
  const shippingCharged = numberValue(row.shipping_amount);
  const shippingActual = numberValue(row.shipping_cost);
  const taxCollected = numberValue(row.tax_amount);
  const gross = numberValue(row.gross_amount);
  const productSubtotal = numberValue(row.product_subtotal) || Math.max(gross - shippingCharged - taxCollected, 0);
  const productCost = numberValue(row.product_cost);
  const gatewayFee = numberValue(row.gateway_fee);
  const chargebackFee = numberValue(row.chargeback_fee);
  const netProfit = order.profit ?? 0;
  const orderTimeline = timeline(row);

  return {
    order,
    commercial: {
      mainProduct: "Recorded commerce order",
      orderBumps: [],
      upsells: [],
      shippingCharged,
      taxCollected,
      discounts: 0,
      quantity: 1,
    },
    ledger: [
      { id: "gross-revenue", label: "Revenue", amount: gross, group: "Revenue", source: "platform_orders.gross_amount", drawerId: "financial:gross-revenue" },
      { id: "product-cost", label: "Product Cost", amount: -productCost, group: "Costs", source: "platform_orders.product_cost", drawerId: "financial:product-cost" },
      { id: "shipping-cost", label: "Shipping Cost", amount: -shippingActual, group: "Shipping", source: "platform_orders.shipping_cost", drawerId: "financial:shipping-cost" },
      { id: "tax", label: "Tax Collected", amount: taxCollected, group: "Taxes", source: "platform_orders.tax_amount", drawerId: "financial:tax" },
      { id: "gateway-fee", label: "Gateway Fee", amount: -gatewayFee, group: "Costs", source: "platform_orders.gateway_fee", drawerId: "financial:gateway-fee" },
      { id: "chargeback-fee", label: "Chargeback Fee", amount: -chargebackFee, group: "Costs", source: "platform_orders.chargeback_fee", drawerId: "financial:chargeback-fee" },
      { id: "net-profit", label: "Net Profit", amount: netProfit, group: "Result", source: "TraceKit order calculation", drawerId: "financial:net-profit" },
    ],
    shipping: { charged: shippingCharged, actual: shippingActual, packaging: 0, margin: shippingCharged - shippingActual },
    processorFee: {
      processor: "Recorded gateway",
      pricingRule: "Observed fee",
      percentageRate: 0,
      fixedFee: gatewayFee,
      currency: String(row.currency || "USD"),
      captures: [],
      expectedFee: gatewayFee,
      observedFee: gatewayFee,
      variance: 0,
      settlementStatus: String(row.reconciliation_state || "unreconciled"),
    },
    attribution: {
      trafficSource: row.everflow_transaction_id ? "Everflow" : "Unknown",
      affiliate: "Unknown",
      campaign: "Unknown",
      creative: "Unknown",
      offerUrl: row.everflow_offer_id ? `Offer ${row.everflow_offer_id}` : "Unknown",
      landingPage: "Unknown",
      clickPurchaseDelta: "Unknown",
    },
    timeline: orderTimeline,
    identifiers: [],
    relatedCustomer: { id: String(row.person_id || row.email || ""), name: String(row.email || "Customer") },
    relatedOffer: { id: String(row.everflow_offer_id || ""), name: row.everflow_offer_id ? `Offer ${row.everflow_offer_id}` : "Unassigned offer" },
    trackingExplanation: "Order evidence loaded from the tenant-scoped TraceKit order store.",
    waitingOn: [],
    intelligence: [],
  };
}

export class ApiOrderRepository implements OrderRepository {
  async listOrders(scope: OrderScope, filter: OrderListFilter = {}): Promise<OrderSummary[]> {
    if (!scope.authenticated) return [];
    const params = new URLSearchParams({ limit: "25" });
    if (filter.query) params.set("search", filter.query);
    const body = await apiGet(`/api/orders?${params.toString()}`);
    let values: OrderSummary[] = (Array.isArray(body?.orders) ? body.orders : []).map(summary);
    if (filter.customerId) values = values.filter((item) => item.customerId === filter.customerId);
    if (filter.offerId) values = values.filter((item) => item.offerId === filter.offerId);
    if (filter.state === "refunded") values = values.filter((item) => item.status === "Refunded");
    if (filter.state === "chargeback") values = values.filter((item) => item.status === "Chargeback");
    if (filter.state === "tracking") values = values.filter((item) => item.trackingHealth !== "Healthy");
    if (filter.state === "estimated") values = values.filter((item) => item.profitStatus === "Estimated");
    if (filter.state === "reconciled") values = values.filter((item) => item.profitStatus === "Reconciled");
    if (filter.state === "profitable") values = values.filter((item) => (item.profit ?? 0) > 0);
    if (filter.state === "low-margin") values = values.filter((item) => item.profit !== null && item.profit >= 0 && item.profit < item.revenue * 0.1);
    if (filter.state === "shipping-loss") values = values.filter((item) => item.shippingLoss);
    return values;
  }

  async resolveOrder(scope: OrderScope, id: string) {
    if (!scope.authenticated || !id) return null;
    try {
      const body = await apiGet(`/api/orders?order_id=${encodeURIComponent(id)}&limit=1`);
      const row = Array.isArray(body?.orders) ? body.orders[0] : null;
      if (!row) return null;
      return { organizationId: String(row.organization_id || row.workspace_id || ""), businessContextId: String(row.business_context_id || ""), orderId: String(row.platform_order_id || id) };
    } catch { return null; }
  }

  async loadWorkspace(scope: OrderScope, id: string) {
    if (!scope.authenticated || !id) return null;
    const body = await apiGet(`/api/orders?order_id=${encodeURIComponent(id)}&limit=1`);
    const row = Array.isArray(body?.orders) ? body.orders[0] : null;
    return row ? workspace(row) : null;
  }

  async loadTimeline(scope: OrderScope, id: string) {
    return (await this.loadWorkspace(scope, id))?.timeline || [];
  }

  async loadDrawer(_scope: OrderScope, _id: string, _drawerId: string): Promise<OrderDrawerRecord | null> {
    return null;
  }

  async search(scope: OrderScope, query: string): Promise<OrderSearchResult[]> {
    const orders = await this.listOrders(scope, { query });
    return orders.slice(0, 12).map((order) => ({
      id: `order:${order.id}`,
      type: "Order",
      title: `Order ${order.number}`,
      subtitle: order.customerEmail,
      value: `${order.number} ${order.customerEmail}`,
      href: withDevelopmentIdentity(orderDeepLinkHref({ orderId: order.id }), scope.identity.id),
    }));
  }

  async resolveDeepLink(scope: OrderScope, state: OrderDeepLinkState) {
    const list = await this.listOrders(scope, { offerId: state.offerId, customerId: state.customerId });
    const snapshot = state.orderId ? await this.loadWorkspace(scope, state.orderId) : null;
    return normalizeOrderDeepLink(state, list, snapshot);
  }
}

export const apiOrderRepository: OrderRepository = new ApiOrderRepository();
export const orderRepository: OrderRepository = apiOrderRepository;
