import Link from "next/link";

const API_BASE =
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
  const res = await fetch(
    `${API_BASE}/v1/platform-orders/detail?platform_order_id=${encodeURIComponent(
      platformOrderId,
    )}`,
    {
      cache: "no-store",
    },
  );

  if (!res.ok) {
    throw new Error("Failed to load order");
  }

  return res.json();
}

function formatMoney(n: number | null | undefined, currency?: string | null) {
  const cur = currency || "USD";
  const val = Number(n ?? 0);

  return val.toLocaleString("en-US", {
    style: "currency",
    currency: cur,
  });
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
