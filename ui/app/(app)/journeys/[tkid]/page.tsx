// app/(app)/journeys/[tkid]/page.tsx
import Link from "next/link";
import { EntityHeader } from "@/components/shared/entity-header";
import { LiveRouteRefresh } from "@/components/live/live-route-refresh";

type TimelineEvent = {
  id: string;
  event_type: string;
  event_time: string;
  source_platform: string | null;
  source_connector: string | null;
  source_record_id: string | null;
  platform_order_id: string | null;
  session_id: string | null;
  touchpoint_id: string | null;
  amount: string | null;
  currency: string | null;
  affiliate_id: string | null;
  offer_id: string | null;
  campaign_id: string | null;
  source: string | null;
  medium: string | null;
  transaction_id: string | null;
  metadata: Record<string, any>;
};

type JourneyResponse = {
  ok: boolean;
  journey: {
    id: string;
    person_id: string | null;
    started_at: string;
    ended_at: string;
    status: string;
    event_count: number;
    purchase_count: number;
    conversion_count: number;
    total_revenue: string | number | null;
  };
  events: TimelineEvent[];
  next_cursor?: string | null;
};

function apiBaseUrl() {
  return String(
    process.env.TRACEKIT_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE ||
    "http://127.0.0.1:8787"
  ).replace(/\/+$/, "");
}

function adminSecret() {
  return String(process.env.TK_SECRET_KEY || process.env.TRACEKIT_TK_SECRET || "").trim();
}

async function readJsonSafe(res: Response) {
  const text = await res.text().catch(() => "");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, error: "invalid_json", message: text.slice(0, 400) };
  }
}

async function currentApiGet<T>(pathAndQuery: string): Promise<T> {
  const secret = adminSecret();
  if (!secret) throw new Error("TK_SECRET_KEY is required on the UI server for Journey Explorer requests.");
  const res = await fetch(`${apiBaseUrl()}${pathAndQuery}`, {
    method: "GET",
    cache: "no-store",
    headers: {
      accept: "application/json",
      "x-tk-secret": secret,
    },
  });
  const body = await readJsonSafe(res);
  if (!res.ok) throw new Error(body?.message || body?.error || `API ${res.status}`);
  return body as T;
}

function numberFrom(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function isConversion(event: TimelineEvent) {
  return ["purchase", "upsell", "subscription_started", "subscription_renewed"].includes(event.event_type);
}

function computeStats(timeline: TimelineEvent[], journey?: JourneyResponse["journey"] | null) {
  const currency = timeline.find((event) => event.currency)?.currency || "USD";
  const grossSales = timeline.filter(isConversion).reduce((sum, event) => sum + numberFrom(event.amount), 0);
  const totalRefunds = timeline.filter((event) => event.event_type === "refund").reduce((sum, event) => sum + Math.abs(numberFrom(event.amount)), 0);
  const totalChargebacks = timeline.filter((event) => event.event_type === "chargeback").reduce((sum, event) => sum + Math.abs(numberFrom(event.amount)), 0);
  const times = timeline.map((event) => Date.parse(event.event_time)).filter(Number.isFinite);
  return {
    grossSales,
    totalRefunds,
    totalChargebacks,
    netRevenue: grossSales - totalRefunds - totalChargebacks,
    salesCount: timeline.filter(isConversion).length,
    refundsCount: timeline.filter((event) => event.event_type === "refund").length,
    chargebacksCount: timeline.filter((event) => event.event_type === "chargeback").length,
    currency,
    firstSeen: journey?.started_at || (times.length ? new Date(Math.min(...times)).toISOString() : undefined),
    lastSeen: journey?.ended_at || (times.length ? new Date(Math.max(...times)).toISOString() : undefined),
  };
}

function computeNetworkSummary(timeline: TimelineEvent[]) {
  const bySource = new Map<string, number>();
  for (const event of timeline) {
    const key = event.affiliate_id || event.source || event.medium || event.source_platform || "Direct / unknown";
    bySource.set(key, (bySource.get(key) || 0) + 1);
  }
  return Array.from(bySource.entries()).map(([label, count]) => ({ label, count }));
}

function computeOrdersFromTimeline(timeline: TimelineEvent[]) {
  return timeline
    .filter((event) => event.platform_order_id || event.transaction_id || event.amount)
    .map((event) => ({
      id: event.platform_order_id || event.transaction_id || event.id,
      event_type: event.event_type,
      amount: event.amount,
      currency: event.currency || "USD",
      at: event.event_time,
    }));
}

function formatTime(value: string | null | undefined) {
  if (!value) return "Unknown";
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(ms));
}

function formatMoney(value: number | string | null | undefined, currency = "USD") {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return String(value || "-");
  try {
    return numeric.toLocaleString("en-US", { style: "currency", currency });
  } catch {
    return `${numeric.toFixed(2)} ${currency}`;
  }
}

// ✅ IMPORTANT: do NOT name this type PageProps (conflicts with Next internal typing)
type Props = {
  params: Promise<{ tkid: string }>;
};

export default async function JourneyDetailPage({ params }: Props) {
  const { tkid } = await params;
  const decodedJourneyId = decodeURIComponent(tkid);

  let data: JourneyResponse | null = null;
  let error: string | null = null;

  try {
    const json = await currentApiGet<JourneyResponse>(
      `/v1/journeys/${encodeURIComponent(decodedJourneyId)}?workspace_id=default&limit=100`
    );
    if (!json.ok) throw new Error("API returned not ok");
    data = json;
  } catch (e: any) {
    console.error("[JourneyDetail] failed to load", e);
    error = e?.message ?? "Failed to load journey";
  }

  const timeline = data?.events ?? [];
  const stats = computeStats(timeline, data?.journey);
  const networkSummary = computeNetworkSummary(timeline);
  const orders = computeOrdersFromTimeline(timeline);

  return (
    <div className="p-6 space-y-4 text-sm text-slate-900 dark:text-slate-100">
      <LiveRouteRefresh workspaceId="default" entity={{ type: "journey", id: decodedJourneyId }} types={["entity.changed", "metric.changed", "activity.created", "activity.updated"]} />
      <div className="flex justify-end">
        <Link
          href="/journeys"
          className="text-sm underline underline-offset-4 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
        >
          Back
        </Link>
      </div>

      <section className="rounded-xl border bg-white p-5 shadow-sm dark:border-white/10 dark:bg-ink/80">
        <EntityHeader
          entityType="journey"
          title="Customer Journey"
          subtitle={`Journey ${decodedJourneyId}`}
          statuses={[
            { label: data?.journey?.status || (stats.salesCount ? "Converted" : "Browsing"), tone: stats.salesCount ? "success" : "info" },
          ]}
          metadata={[
            { label: "Touchpoints", value: timeline.length },
            { label: "Conversions", value: data?.journey?.conversion_count ?? stats.salesCount },
            { label: "First seen", value: stats.firstSeen || "Unknown" },
            { label: "Last activity", value: stats.lastSeen || "Unknown" },
          ]}
          identifiers={[
            { label: "Journey ID", value: decodedJourneyId },
            { label: "Person ID", value: data?.journey?.person_id || "" },
          ]}
          actions={[
            { id: "copy-journey-id", label: "Copy journey ID", kind: "copy", value: decodedJourneyId, safe: true },
            { id: "copy-journey-link", label: "Copy link", kind: "copy", value: `/journeys/${encodeURIComponent(decodedJourneyId)}`, safe: true },
          ]}
        />
      </section>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          <span className="font-semibold">Journey unavailable.</span>{" "}
          <span className="font-mono text-xs opacity-80">{error}</span>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border p-4">
          <div className="text-xs text-slate-500">Gross sales</div>
          <div className="mt-1 text-lg font-semibold">{formatMoney(stats.grossSales, stats.currency)}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs text-slate-500">Net revenue</div>
          <div className="mt-1 text-lg font-semibold">{formatMoney(stats.netRevenue, stats.currency)}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs text-slate-500">Purchases</div>
          <div className="mt-1 text-lg font-semibold">{stats.salesCount}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs text-slate-500">Refunds / chargebacks</div>
          <div className="mt-1 text-lg font-semibold">{stats.refundsCount + stats.chargebacksCount}</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="rounded-xl border overflow-hidden">
          <div className="border-b px-4 py-3 text-sm font-semibold">Timeline</div>
          {timeline.length ? (
            <div className="divide-y">
              {timeline.map((event) => (
                <div key={event.id} className="grid gap-3 px-4 py-3 md:grid-cols-[10rem_minmax(0,1fr)_8rem]">
                  <div className="text-xs text-slate-500">{formatTime(event.event_time)}</div>
                  <div className="min-w-0">
                    <div className="font-medium">{event.event_type.replace(/_/g, " ")}</div>
                    <div className="mt-1 truncate text-xs text-slate-500">
                      {event.source_platform || event.source_connector || event.source || "unknown source"}
                      {event.affiliate_id ? ` · affiliate ${event.affiliate_id}` : ""}
                      {event.platform_order_id ? ` · order ${event.platform_order_id}` : ""}
                    </div>
                  </div>
                  <div className="text-right text-xs">{event.amount ? formatMoney(event.amount, event.currency || stats.currency) : "—"}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-sm text-slate-500">No timeline events found.</div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border p-4">
            <div className="text-sm font-semibold">Sources</div>
            <div className="mt-3 space-y-2">
              {networkSummary.length ? networkSummary.map((item) => (
                <div key={item.label} className="flex justify-between gap-3 text-xs">
                  <span className="truncate">{item.label}</span>
                  <span className="font-medium">{item.count}</span>
                </div>
              )) : <div className="text-xs text-slate-500">No source data available.</div>}
            </div>
          </div>
          <div className="rounded-xl border p-4">
            <div className="text-sm font-semibold">Orders</div>
            <div className="mt-3 space-y-2">
              {orders.length ? orders.slice(0, 8).map((order) => (
                <div key={`${order.id}:${order.at}`} className="text-xs">
                  <div className="font-mono">{order.id}</div>
                  <div className="text-slate-500">{order.event_type} · {formatMoney(order.amount, order.currency)}</div>
                </div>
              )) : <div className="text-xs text-slate-500">No order events found.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
