import Link from "next/link";
import type { LedgerRow, OrderProfitResponse } from "@/lib/profit-types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE ??
  "https://tracekit-api.anthony-d15.workers.dev";

type TimelineEvent = {
  type:
    | "created"
    | "imported"
    | "payment"
    | "receipt"
    | "status"
    | "tracking"
    | "attribution"
    | "journey";
  label: string;
  ts: string;
  detail?: string;
  badge?: string;
  sortRank: number;
};

async function getOrder(platformOrderId: string) {
  const res = await fetch(`${API_BASE}/v1/platform-orders/detail?platform_order_id=${encodeURIComponent(platformOrderId)}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Failed to load order");
  }

  return res.json();
}

async function getOrderProfit(order: any): Promise<{
  profit: OrderProfitResponse | null;
  error: string | null;
}> {
  const orderId = String(order?.order_id || "").trim();
  if (!orderId) return { profit: null, error: null };

  const params = new URLSearchParams({ workspace_id: "default" });

  if (order.platform_store_id) {
    params.set("connector_id", String(order.platform_store_id));
  }

  if (order.currency) {
    params.set("currency", String(order.currency).toUpperCase());
  }

  try {
    const res = await fetch(
      `${API_BASE}/v1/profit/orders/${encodeURIComponent(orderId)}?${params.toString()}`,
      { cache: "no-store" },
    );
    const text = await res.text();
    const json = text ? (JSON.parse(text) as OrderProfitResponse) : null;

    if (!res.ok || json?.ok === false) {
      return {
        profit: null,
        error: json?.message || json?.error || `Profit API ${res.status}`,
      };
    }

    return { profit: json, error: null };
  } catch (e: any) {
    return { profit: null, error: e?.message || "Failed to load profit data" };
  }
}

function formatMoney(n: number | null | undefined, currency?: string | null) {
  const cur = currency || "USD";
  const val = Number(n ?? 0);

  return val.toLocaleString("en-US", {
    style: "currency",
    currency: cur,
  });
}

function formatSignedMoney(n: number | string | null | undefined, currency?: string | null) {
  const cur = currency || "USD";
  const val = Number(n ?? 0);
  const formatted = Math.abs(val).toLocaleString("en-US", {
    style: "currency",
    currency: cur,
  });

  if (val < 0) return `-${formatted}`;
  if (val > 0) return `+${formatted}`;
  return formatted;
}

function formatProfitMargin(n: number | null | undefined) {
  const val = Number(n);
  return Number.isFinite(val) ? `${val.toFixed(1)}%` : "—";
}

function parseDateSafe(v: any) {
  if (!v) return null;

  const d = new Date(String(v));
  if (Number.isFinite(d.getTime())) return d;

  const s = String(v).trim();
  const m = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (m) {
    const [, mm, dd, yyyy, hh, min, ss = "00"] = m;
    const parsed = new Date(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
      Number(hh),
      Number(min),
      Number(ss),
    );
    if (Number.isFinite(parsed.getTime())) return parsed;
  }

  return null;
}

function formatTimelineDate(v: any) {
  const d = parseDateSafe(v);
  if (!d) return String(v || "—");

  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ledgerTypeLabel(value?: string | null) {
  const s = String(value || "").trim();
  if (!s) return "Unknown";

  const labels: Record<string, string> = {
    sale: "Sale",
    refund: "Refund",
    chargeback: "Chargeback",
    chargeback_fee: "Chargeback fee",
    processor_fee: "Processor fee",
    affiliate_payout: "Affiliate payout",
    shipping_cost: "Shipping cost",
    bank_fee: "Bank fee",
    tax: "Tax",
    cogs: "COGS",
    ad_spend: "Ad spend",
    reversal: "Reversal",
    adjustment: "Adjustment",
  };

  return labels[s] || s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function sortLedgerRows(rows: LedgerRow[]) {
  return [...rows].sort((a, b) => {
    const at = parseDateSafe(a.occurred_at)?.getTime() ?? 0;
    const bt = parseDateSafe(b.occurred_at)?.getTime() ?? 0;
    return at - bt;
  });
}

function timeBetween(prevTs?: string | null, nextTs?: string | null) {
  const prev = parseDateSafe(prevTs);
  const next = parseDateSafe(nextTs);
  if (!prev || !next) return "";

  const diffMs = next.getTime() - prev.getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return "";

  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "moments later";
  if (mins < 60) return `${mins} min later`;

  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr later`;

  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} later`;
}

function statusClasses(status?: string | null) {
  const s = String(status || "").toUpperCase();

  if (["COMPLETED", "DELIVERED", "PAID", "SHIPPED", "SHIPPING", "SUCCESS"].includes(s)) {
    return "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300";
  }

  if (["PENDING", "PROCESSING", "PARTIAL", "HOLD", "REVIEW"].includes(s)) {
    return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
  }

  if (["REFUNDED", "CANCELLED", "DECLINED", "CHARGEDBACK", "CHARGED_BACK", "CHARGEBACK"].includes(s)) {
    return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
  }

  return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

function timelineStyle(type: TimelineEvent["type"], status?: string | null) {
  const s = String(status || "").toUpperCase();

  if (type === "status") {
    if (["COMPLETED", "DELIVERED", "PAID", "SUCCESS", "APPROVED"].includes(s)) {
      return { icon: "✅", dot: "bg-green-500", bg: "bg-green-50 dark:bg-green-950/30" };
    }

    if (["SHIPPED", "SHIPPING"].includes(s)) {
      return { icon: "🚚", dot: "bg-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30" };
    }

    if (["PENDING", "PROCESSING", "PARTIAL", "HOLD", "REVIEW"].includes(s)) {
      return { icon: "⏳", dot: "bg-amber-500", bg: "bg-amber-50 dark:bg-amber-950/30" };
    }

    if (["REFUNDED", "CANCELLED", "DECLINED", "CHARGEDBACK", "CHARGED_BACK", "CHARGEBACK"].includes(s)) {
      return { icon: "⛔", dot: "bg-red-500", bg: "bg-red-50 dark:bg-red-950/30" };
    }
  }

  switch (type) {
    case "created":
      return { icon: "🧾", dot: "bg-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30" };
    case "imported":
      return { icon: "⬇️", dot: "bg-slate-400", bg: "bg-slate-50 dark:bg-slate-800" };
    case "payment":
      return { icon: "💳", dot: "bg-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/30" };
    case "receipt":
      return { icon: "🧾", dot: "bg-green-500", bg: "bg-green-50 dark:bg-green-950/30" };
    case "tracking":
      return { icon: "📦", dot: "bg-indigo-500", bg: "bg-indigo-50 dark:bg-indigo-950/30" };
    case "attribution":
      return { icon: "🎯", dot: "bg-cyan-500", bg: "bg-cyan-50 dark:bg-cyan-950/30" };
    case "journey":
      return { icon: "🔗", dot: "bg-purple-500", bg: "bg-purple-50 dark:bg-purple-950/30" };
    default:
      return { icon: "•", dot: "bg-slate-400", bg: "bg-slate-50 dark:bg-slate-800" };
  }
}

function addTimelineEvent(events: TimelineEvent[], event: TimelineEvent) {
  if (!event.ts) return;

  const duplicate = events.some(
    (existing) =>
      existing.type === event.type &&
      existing.label === event.label &&
      existing.ts === event.ts &&
      existing.detail === event.detail,
  );

  if (!duplicate) events.push(event);
}

function buildOrderTimeline(order: any): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const raw = order.raw_json || {};

  const orderCreatedTs = order.order_ts || raw["Order Create Date"] || raw.createDate;
  const receiptTs = raw["Create Date (Receipts)"] || raw.createDate || order.order_ts;
  const statusTs = raw["Updated Date"] || raw.updatedAt || order.updated_at || order.order_ts;
  const trackingNumber = order.tracking_number || raw.TrackingNumber || raw.trackingNumber;
  const processor = raw["Payment Processor Name"] || raw.processor || raw.gateway || "";

  if (orderCreatedTs) {
    addTimelineEvent(events, {
      type: "created",
      label: "Order Created",
      ts: orderCreatedTs,
      detail: `${order.platform || "Platform"} order ${order.order_id || ""}`.trim(),
      sortRank: 10,
    });
  }

  if (order.created_at) {
    addTimelineEvent(events, {
      type: "imported",
      label: "Imported into TraceKit",
      ts: order.created_at,
      detail: "Order was stored in platform_orders.",
      sortRank: 20,
    });
  }

  if (order.tkid) {
    addTimelineEvent(events, {
      type: "journey",
      label: "Attribution Click",
      ts: orderCreatedTs || order.created_at || order.updated_at,
      detail: `TKID: ${order.tkid}`,
      sortRank: 30,
    });
  }

  if (order.everflow_transaction_id || order.sub5 || order.affiliate_id) {
    const parts = [];
    if (order.everflow_transaction_id || order.sub5) {
      parts.push(`EF TID: ${order.everflow_transaction_id || order.sub5}`);
    }
    if (order.affiliate_id) parts.push(`Affiliate: ${order.affiliate_id}`);
    if (order.source_id) parts.push(`Source: ${order.source_id}`);

    addTimelineEvent(events, {
      type: "attribution",
      label: "Everflow Attribution",
      ts: orderCreatedTs || order.created_at || order.updated_at,
      detail: parts.join("\n"),
      sortRank: 40,
    });
  }

  if (order.transaction_id) {
    addTimelineEvent(events, {
      type: "payment",
      label: "Payment Transaction Captured",
      ts: orderCreatedTs || order.order_ts,
      detail: [processor ? `Processor: ${processor}` : "", `Transaction: ${order.transaction_id}`]
        .filter(Boolean)
        .join("\n"),
      sortRank: 50,
    });
  }

  if (raw["Receipt Status Name"]) {
    addTimelineEvent(events, {
      type: "receipt",
      label: `Receipt ${raw["Receipt Status Name"]}`,
      ts: receiptTs,
      detail: processor || "",
      badge: raw["Receipt Status Name"],
      sortRank: 60,
    });
  }

  if (trackingNumber) {
    addTimelineEvent(events, {
      type: "tracking",
      label: "Tracking Number Added",
      ts: statusTs || order.updated_at || order.order_ts,
      detail: [order.shipping_carrier || raw["Shipping Carrier"] || "", trackingNumber]
        .filter(Boolean)
        .join(" "),
      sortRank: 70,
    });
  }

  if (order.status) {
    addTimelineEvent(events, {
      type: "status",
      label: `Status: ${order.status}`,
      ts: statusTs,
      detail: raw["Order Status Name"] || order.status,
      badge: order.status,
      sortRank: 80,
    });
  }

  return events.sort((a, b) => {
    const ad = parseDateSafe(a.ts)?.getTime() ?? 0;
    const bd = parseDateSafe(b.ts)?.getTime() ?? 0;

    if (ad !== bd) return ad - bd;

    return a.sortRank - b.sortRank;
  });
}

function rawProductName(order: any) {
  return (
    order.raw_json?.["Product Name"] ||
    order.raw_json?.ProductName ||
    order.raw_json?.productName ||
    order.raw_json?.SKUId ||
    "—"
  );
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ platform_order_id: string }>;
}) {
  const { platform_order_id } = await params;
  const platformOrderId = decodeURIComponent(platform_order_id);

  const data = await getOrder(platformOrderId);

  const order = data.order;

  if (!order) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Order Not Found</h1>
      </div>
    );
  }

  const timeline = buildOrderTimeline(order);
  const profitState = await getOrderProfit(order);
  const profit = profitState.profit;
  const rollup = profit?.rollup || null;
  const ledgerRows = sortLedgerRows(profit?.ledger_rows || []);
  const currency = rollup?.currency || order.currency || "USD";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-sm text-slate-500">Full Order Detail</div>

          <h1 className="text-2xl font-bold">{order.order_id}</h1>
          <div className="mt-1 text-sm text-slate-500">
            {rawProductName(order)} • {order.platform || "—"}
          </div>
        </div>

        <div className="flex gap-2">
          {order.identity_key ? (
            <Link
              href={`/customers/${encodeURIComponent(order.identity_key)}`}
              className="rounded border px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Customer
            </Link>
          ) : null}

          <Link
            href="/orders"
            className="rounded border px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Back to Orders
          </Link>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-3 font-semibold">Summary</h2>

        <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          <div>
            <div className="text-slate-500">Platform</div>
            <div>{order.platform}</div>
          </div>

          <div>
            <div className="text-slate-500">Status</div>
            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusClasses(order.status)}`}>
              {order.status || "UNKNOWN"}
            </span>
          </div>

          <div>
            <div className="text-slate-500">Order Timestamp</div>
            <div>{order.order_ts}</div>
          </div>

          <div>
            <div className="text-slate-500">Currency</div>
            <div>{order.currency}</div>
          </div>

          <div className="md:col-span-2">
            <div className="text-slate-500">Full Platform Order ID</div>
            <div className="font-mono text-xs break-all">{order.platform_order_id || "—"}</div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-3 font-semibold">Customer</h2>

        <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          <div>
            <div className="text-slate-500">Email</div>
            <div>{order.customer_email || order.email || "—"}</div>
          </div>

          <div>
            <div className="text-slate-500">Phone</div>
            <div>{order.phone || "—"}</div>
          </div>

          <div className="md:col-span-2">
            <div className="text-slate-500">Identity Key</div>
            <div className="font-mono text-xs break-all">
              {order.identity_key || "—"}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-3 font-semibold">Attribution</h2>

        <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          <div>
            <div className="text-slate-500">TKID</div>
            <div className="font-mono text-xs break-all">{order.tkid || "—"}</div>
          </div>

          <div>
            <div className="text-slate-500">Everflow TID</div>
            <div className="font-mono text-xs break-all">
              {order.everflow_transaction_id || order.sub5 || "—"}
            </div>
          </div>

          <div>
            <div className="text-slate-500">Payment Transaction ID</div>
            <div className="font-mono text-xs break-all">
              {order.transaction_id || "—"}
            </div>
          </div>

          <div>
            <div className="text-slate-500">Affiliate ID</div>
            <div>{order.affiliate_id || "—"}</div>
          </div>

          <div>
            <div className="text-slate-500">Offer ID</div>
            <div>{order.everflow_offer_id || "—"}</div>
          </div>

          <div>
            <div className="text-slate-500">Source ID</div>
            <div>{order.source_id || "—"}</div>
          </div>

          <div>
            <div className="text-slate-500">Sub4</div>
            <div>{order.sub4 || "—"}</div>
          </div>

          <div>
            <div className="text-slate-500">Sub5</div>
            <div className="font-mono text-xs break-all">{order.sub5 || "—"}</div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-3 font-semibold">Financials</h2>

        <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
          <div>
            <div className="text-slate-500">Gross Amount</div>
            <div>{formatMoney(order.gross_amount, order.currency)}</div>
          </div>

          <div>
            <div className="text-slate-500">Receipt Total</div>
            <div>{formatMoney(order.receipt_total, order.currency)}</div>
          </div>

          <div>
            <div className="text-slate-500">Product Subtotal</div>
            <div>{formatMoney(order.product_subtotal, order.currency)}</div>
          </div>

          <div>
            <div className="text-slate-500">Shipping Amount</div>
            <div>{formatMoney(order.shipping_amount, order.currency)}</div>
          </div>

          <div>
            <div className="text-slate-500">Tax Amount</div>
            <div>{formatMoney(order.tax_amount, order.currency)}</div>
          </div>

          <div>
            <div className="text-slate-500">Gateway Fee</div>
            <div>{formatMoney(order.gateway_fee, order.currency)}</div>
          </div>

          <div>
            <div className="text-slate-500">Product Cost</div>
            <div>{formatMoney(order.product_cost, order.currency)}</div>
          </div>

          <div>
            <div className="text-slate-500">Shipping Cost</div>
            <div>{formatMoney(order.shipping_cost, order.currency)}</div>
          </div>

          <div>
            <div className="text-slate-500">Chargeback Fee</div>
            <div>{formatMoney(order.chargeback_fee, order.currency)}</div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Ledger-Based Profit</h2>
            <div className="text-xs text-slate-500">
              Profit Engine rollup from append-only conversion events.
            </div>
          </div>
          {rollup?.event_count != null ? (
            <div className="rounded-full border px-2 py-1 text-xs text-slate-500">
              {rollup.event_count} events
            </div>
          ) : null}
        </div>

        {profitState.error ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            <span className="font-semibold">Profit data unavailable.</span>{" "}
            <span className="font-mono text-xs opacity-80">{profitState.error}</span>
          </div>
        ) : null}

        {!rollup ? (
          <div className="rounded bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
            No ledger-based profit rollup is available for this order yet.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-lg border bg-slate-50 p-4 dark:bg-slate-900">
                <div className="text-xs text-slate-500">Net Profit</div>
                <div className="mt-2 text-2xl font-semibold">
                  {formatMoney(rollup.net_profit, currency)}
                </div>
              </div>
              <div className="rounded-lg border bg-slate-50 p-4 dark:bg-slate-900">
                <div className="text-xs text-slate-500">Profit Margin</div>
                <div className="mt-2 text-2xl font-semibold">
                  {formatProfitMargin(rollup.profit_margin_pct)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3 xl:grid-cols-4">
              <div>
                <div className="text-slate-500">Gross Revenue</div>
                <div>{formatMoney(rollup.gross_revenue, currency)}</div>
              </div>
              <div>
                <div className="text-slate-500">Refunds</div>
                <div>{formatSignedMoney(rollup.refunds, currency)}</div>
              </div>
              <div>
                <div className="text-slate-500">Chargebacks</div>
                <div>{formatSignedMoney(rollup.chargebacks, currency)}</div>
              </div>
              <div>
                <div className="text-slate-500">Processor Fees</div>
                <div>{formatSignedMoney(rollup.processor_fees, currency)}</div>
              </div>
              <div>
                <div className="text-slate-500">Chargeback Fees</div>
                <div>{formatSignedMoney(rollup.chargeback_fees, currency)}</div>
              </div>
              <div>
                <div className="text-slate-500">Bank Fees</div>
                <div>{formatSignedMoney(rollup.bank_fees, currency)}</div>
              </div>
              <div>
                <div className="text-slate-500">Shipping</div>
                <div>{formatSignedMoney(rollup.shipping_cost, currency)}</div>
              </div>
              <div>
                <div className="text-slate-500">Tax</div>
                <div>{formatSignedMoney(rollup.tax, currency)}</div>
              </div>
              <div>
                <div className="text-slate-500">COGS</div>
                <div>{formatSignedMoney(rollup.cogs, currency)}</div>
              </div>
              <div>
                <div className="text-slate-500">Affiliate Payout</div>
                <div>{formatSignedMoney(rollup.affiliate_payout, currency)}</div>
              </div>
              <div>
                <div className="text-slate-500">Ad Spend</div>
                <div>{formatSignedMoney(rollup.ad_spend, currency)}</div>
              </div>
              <div>
                <div className="text-slate-500">Reversals</div>
                <div>{formatSignedMoney(rollup.reversals, currency)}</div>
              </div>
              <div>
                <div className="text-slate-500">Adjustments</div>
                <div>{formatSignedMoney(rollup.adjustments, currency)}</div>
              </div>
              <div>
                <div className="text-slate-500">Net Revenue</div>
                <div>{formatMoney(rollup.net_revenue, currency)}</div>
              </div>
              <div>
                <div className="text-slate-500">Total Costs</div>
                <div>{formatSignedMoney(rollup.total_costs, currency)}</div>
              </div>
              <div>
                <div className="text-slate-500">Event Count</div>
                <div>{Number(rollup.event_count ?? 0).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-slate-500">First Event</div>
                <div>{rollup.first_event_at ? formatTimelineDate(rollup.first_event_at) : "—"}</div>
              </div>
              <div>
                <div className="text-slate-500">Last Event</div>
                <div>{rollup.last_event_at ? formatTimelineDate(rollup.last_event_at) : "—"}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border p-4">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Ledger Events</h2>
            <div className="text-xs text-slate-500">
              Append-only financial events matched to this order.
            </div>
          </div>
          <div className="text-xs text-slate-500">{ledgerRows.length} events</div>
        </div>

        {ledgerRows.length === 0 ? (
          <div className="rounded bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
            No ledger events are available for this order.
          </div>
        ) : (
          <div className="overflow-auto rounded-lg border">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 dark:bg-slate-800">
                <tr>
                  <th className="px-4 py-2 text-left whitespace-nowrap">Timestamp</th>
                  <th className="px-4 py-2 text-left whitespace-nowrap">Ledger Type</th>
                  <th className="px-4 py-2 text-right whitespace-nowrap">Amount</th>
                  <th className="px-4 py-2 text-left whitespace-nowrap">Source</th>
                  <th className="px-4 py-2 text-left whitespace-nowrap">Ingestion</th>
                  <th className="px-4 py-2 text-left whitespace-nowrap">Connector</th>
                  <th className="px-4 py-2 text-left whitespace-nowrap">Transaction ID</th>
                  <th className="px-4 py-2 text-left whitespace-nowrap">Reason</th>
                </tr>
              </thead>
              <tbody>
                {ledgerRows.map((row, idx) => (
                  <tr key={`${row.transaction_id || row.ledger_type || "event"}-${idx}`} className="border-t">
                    <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">
                      {row.occurred_at ? formatTimelineDate(row.occurred_at) : "—"}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{ledgerTypeLabel(row.ledger_type)}</td>
                    <td className="px-4 py-2 text-right font-mono whitespace-nowrap">
                      {formatSignedMoney(row.amount, row.currency || currency)}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{row.event_source || "—"}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{row.ingestion_method || "—"}</td>
                    <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{row.connector_id || "—"}</td>
                    <td className="px-4 py-2 font-mono text-xs break-all">{row.transaction_id || "—"}</td>
                    <td className="px-4 py-2">{row.reason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-lg border p-4">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Order Timeline</h2>
            <div className="text-xs text-slate-500">Narrative view of order, attribution, payment, fulfillment, and status events.</div>
          </div>
          <div className="text-xs text-slate-500">{timeline.length} events</div>
        </div>

        <div className="space-y-3">
          {timeline.length === 0 ? (
            <div className="text-sm text-slate-500">No timeline events available.</div>
          ) : (
            timeline.map((event, idx) => {
              const style = timelineStyle(event.type, event.badge || order.status);
              const previous = timeline[idx - 1];
              const relative = previous ? timeBetween(previous.ts, event.ts) : "";

              return (
                <div key={`${event.label}-${idx}`} className="relative flex gap-3">
                  {idx < timeline.length - 1 ? (
                    <div className="absolute left-[15px] top-9 h-[calc(100%-1.25rem)] w-px bg-slate-200 dark:bg-slate-700" />
                  ) : null}

                  <div className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${style.dot}`}>
                    <span>{style.icon}</span>
                  </div>

                  <div className={`min-w-0 flex-1 rounded-lg border px-3 py-2 ${style.bg}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{event.label}</div>
                        <div className="text-xs text-slate-500">
                          {formatTimelineDate(event.ts)}
                          {relative ? <span> • {relative}</span> : null}
                        </div>
                      </div>

                      {event.badge ? (
                        <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${statusClasses(event.badge)}`}>
                          {event.badge}
                        </span>
                      ) : null}
                    </div>

                    {event.detail ? (
                      <div className="mt-2 whitespace-pre-wrap rounded bg-white/70 px-2 py-1 text-sm font-mono break-all dark:bg-slate-950/50">
                        {event.detail}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-3 font-semibold">Raw Payload</h2>

        <pre className="max-h-[600px] overflow-auto rounded bg-slate-100 p-3 text-xs text-slate-900 dark:bg-slate-950 dark:text-slate-100">
          {JSON.stringify(order.raw_json, null, 2)}
        </pre>
      </div>
    </div>
  );
}
