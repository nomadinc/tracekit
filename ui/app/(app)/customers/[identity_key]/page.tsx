"use client";

import Link from "next/link";
import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { apiGetJson } from "@/lib/api";

type CustomerProfile = {
  id?: number;
  identity_key: string;
  primary_email?: string | null;
  primary_phone?: string | null;
  order_count?: number | null;
  lifetime_revenue?: number | null;
  average_order_value?: number | null;
  first_order_ts?: string | null;
  last_order_ts?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type CustomerOrder = {
  [key: string]: any;
  identity_key?: string | null;
  customer_email?: string | null;
  email?: string | null;
  tkid?: string | null;
  tracking_number?: string | null;
  shipping_carrier?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  id?: number;
  platform?: string | null;
  platform_order_id?: string | null;
  order_id?: string | null;
  order_ts?: string | null;
  status?: string | null;
  currency?: string | null;
  gross_amount?: number | null;
  product_subtotal?: number | null;
  product_cost?: number | null;
  shipping_cost?: number | null;
  gateway_fee?: number | null;
  chargeback_fee?: number | null;
  shipping_amount?: number | null;
  tax_amount?: number | null;
  transaction_id?: string | null;
  everflow_transaction_id?: string | null;
  affiliate_id?: string | null;
  source_id?: string | null;
  sub1?: string | null;
  sub2?: string | null;
  sub3?: string | null;
  sub4?: string | null;
  sub5?: string | null;
  order_group_key?: string | null;
};

type OrderGroup = {
  id?: number;
  group_key: string;
  identity_key?: string | null;
  transaction_id?: string | null;
  everflow_transaction_id?: string | null;
  customer_email?: string | null;
  platform?: string | null;
  order_count?: number | null;
  gross_revenue?: number | null;
  refund_amount?: number | null;
  chargeback_amount?: number | null;
  net_revenue?: number | null;
  product_cost?: number | null;
  shipping_cost?: number | null;
  gateway_fee?: number | null;
  chargeback_fee?: number | null;
  total_cost?: number | null;
  profit?: number | null;
  margin?: number | null;
  first_order_ts?: string | null;
  last_order_ts?: string | null;
};

type CustomerDetailResp = {
  ok: boolean;
  message?: string;
  customer?: CustomerProfile | null;
  orders?: CustomerOrder[];
};

type OrderGroupsResp = {
  ok: boolean;
  message?: string;
  groups?: OrderGroup[];
};

function parseOrderId(platformOrderId?: string | null) {
  if (!platformOrderId) return "—";
  const idx = platformOrderId.indexOf(":");
  return idx >= 0 ? platformOrderId.slice(idx + 1) : platformOrderId;
}

function formatMoney(n: number | null | undefined, currency?: string | null) {
  const cur = currency || "USD";
  const val = Number(n ?? 0);
  return val.toLocaleString("en-US", { style: "currency", currency: cur });
}

function formatPercent(n: number | null | undefined) {
  const val = Number(n ?? 0);
  const pct = Math.abs(val) <= 1 ? val * 100 : val;
  return `${pct.toFixed(1)}%`;
}

function marginTextClass(n: number | null | undefined) {
  const val = Number(n ?? 0);
  const pct = Math.abs(val) <= 1 ? val * 100 : val;

  if (pct >= 50) return "text-green-700 dark:text-green-300";
  if (pct >= 20) return "text-amber-700 dark:text-amber-300";
  return "text-red-700 dark:text-red-300";
}

function formatDateTime(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return v;
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getProductName(order: any) {
  return (
    order.product_name ||
    order.productName ||
    order.sku ||
    order.raw_json?.["Product Name"] ||
    order.raw_json?.ProductName ||
    order.raw_json?.productName ||
    order.raw_json?.SKUId ||
    "—"
  );
}

function getProductSku(order: any) {
  return (
    order.sku ||
    order.raw_json?.SKUId ||
    order.raw_json?.SKU ||
    order.raw_json?.sku ||
    null
  );
}

function statusClasses(status?: string | null) {
  const s = String(status || "").toUpperCase();

  if (["COMPLETED", "DELIVERED", "PAID", "SHIPPED", "SHIPPING"].includes(s)) {
    return "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300";
  }

  if (["PENDING", "PROCESSING", "PARTIAL"].includes(s)) {
    return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
  }

  if (
    [
      "REFUNDED",
      "CANCELLED",
      "DECLINED",
      "CHARGEDBACK",
      "CHARGED_BACK",
    ].includes(s)
  ) {
    return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
  }

  return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

function DetailField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={mono ? "font-mono text-xs break-all" : "break-all"}>
        {value || "—"}
      </div>
    </div>
  );
}

function sumOrderField(orders: CustomerOrder[], field: string) {
  return orders.reduce((sum, o) => sum + (Number(o?.[field] ?? 0) || 0), 0);
}

function groupKeyForOrder(order: CustomerOrder) {
  if (order.order_group_key) return order.order_group_key;
  if (order.transaction_id) return `TX:${order.transaction_id}`;
  if (order.everflow_transaction_id)
    return `EF:${order.everflow_transaction_id}`;
  if (order.identity_key && order.order_ts) {
    return `IDENTITY:${order.identity_key}:DATE:${String(order.order_ts).slice(0, 10)}`;
  }
  return `ORDER:${order.platform_order_id || order.id || "unknown"}`;
}

type CustomerTimelineEvent = {
  ts: string;
  icon: string;
  title: string;
  detail?: string | null;
  badge?: string | null;
  tone:
    | "order"
    | "attribution"
    | "payment"
    | "shipping"
    | "group"
    | "refund"
    | "chargeback";
  amount?: number | null;
  currency?: string | null;
  platform_order_id?: string | null;
};

type RevenueTimelineRow = {
  day: string;
  gross: number;
  refunds: number;
  chargebacks: number;
  net: number;
  orderCount: number;
};

type CustomerValueGrowthRow = {
  ts: string;
  label: string;
  product: string;
  orderId: string;
  amount: number;
  cumulative: number;
  currency?: string | null;
  status?: string | null;
  platform_order_id?: string | null;
};

function validDateValue(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : "";
}

function eventToneClasses(tone: CustomerTimelineEvent["tone"]) {
  switch (tone) {
    case "order":
      return "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300";
    case "attribution":
      return "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300";
    case "payment":
      return "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300";
    case "shipping":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
    case "refund":
    case "chargeback":
      return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
    case "group":
    default:
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  }
}

function uniqueTruthy(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.map((v) => String(v || "").trim()).filter(Boolean)),
  );
}

function compactList(values: Array<string | null | undefined>, max = 4) {
  const cleanValues = values.map((value) => String(value || "").trim()).filter(Boolean);
  if (!cleanValues.length) return "—";
  const head = cleanValues.slice(0, max);
  const remaining = cleanValues.length - head.length;
  return remaining > 0 ? `${head.join(", ")} +${remaining} more` : head.join(", ");
}

function getOrderTypeText(order: CustomerOrder) {
  return String(
    order.raw_json?.["Order Type"] ||
      order.raw_json?.OrderType ||
      order.raw_json?.orderType ||
      order.raw_json?.["Order Behavior Name"] ||
      order.raw_json?.orderBehaviorName ||
      "",
  ).toLowerCase();
}

function getPositiveCustomerOrders(orders: CustomerOrder[]) {
  const positiveOrders = orders.filter((order) => {
    const amount = Number(order.gross_amount ?? 0) || 0;
    const status = String(order.status || "").toUpperCase();

    return (
      amount > 0 &&
      !status.includes("REFUND") &&
      !status.includes("CHARGEBACK") &&
      !status.includes("CHARGED_BACK") &&
      !status.includes("CHARGEDBACK")
    );
  });

  const maxAmount = Math.max(
    0,
    ...positiveOrders.map((order) => Number(order.gross_amount ?? 0) || 0),
  );

  return positiveOrders.sort((a, b) => {
    const tsCompare = String(a.order_ts || "").localeCompare(
      String(b.order_ts || ""),
    );
    if (tsCompare !== 0) return tsCompare;

    const stageCompare =
      orderStageRank(classifyCustomerOrderStage(a, maxAmount)) -
      orderStageRank(classifyCustomerOrderStage(b, maxAmount));
    if (stageCompare !== 0) return stageCompare;

    return (Number(b.gross_amount ?? 0) || 0) - (Number(a.gross_amount ?? 0) || 0);
  });
}

function classifyCustomerOrderStage(order: CustomerOrder, maxAmount: number) {
  const product = getProductName(order).toLowerCase();
  const typeText = getOrderTypeText(order);
  const amount = Number(order.gross_amount ?? 0) || 0;

  if (typeText.includes("bump") || product.includes("safetrak") || amount <= 5.99) {
    return "bump";
  }

  if (typeText.includes("upsell")) {
    return "upsell";
  }

  if (amount === maxAmount || typeText.includes("main") || typeText.includes("initial")) {
    return "initial";
  }

  return "upsell";
}

function orderStageRank(stage: string) {
  if (stage === "initial") return 1;
  if (stage === "bump") return 2;
  if (stage === "upsell") return 3;
  return 9;
}

function stageTitle(stage: string) {
  if (stage === "initial") return "Initial purchase";
  if (stage === "bump") return "Order bump accepted";
  if (stage === "upsell") return "Upsell accepted";
  return "Purchase recorded";
}

function stageIcon(stage: string) {
  if (stage === "initial") return "🛒";
  if (stage === "bump") return "➕";
  if (stage === "upsell") return "🚀";
  return "🧾";
}

function stageTone(stage: string): CustomerTimelineEvent["tone"] {
  if (stage === "initial" || stage === "bump" || stage === "upsell") return "order";
  return "order";
}

function buildCustomerTimeline(
  orders: CustomerOrder[],
  groups: OrderGroup[],
): CustomerTimelineEvent[] {
  const events: CustomerTimelineEvent[] = [];
  const positiveOrders = getPositiveCustomerOrders(orders);
  const maxAmount = Math.max(
    0,
    ...positiveOrders.map((order) => Number(order.gross_amount ?? 0) || 0),
  );
  const firstOrder = positiveOrders[0] || null;
  const firstTs =
    validDateValue(firstOrder?.order_ts) ||
    validDateValue(groups[0]?.first_order_ts) ||
    validDateValue(orders[0]?.order_ts);

  const everflowTids = uniqueTruthy(
    orders.map((order) => order.everflow_transaction_id || order.sub5),
  );
  const affiliateIds = uniqueTruthy(orders.map((order) => order.affiliate_id));
  const sourceIds = uniqueTruthy(orders.map((order) => order.source_id));
  const tkids = uniqueTruthy(orders.map((order) => order.tkid));

  if (firstTs && (everflowTids.length || affiliateIds.length || sourceIds.length || tkids.length)) {
    events.push({
      ts: firstTs,
      icon: "🟣",
      title: "Customer acquired",
      detail: [
        affiliateIds.length ? `Affiliate ${compactList(affiliateIds, 4)}` : "",
        everflowTids.length ? `Everflow TID: ${compactList(everflowTids, 2)}` : "",
        sourceIds.length ? `Source: ${compactList(sourceIds, 4)}` : "",
        tkids.length ? `TKID: ${compactList(tkids, 2)}` : "",
      ]
        .filter(Boolean)
        .join(" • "),
      tone: "attribution",
    });
  }

  for (const order of positiveOrders) {
    const ts =
      validDateValue(order.order_ts) ||
      validDateValue(order.created_at) ||
      validDateValue(order.updated_at);
    if (!ts) continue;

    const stage = classifyCustomerOrderStage(order, maxAmount);
    const amount = Number(order.gross_amount ?? 0) || 0;
    const product = getProductName(order);
    const sku = getProductSku(order);

    events.push({
      ts,
      icon: stageIcon(stage),
      title: stageTitle(stage),
      detail: [
        product,
        sku ? `SKU: ${sku}` : "",
        order.order_id || parseOrderId(order.platform_order_id),
      ]
        .filter(Boolean)
        .join(" • "),
      badge: order.status || null,
      tone: stageTone(stage),
      amount,
      currency: order.currency,
      platform_order_id: order.platform_order_id,
    });
  }

  const refundOrders = orders.filter((order) => {
    const status = String(order.status || "").toUpperCase();
    const amount = Number(order.gross_amount ?? 0) || 0;
    return status.includes("REFUND") || amount < 0;
  });

  if (refundOrders.length) {
    const refundTotal = refundOrders.reduce(
      (sum, order) => sum + Math.abs(Number(order.gross_amount ?? 0) || 0),
      0,
    );

    events.push({
      ts:
        validDateValue(refundOrders[0]?.order_ts) ||
        validDateValue(refundOrders[0]?.updated_at) ||
        firstTs ||
        new Date().toISOString(),
      icon: "↩️",
      title: refundOrders.length === 1 ? "Refund recorded" : `${refundOrders.length} refunds recorded`,
      detail: `Refund total: ${formatMoney(refundTotal, refundOrders[0]?.currency || "USD")}`,
      tone: "refund",
      amount: -refundTotal,
      currency: refundOrders[0]?.currency,
      platform_order_id:
        refundOrders.length === 1 ? refundOrders[0]?.platform_order_id || null : null,
    });
  }

  const chargebackOrders = orders.filter((order) => {
    const status = String(order.status || "").toUpperCase();
    return (
      status.includes("CHARGEBACK") ||
      status.includes("CHARGED_BACK") ||
      status.includes("CHARGEDBACK")
    );
  });

  if (chargebackOrders.length) {
    const chargebackTotal = chargebackOrders.reduce(
      (sum, order) => sum + Math.abs(Number(order.gross_amount ?? 0) || 0),
      0,
    );

    events.push({
      ts:
        validDateValue(chargebackOrders[0]?.order_ts) ||
        validDateValue(chargebackOrders[0]?.updated_at) ||
        firstTs ||
        new Date().toISOString(),
      icon: "⛔",
      title:
        chargebackOrders.length === 1
          ? "Chargeback recorded"
          : `${chargebackOrders.length} chargebacks recorded`,
      detail: `Chargeback total: ${formatMoney(
        chargebackTotal,
        chargebackOrders[0]?.currency || "USD",
      )}`,
      tone: "chargeback",
      amount: -chargebackTotal,
      currency: chargebackOrders[0]?.currency,
    });
  }


  const trackingDetails = orders
    .map((order) => {
      const trackingNumber =
        order.tracking_number ||
        order.raw_json?.TrackingNumber ||
        order.raw_json?.ShipmentTrackingNumber ||
        order.raw_json?.["Shipment Tracking Number"];

      if (!trackingNumber) return "";

      const carrier =
        order.shipping_carrier || order.raw_json?.["Shipping Carrier"] || "Carrier";

      return `${carrier}: ${trackingNumber}`;
    })
    .filter(Boolean);

  if (trackingDetails.length) {
    const trackingTs =
      orders
        .map((order) =>
          validDateValue(order.raw_json?.["Updated Date"]) || validDateValue(order.updated_at),
        )
        .filter(Boolean)
        .sort()[0] ||
      firstTs ||
      new Date().toISOString();

    events.push({
      ts: trackingTs,
      icon: "📦",
      title:
        trackingDetails.length === 1
          ? "Fulfillment tracking assigned"
          : `${trackingDetails.length} fulfillment tracking numbers assigned`,
      detail: compactList(trackingDetails, 4),
      tone: "shipping",
    });
  }

  return events.sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime(),
  );
}

function buildCustomerValueGrowthTimeline(
  orders: CustomerOrder[],
): CustomerValueGrowthRow[] {
  const positiveOrders = getPositiveCustomerOrders(orders);
  const maxAmount = Math.max(
    0,
    ...positiveOrders.map((order) => Number(order.gross_amount ?? 0) || 0),
  );

  let cumulative = 0;

  return positiveOrders.map((order) => {
    const amount = Number(order.gross_amount ?? 0) || 0;
    cumulative += amount;

    const stage = classifyCustomerOrderStage(order, maxAmount);

    return {
      ts:
        validDateValue(order.order_ts) ||
        validDateValue(order.created_at) ||
        validDateValue(order.updated_at) ||
        new Date().toISOString(),
      label:
        stage === "initial"
          ? "Initial Purchase"
          : stage === "bump"
            ? "Order Bump Added"
            : "Upsell Accepted",
      product: getProductName(order),
      orderId: order.order_id || parseOrderId(order.platform_order_id),
      amount,
      cumulative,
      currency: order.currency,
      status: order.status,
      platform_order_id: order.platform_order_id,
    };
  });
}

function buildRevenueTimeline(orders: CustomerOrder[]): RevenueTimelineRow[] {
  const byDay = new Map<string, RevenueTimelineRow>();

  for (const order of orders) {
    const ts = validDateValue(order.order_ts);
    if (!ts) continue;

    const day = ts.slice(0, 10);
    const amount = Number(order.gross_amount ?? 0) || 0;
    const status = String(order.status || "").toUpperCase();

    const row =
      byDay.get(day) ||
      {
        day,
        gross: 0,
        refunds: 0,
        chargebacks: 0,
        net: 0,
        orderCount: 0,
      };

    row.orderCount += 1;

    if (
      status.includes("CHARGEBACK") ||
      status.includes("CHARGED_BACK") ||
      status.includes("CHARGEDBACK")
    ) {
      row.chargebacks += Math.abs(amount);
      row.net -= Math.abs(amount);
    } else if (status.includes("REFUND") || amount < 0) {
      row.refunds += Math.abs(amount);
      row.net -= Math.abs(amount);
    } else {
      row.gross += amount;
      row.net += amount;
    }

    byDay.set(day, row);
  }

  return Array.from(byDay.values()).sort((a, b) =>
    a.day.localeCompare(b.day),
  );
}

function buildJourneySummary(
  orders: CustomerOrder[],
  groups: OrderGroup[],
  currency: string,
) {
  const sortedOrders = [...orders].sort((a, b) =>
    String(a.order_ts || "").localeCompare(String(b.order_ts || "")),
  );

  const firstOrder = sortedOrders[0] || null;
  const lastOrder = sortedOrders[sortedOrders.length - 1] || null;

  const totalRevenue = orders.reduce(
    (sum, order) => sum + (Number(order.gross_amount ?? 0) || 0),
    0,
  );

  const refundCount = orders.filter((order) => {
    const status = String(order.status || "").toUpperCase();
    const amount = Number(order.gross_amount ?? 0) || 0;
    return status.includes("REFUND") || amount < 0;
  }).length;

  const chargebackCount = orders.filter((order) => {
    const status = String(order.status || "").toUpperCase();
    return (
      status.includes("CHARGEBACK") ||
      status.includes("CHARGED_BACK") ||
      status.includes("CHARGEDBACK")
    );
  }).length;

  const affiliateIds = Array.from(
    new Set(orders.map((o) => o.affiliate_id).filter(Boolean)),
  );

  const platforms = Array.from(
    new Set(orders.map((o) => o.platform).filter(Boolean)),
  );

  const products = Array.from(
    new Set(orders.map((o) => getProductName(o)).filter((p) => p && p !== "—")),
  );

  const firstTouchTs =
    firstOrder?.order_ts ||
    groups
      .map((g) => g.first_order_ts)
      .filter(Boolean)
      .sort()[0] ||
    null;

  const lastTouchTs =
    lastOrder?.order_ts ||
    [...groups.map((g) => g.last_order_ts).filter(Boolean)].sort().pop() ||
    null;

  const firstTime = firstTouchTs ? new Date(firstTouchTs).getTime() : NaN;
  const lastTime = lastTouchTs ? new Date(lastTouchTs).getTime() : NaN;
  const daysActive =
    Number.isFinite(firstTime) && Number.isFinite(lastTime)
      ? Math.max(0, Math.ceil((lastTime - firstTime) / 86400000))
      : 0;

  return {
    firstTouchTs,
    lastTouchTs,
    totalRevenue,
    orderCount: orders.length,
    groupCount: groups.length,
    productCount: products.length,
    daysActive,
    refundCount,
    chargebackCount,
    affiliateIds,
    platforms,
    products,
    currency,
  };
}

function maxRevenueBarValue(rows: CustomerValueGrowthRow[]) {
  return Math.max(
    1,
    ...rows.map((row) => Math.max(Math.abs(row.amount), Math.abs(row.cumulative))),
  );
}

export default function CustomerDetailPage() {
  const router = useRouter();
  const params = useParams<{ identity_key: string }>();

  const identityKey = React.useMemo(() => {
    const raw = Array.isArray(params?.identity_key)
      ? params.identity_key[0]
      : params?.identity_key;
    return raw ? decodeURIComponent(raw) : "";
  }, [params]);

  const [customer, setCustomer] = React.useState<CustomerProfile | null>(null);
  const [orders, setOrders] = React.useState<CustomerOrder[]>([]);
  const [orderGroups, setOrderGroups] = React.useState<OrderGroup[]>([]);
  const [expandedGroups, setExpandedGroups] = React.useState<
    Record<string, boolean>
  >({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showFullTimeline, setShowFullTimeline] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    async function loadCustomer() {
      if (!identityKey) return;

      try {
        setLoading(true);
        setError(null);

        const [customerJson, groupsJson] = await Promise.all([
          apiGetJson<CustomerDetailResp>(
            `/v1/customers/detail?identity_key=${encodeURIComponent(identityKey)}`,
          ),
          apiGetJson<OrderGroupsResp>(
            `/v1/order-groups?identity_key=${encodeURIComponent(identityKey)}`,
          ),
        ]);

        if (!customerJson.ok) {
          throw new Error(customerJson.message || "Failed to load customer.");
        }

        if (!groupsJson.ok) {
          throw new Error(groupsJson.message || "Failed to load order groups.");
        }

        if (!cancelled) {
          setCustomer(customerJson.customer || null);
          setOrders(
            Array.isArray(customerJson.orders) ? customerJson.orders : [],
          );
          setOrderGroups(
            Array.isArray(groupsJson.groups) ? groupsJson.groups : [],
          );
        }
      } catch (e: any) {
        if (!cancelled) {
          setCustomer(null);
          setOrders([]);
          setOrderGroups([]);
          setError(e?.message || "Failed to load customer.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadCustomer();

    return () => {
      cancelled = true;
    };
  }, [identityKey]);

  const currency = orders.find((o) => o.currency)?.currency || "USD";
  const computedRevenue = React.useMemo(() => {
    return orders.reduce(
      (sum, o) => sum + (Number(o.gross_amount ?? 0) || 0),
      0,
    );
  }, [orders]);

  const ordersByGroupKey = React.useMemo(() => {
    const map = new Map<string, CustomerOrder[]>();

    for (const order of orders) {
      const key = groupKeyForOrder(order);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(order);
    }

    return map;
  }, [orders]);

  const groupsToDisplay = React.useMemo(() => {
    if (orderGroups.length) return orderGroups;

    // Fallback if the API ever returns no groups but customer orders exist.
    return Array.from(ordersByGroupKey.entries()).map(
      ([groupKey, groupOrders]) => ({
        group_key: groupKey,
        identity_key: identityKey,
        transaction_id: groupOrders[0]?.transaction_id || null,
        everflow_transaction_id:
          groupOrders[0]?.everflow_transaction_id || null,
        customer_email:
          groupOrders[0]?.customer_email || groupOrders[0]?.email || null,
        platform: groupOrders[0]?.platform || null,
        order_count: groupOrders.length,
        gross_revenue: groupOrders.reduce(
          (sum, o) => sum + (Number(o.gross_amount ?? 0) || 0),
          0,
        ),
        refund_amount: 0,
        chargeback_amount: 0,
        net_revenue: sumOrderField(groupOrders, "gross_amount"),
        product_cost: sumOrderField(groupOrders, "product_cost"),
        shipping_cost: sumOrderField(groupOrders, "shipping_cost"),
        gateway_fee: sumOrderField(groupOrders, "gateway_fee"),
        chargeback_fee: sumOrderField(groupOrders, "chargeback_fee"),
        total_cost:
          sumOrderField(groupOrders, "product_cost") +
          sumOrderField(groupOrders, "shipping_cost") +
          sumOrderField(groupOrders, "gateway_fee") +
          sumOrderField(groupOrders, "chargeback_fee"),
        profit:
          sumOrderField(groupOrders, "gross_amount") -
          (sumOrderField(groupOrders, "product_cost") +
            sumOrderField(groupOrders, "shipping_cost") +
            sumOrderField(groupOrders, "gateway_fee") +
            sumOrderField(groupOrders, "chargeback_fee")),
        margin:
          sumOrderField(groupOrders, "gross_amount") !== 0
            ? (sumOrderField(groupOrders, "gross_amount") -
                (sumOrderField(groupOrders, "product_cost") +
                  sumOrderField(groupOrders, "shipping_cost") +
                  sumOrderField(groupOrders, "gateway_fee") +
                  sumOrderField(groupOrders, "chargeback_fee"))) /
              sumOrderField(groupOrders, "gross_amount")
            : 0,
        first_order_ts:
          groupOrders
            .map((o) => o.order_ts)
            .filter(Boolean)
            .sort()[0] || null,
        last_order_ts: (() => {
          const sorted = groupOrders
            .map((o) => o.order_ts)
            .filter(Boolean)
            .sort();

          return sorted.length ? sorted[sorted.length - 1] : null;
        })(),
      }),
    );
  }, [identityKey, orderGroups, ordersByGroupKey]);

  const customerTimeline = React.useMemo(() => {
    return buildCustomerTimeline(orders, groupsToDisplay);
  }, [orders, groupsToDisplay]);

  const visibleCustomerTimeline = showFullTimeline
    ? customerTimeline
    : customerTimeline.slice(0, 6);

  const revenueTimeline = React.useMemo(() => {
    return buildCustomerValueGrowthTimeline(orders);
  }, [orders]);

  const journeySummary = React.useMemo(() => {
    return buildJourneySummary(orders, groupsToDisplay, currency);
  }, [orders, groupsToDisplay, currency]);

  const uniquePurchaseDays = React.useMemo(() => {
	  const days = orders
	    .map((order) => {
	      const ts =
	        order.order_ts ||
	        order.created_at ||
	        order.updated_at ||
	        "";
	
	      if (!ts) return "";
	
	      const d = new Date(ts);
	      if (!Number.isFinite(d.getTime())) return String(ts).slice(0, 10);
	
	      return d.toISOString().slice(0, 10);
	    })
	    .filter(Boolean);
	
	  return new Set(days).size;
	}, [orders]);
	
	const customerType =
	  uniquePurchaseDays <= 1
	    ? "New Customer"
	    : uniquePurchaseDays <= 3
	      ? "Repeat Buyer"
	      : "High Value";

  const hasOrderBump = revenueTimeline.some(
    (row) => row.label === "Order Bump Added",
  );

  const hasUpsell = revenueTimeline.some(
    (row) => row.label === "Upsell Accepted",
  );

  const purchasePath = [
    revenueTimeline.length ? "Initial Purchase" : "No Purchase Yet",
    hasOrderBump ? "Order Bump" : "",
    hasUpsell ? "Upsell" : "",
  ]
    .filter(Boolean)
    .join(" → ");

  const acquisitionText = [
    journeySummary.affiliateIds.length
      ? `Affiliate ${compactList(journeySummary.affiliateIds, 4)}`
      : "Affiliate Unknown",
    orders[0]?.everflow_transaction_id || orders[0]?.sub5
      ? `Everflow TID: ${orders[0]?.everflow_transaction_id || orders[0]?.sub5}`
      : "",
  ]
    .filter(Boolean)
    .join(" • ");

  const riskText = [
    journeySummary.refundCount > 0
      ? `${journeySummary.refundCount} refund${journeySummary.refundCount === 1 ? "" : "s"}`
      : "No refunds",
    journeySummary.chargebackCount > 0
      ? `${journeySummary.chargebackCount} chargeback${journeySummary.chargebackCount === 1 ? "" : "s"}`
      : "No chargebacks",
  ].join(" • ");

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
            <Link href="/orders" className="hover:underline">
              Orders
            </Link>
            <span>/</span>
            <span>Customer</span>
          </div>

          <h1 className="text-xl font-semibold">Customer Detail</h1>
          <p className="text-sm text-slate-500">
            Review this customer&apos;s identity, value, order groups, and
            attribution context.
          </p>
        </div>

        <button
          type="button"
          className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
          onClick={() => router.back()}
        >
          ← Back
        </button>
      </div>

      {loading ? (
        <div className="rounded-xl border p-6 text-sm text-slate-500">
          Loading customer...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <div className="font-semibold">Couldn’t load customer</div>
          <div className="mt-1 font-mono text-xs">{error}</div>
        </div>
      ) : !customer ? (
        <div className="rounded-xl border p-6">
          <div className="font-semibold">No customer profile found</div>
          <div className="mt-1 text-sm text-slate-500">
            No customer profile exists for this identity key yet.
          </div>
          <div className="mt-3 rounded bg-slate-100 p-3 font-mono text-xs break-all dark:bg-slate-800">
            {identityKey || "—"}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="rounded-xl border p-4 xl:col-span-1">
              <div className="mb-3 text-sm font-semibold">Customer Summary</div>
              <div className="grid grid-cols-1 gap-4 text-sm">
                <DetailField
                  label="Primary Email"
                  value={customer.primary_email || "—"}
                />
                <DetailField
                  label="Primary Phone"
                  value={customer.primary_phone || "—"}
                />
                <DetailField
                  label="Identity Key"
                  value={customer.identity_key || identityKey}
                  mono
                />
                <DetailField
                  label="Customer Profile ID"
                  value={customer.id ? String(customer.id) : "—"}
                  mono
                />
              </div>
            </div>

            <div className="rounded-xl border p-4 xl:col-span-2">
              <div className="mb-3 text-sm font-semibold">Customer Metrics</div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-slate-500">Orders</div>
                  <div className="mt-1 text-2xl font-semibold">
                    {customer.order_count ?? orders.length}
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="text-xs text-slate-500">Lifetime Revenue</div>
                  <div className="mt-1 text-2xl font-semibold">
                    {formatMoney(
                      customer.lifetime_revenue ?? computedRevenue,
                      currency,
                    )}
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="text-xs text-slate-500">AOV</div>
                  <div className="mt-1 text-2xl font-semibold">
                    {formatMoney(
                      customer.average_order_value ??
                        (orders.length ? computedRevenue / orders.length : 0),
                      currency,
                    )}
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="text-xs text-slate-500">Customer Type</div>
                  <div className="mt-1 text-xl font-semibold">
                    {customerType}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="rounded-xl border p-4 xl:col-span-1">
              <div className="mb-4">
                <div className="text-sm font-semibold">
                  Customer Journey Summary
                </div>
                <div className="text-xs text-slate-500">
                  A concise view of acquisition, purchase path, products, and risk.
                </div>
              </div>

              <div className="space-y-4 text-sm">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-slate-500">Acquisition</div>
                  <div className="mt-1 break-all font-medium">
                    {acquisitionText}
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="text-xs text-slate-500">Purchase Path</div>
                  <div className="mt-1 font-medium">
                    {purchasePath}
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="text-xs text-slate-500">Products</div>
                  <div className="mt-1">
                    {journeySummary.products.length
                      ? compactList(journeySummary.products, 5)
                      : "—"}
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="text-xs text-slate-500">Risk</div>
                  <div className="mt-1 font-medium">
                    {riskText}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border p-4 xl:col-span-2">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Customer Value Growth</div>
                  <div className="text-xs text-slate-500">
                    How each purchase step increased total customer value.
                  </div>
                </div>
                <div className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {revenueTimeline.length} steps
                </div>
              </div>

              {revenueTimeline.length === 0 ? (
                <div className="rounded-lg border p-4 text-sm text-slate-500">
                  No value growth events yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {revenueTimeline.map((row, idx) => (
                    <div
                      key={`${row.orderId}-${idx}`}
                      className="rounded-lg border p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                              {idx + 1}
                            </div>
                            <div className="font-semibold">{row.label}</div>
                          </div>

                          <div className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                            {row.product}
                          </div>

                          <div className="mt-1 text-xs text-slate-500">
                            Order {row.orderId}
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <div className="text-lg font-semibold">
                            {formatMoney(row.cumulative, row.currency || currency)}
                          </div>
                          <div className="text-xs text-slate-500">
                            Customer Value
                          </div>

                          {idx > 0 ? (
                            <div className="mt-2 text-sm font-medium text-green-600 dark:text-green-400">
                              +{formatMoney(row.amount, row.currency || currency)}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {row.platform_order_id ? (
                        <div className="mt-3">
                          <Link
                            href={`/orders/${encodeURIComponent(row.platform_order_id)}`}
                            className="text-xs text-blue-600 hover:underline dark:text-blue-300"
                          >
                            Open full order →
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="mb-4 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-sm font-semibold">Customer Timeline</div>
                <div className="text-xs text-slate-500">
                  Narrative customer journey from acquisition through purchase, order bump, upsell, payment, and fulfillment.
                </div>
              </div>
              <div className="text-xs text-slate-500">
                {customerTimeline.length.toLocaleString()} timeline events
              </div>
            </div>

            {customerTimeline.length === 0 ? (
              <div className="rounded-lg border p-4 text-sm text-slate-500">
                No customer timeline events yet.
              </div>
            ) : (
              <div className="space-y-3">
                {visibleCustomerTimeline.map((event, idx) => (
                  <div
                    key={`${event.title}-${event.ts}-${idx}`}
                    className="rounded-lg border bg-slate-50 p-3 dark:bg-slate-900"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base ${eventToneClasses(
                          event.tone,
                        )}`}
                      >
                        {event.icon}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold">{event.title}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {formatDateTime(event.ts)}
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            {event.amount !== undefined &&
                            event.amount !== null ? (
                              <div className="text-right text-sm font-semibold">
                                {formatMoney(event.amount, event.currency || currency)}
                              </div>
                            ) : null}

                            {event.badge ? (
                              <span
                                className={`rounded-full px-2 py-1 text-xs ${statusClasses(
                                  event.badge,
                                )}`}
                              >
                                {event.badge}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {event.detail ? (
                          <div className="mt-2 rounded bg-slate-100 p-2 font-mono text-xs break-all dark:bg-slate-800">
                            {event.detail}
                          </div>
                        ) : null}

                        {event.platform_order_id ? (
                          <div className="mt-2">
                            <Link
                              href={`/orders/${encodeURIComponent(
                                event.platform_order_id,
                              )}`}
                              className="text-xs text-blue-600 hover:underline dark:text-blue-300"
                            >
                              Open full order →
                            </Link>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}

                {customerTimeline.length > 6 ? (
                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      className="rounded-md border px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
                      onClick={() => setShowFullTimeline((prev) => !prev)}
                    >
                      {showFullTimeline
                        ? "Show condensed timeline"
                        : `Show all ${customerTimeline.length} timeline events`}
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="rounded-xl border p-4">
            <div className="mb-3 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-sm font-semibold">Order Groups</div>
                <div className="text-xs text-slate-500">
                  Grouped from the{" "}
                  <span className="font-mono">order_groups</span> table by
                  payment transaction when available.
                </div>
              </div>
              <div className="text-xs text-slate-500">
                {groupsToDisplay.length.toLocaleString()} groups •{" "}
                {orders.length.toLocaleString()} orders
              </div>
            </div>

            <div className="space-y-3">
              {groupsToDisplay.length === 0 ? (
                <div className="rounded-lg border p-4 text-sm text-slate-500">
                  No order groups found.
                </div>
              ) : (
                groupsToDisplay.map((group) => {
                  const groupOrders =
                    ordersByGroupKey.get(group.group_key) || [];
                  const expanded = Boolean(expandedGroups[group.group_key]);

                  return (
                    <div
                      key={group.group_key}
                      className="rounded-lg border overflow-hidden"
                    >
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-4 border-b bg-slate-50 px-4 py-3 text-left text-sm hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700"
                        onClick={() =>
                          setExpandedGroups((prev) => ({
                            ...prev,
                            [group.group_key]: !prev[group.group_key],
                          }))
                        }
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-slate-500">
                            Group Key
                          </div>
                          <div className="font-mono text-xs break-all">
                            {group.group_key}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                            <span>{formatDateTime(group.first_order_ts)}</span>
                            <span>•</span>
                            <span>{group.platform || "—"}</span>
                            <span>•</span>
                            <span>
                              {group.order_count ?? groupOrders.length} orders
                            </span>
                          </div>
                        </div>

                        <div className="grid shrink-0 grid-cols-4 gap-3 text-right">
                          <div>
                            <div className="text-xs text-slate-500">Gross</div>
                            <div className="font-semibold">
                              {formatMoney(group.gross_revenue, currency)}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-500">
                              Refunds
                            </div>
                            <div className="font-semibold">
                              {formatMoney(group.refund_amount, currency)}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-500">Net</div>
                            <div className="font-semibold">
                              {formatMoney(group.net_revenue, currency)}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-500">Margin</div>
                            <div
                              className={`font-semibold ${marginTextClass(group.margin)}`}
                            >
                              {formatPercent(group.margin)}
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 text-xs text-slate-500">
                          {expanded ? "Hide" : "Show"}
                        </div>
                      </button>

                      {expanded ? (
                        <div>
                          <div className="border-b p-4">
                            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Profit Breakdown
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4 xl:grid-cols-8">
                              <div className="rounded-lg border p-3">
                                <div className="text-xs text-slate-500">
                                  Revenue
                                </div>
                                <div className="mt-1 font-semibold">
                                  {formatMoney(group.gross_revenue, currency)}
                                </div>
                              </div>

                              <div className="rounded-lg border p-3">
                                <div className="text-xs text-slate-500">
                                  Product Cost
                                </div>
                                <div className="mt-1 font-semibold">
                                  {formatMoney(group.product_cost, currency)}
                                </div>
                              </div>

                              <div className="rounded-lg border p-3">
                                <div className="text-xs text-slate-500">
                                  Shipping Cost
                                </div>
                                <div className="mt-1 font-semibold">
                                  {formatMoney(group.shipping_cost, currency)}
                                </div>
                              </div>

                              <div className="rounded-lg border p-3">
                                <div className="text-xs text-slate-500">
                                  Gateway Fee
                                </div>
                                <div className="mt-1 font-semibold">
                                  {formatMoney(group.gateway_fee, currency)}
                                </div>
                              </div>

                              <div className="rounded-lg border p-3">
                                <div className="text-xs text-slate-500">
                                  Chargeback Fee
                                </div>
                                <div className="mt-1 font-semibold">
                                  {formatMoney(group.chargeback_fee, currency)}
                                </div>
                              </div>

                              <div className="rounded-lg border p-3">
                                <div className="text-xs text-slate-500">
                                  Total Cost
                                </div>
                                <div className="mt-1 font-semibold">
                                  {formatMoney(group.total_cost, currency)}
                                </div>
                              </div>

                              <div className="rounded-lg border p-3">
                                <div className="text-xs text-slate-500">
                                  Profit
                                </div>
                                <div className="mt-1 font-semibold">
                                  {formatMoney(
                                    group.profit ?? group.net_revenue,
                                    currency,
                                  )}
                                </div>
                              </div>

                              <div className="rounded-lg border p-3">
                                <div className="text-xs text-slate-500">
                                  Margin
                                </div>
                                <div
                                  className={`mt-1 font-semibold ${marginTextClass(group.margin)}`}
                                >
                                  {formatPercent(group.margin)}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="overflow-auto">
                            {groupOrders.length === 0 ? (
                              <div className="p-4 text-sm text-slate-500">
                                No matching orders were returned for this group
                                yet.
                              </div>
                            ) : (
                              <table className="min-w-full text-sm">
                                <thead className="bg-slate-100 dark:bg-slate-800">
                                  <tr>
                                    <th className="px-4 py-2 text-left whitespace-nowrap">
                                      Date
                                    </th>
                                    <th className="px-4 py-2 text-left whitespace-nowrap">
                                      Order ID
                                    </th>
                                    <th className="px-4 py-2 text-left whitespace-nowrap">
                                      Product
                                    </th>
                                    <th className="px-4 py-2 text-left whitespace-nowrap">
                                      Platform
                                    </th>
                                    <th className="px-4 py-2 text-left whitespace-nowrap">
                                      Status
                                    </th>
                                    <th className="px-4 py-2 text-left whitespace-nowrap">
                                      Amount
                                    </th>
                                    <th className="px-4 py-2 text-left whitespace-nowrap">
                                      Affiliate
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {groupOrders.map((order) => (
                                    <tr
                                      key={order.platform_order_id || order.id}
                                      className="border-t"
                                    >
                                      <td className="px-4 py-2 whitespace-nowrap font-mono text-xs">
                                        {formatDateTime(order.order_ts)}
                                      </td>
                                      <td className="px-4 py-2 whitespace-nowrap font-mono text-xs">
                                        {parseOrderId(order.platform_order_id)}
                                      </td>
                                      <td className="px-4 py-2 min-w-[220px]">
                                        <div className="font-medium">
                                          {getProductName(order)}
                                        </div>
                                        {getProductSku(order) ? (
                                          <div className="text-xs text-slate-500">
                                            SKU: {getProductSku(order)}
                                          </div>
                                        ) : null}
                                      </td>
                                      <td className="px-4 py-2 whitespace-nowrap">
                                        {order.platform || "—"}
                                      </td>
                                      <td className="px-4 py-2 whitespace-nowrap">
                                        <span
                                          className={`rounded-full px-2 py-1 text-xs ${statusClasses(order.status)}`}
                                        >
                                          {order.status || "UNKNOWN"}
                                        </span>
                                      </td>
                                      <td className="px-4 py-2 whitespace-nowrap">
                                        {formatMoney(
                                          order.gross_amount,
                                          order.currency || currency,
                                        )}
                                      </td>
                                      <td className="px-4 py-2 whitespace-nowrap">
                                        {order.affiliate_id || "—"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="mb-3 text-sm font-semibold">
              Attribution Context
            </div>
            <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-4">
              <DetailField
                label="Everflow TID"
                value={
                  orders[0]?.everflow_transaction_id || orders[0]?.sub5 || "—"
                }
                mono
              />
              <DetailField
                label="Affiliate ID"
                value={orders[0]?.affiliate_id || "—"}
              />
              <DetailField
                label="Source ID"
                value={orders[0]?.source_id || "—"}
              />
              <DetailField
                label="TKID"
                value={orders[0]?.tkid || "Not linked yet"}
                mono
              />
            </div>

            <details className="mt-4 rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                View Advanced Attribution Fields
              </summary>

              <div className="mt-4 grid grid-cols-1 gap-4 text-sm md:grid-cols-5">
                <DetailField label="Sub1" value={orders[0]?.sub1 || "—"} />
                <DetailField label="Sub2" value={orders[0]?.sub2 || "—"} />
                <DetailField label="Sub3" value={orders[0]?.sub3 || "—"} />
                <DetailField label="Sub4" value={orders[0]?.sub4 || "—"} />
                <DetailField label="Sub5" value={orders[0]?.sub5 || "—"} mono />
              </div>
            </details>
          </div>
        </>
      )}
    </div>
  );
}
