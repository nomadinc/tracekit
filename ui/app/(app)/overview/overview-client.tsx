"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  Compass,
  LineChart as LineChartIcon,
  MousePointerClick,
  RadioTower,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiGetJson } from "@/lib/api";
import {
  notificationLifecycleLabel,
  notificationLifecycleState,
  notificationQuery,
  notificationSeverityLabel,
  notificationTimeAgo,
  type NotificationsResponse,
  type TraceKitNotification,
} from "@/lib/notifications";

type EventRow = {
  event_key: string;
  event_type: string;
  status: string;
  source: string;
  timestamp: string;
  browser_or_server: "browser" | "server";
  person_id?: string | null;
  journey_id?: string | null;
  affiliate_id?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  attribution_status?: string | null;
  commission_status?: string | null;
  tkid?: string | null;
};

type Snapshot = {
  ok: boolean;
  workspace_id: string;
  onboarding?: any;
  browser?: any;
  attribution_policy?: any;
  payout_validation?: any;
  latest_draft_commissions?: any[];
  diagnostics?: {
    failed_sections?: Array<{ section: string; status: number; error: string; message?: string | null }>;
  };
};

type KpiResponse = {
  ok?: boolean;
  gross_sales?: number;
  net_profit?: number;
  net_margin?: number;
  refund_rate?: number;
  chargebacks?: number;
  [key: string]: any;
};

type RevenuePoint = {
  date: string;
  revenue?: number;
  spend?: number;
  net_profit?: number;
  refunds?: number;
  chargebacks?: number;
};

type RevenueResponse = {
  ok?: boolean;
  series?: RevenuePoint[];
};

type CommissionResponse = {
  ok?: boolean;
  commissions?: any[];
};

const WORKSPACE_ID = "default";

const PERIODS = [
  { label: "Today", days: 1 },
  { label: "7 Days", days: 7 },
  { label: "30 Days", days: 30 },
  { label: "Quarter", days: 90 },
];

const SOURCE_FALLBACKS = [
  { name: "Google", query: "google" },
  { name: "Facebook", query: "facebook" },
  { name: "Affiliate", query: "affiliate" },
  { name: "Email", query: "email" },
];

const FUNNEL_STAGES = [
  { label: "Visitors", eventTypes: ["page_view"], href: "/journeys?event_type=page_view" },
  { label: "Leads", eventTypes: ["lead_created", "form_submit"], href: "/journeys?event_type=lead_created" },
  { label: "Checkout", eventTypes: ["checkout_started"], href: "/journeys?event_type=checkout_started" },
  { label: "Purchases", eventTypes: ["purchase"], href: "/journeys?event_type=purchase" },
  { label: "Subscriptions", eventTypes: ["subscription_started", "subscription_renewed"], href: "/journeys?event_type=subscription_started" },
];

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function ymdDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - Math.max(0, days - 1));
  return date.toISOString().slice(0, 10);
}

function monthStartYmd() {
  const date = new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function money(value: unknown, currency = "USD") {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return "$0";
  return numeric.toLocaleString("en-US", { style: "currency", currency, maximumFractionDigits: 0 });
}

function numberText(value: unknown) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return "0";
  return numeric.toLocaleString("en-US");
}

function eventAmount(event: EventRow) {
  const amount = Number(event.amount || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function statusTone(status: "healthy" | "info" | "attribution" | "warning" | "error" | "neutral") {
  return {
    healthy: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
    info: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200",
    attribution: "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-500/30 dark:bg-purple-500/10 dark:text-purple-200",
    warning: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-200",
    error: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200",
    neutral: "border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200",
  }[status];
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border bg-white p-5 shadow-sm dark:border-white/10 dark:bg-ink/85 ${className}`}>{children}</section>;
}

function EmptyState({ title, body, actionHref, actionLabel }: { title: string; body: string; actionHref?: string; actionLabel?: string }) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed bg-slate-50 p-6 text-center dark:border-white/10 dark:bg-white/5">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm dark:bg-black/20 dark:text-blue-200">
        <Sparkles className="h-5 w-5" />
      </div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">{body}</p>
      {actionHref && actionLabel ? (
        <Link href={actionHref} className="mt-4 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 dark:hover:bg-white/10">
          {actionLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}

function HealthCard({
  title,
  icon,
  tone,
  status,
  metrics,
  trend,
  href,
  action,
}: {
  title: string;
  icon: React.ReactNode;
  tone: "healthy" | "info" | "attribution" | "warning" | "error" | "neutral";
  status: string;
  metrics: Array<{ label: string; value: string }>;
  trend: string;
  href: string;
  action: string;
}) {
  return (
    <Card className="group transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${statusTone(tone)}`}>{icon}</div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(tone)}`}>{status}</span>
      </div>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {metrics.map((metric) => (
          <div key={`${title}:${metric.label}`} className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
            <div className="text-xl font-semibold">{metric.value}</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{metric.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t pt-4 text-sm dark:border-white/10">
        <span className="text-slate-500 dark:text-slate-400">{trend}</span>
        <Link href={href} className="inline-flex items-center gap-1 font-medium text-slate-950 hover:underline dark:text-white">
          {action}
          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </Link>
      </div>
    </Card>
  );
}

function healthStatusTone(status: string | undefined) {
  if (status === "Critical") return "error";
  if (status === "Needs Attention") return "warning";
  return "healthy";
}

function notificationTone(severity: string | undefined) {
  if (severity === "critical") return "error";
  if (severity === "warning") return "warning";
  if (severity === "info") return "info";
  return "healthy";
}

function NotificationSummaryPanel({ report }: { report: NotificationsResponse | null }) {
  const overall = report?.health?.overall;
  if (!overall) {
    return (
      <Card>
        <EmptyState
          title="Notifications are not available yet"
          body="The Notification Engine will show operational issues after the API is reachable from the UI server."
          actionHref="/notifications"
          actionLabel="Open Notifications"
        />
      </Card>
    );
  }

  const counts = report?.counts || { critical: 0, warning: 0, info: 0, healthy: 0, unread: 0, read: 0, resolved: 0, dismissed: 0, total: 0 };
  const notifications = report?.notifications || [];
  const tone = healthStatusTone(overall.status);

  return (
    <Card>
      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.1fr_1.05fr]">
        <div>
          <div className="flex items-center justify-between gap-3">
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${statusTone(tone)}`}>
              <ShieldCheck className="h-5 w-5" />
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(tone)}`}>{overall.status}</span>
          </div>
          <div className="mt-5 text-5xl font-semibold tracking-tight">{overall.score}</div>
          <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">Workspace Health Score</div>
          <div className="mt-5 grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-xl bg-red-50 p-3 text-red-700 dark:bg-red-500/10 dark:text-red-200">
              <div className="text-lg font-semibold">{numberText(counts.critical)}</div>
              <div className="text-xs">Critical</div>
            </div>
            <div className="rounded-xl bg-orange-50 p-3 text-orange-800 dark:bg-orange-500/10 dark:text-orange-200">
              <div className="text-lg font-semibold">{numberText(counts.warning)}</div>
              <div className="text-xs">Warnings</div>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">
              <div className="text-lg font-semibold">{numberText(counts.healthy)}</div>
              <div className="text-xs">Healthy</div>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold">Latest Notifications</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Operational inbox entries generated by the Notification Engine.</p>
          {notifications.length ? (
            <div className="mt-4 space-y-3">
              {notifications.slice(0, 5).map((notification) => (
                <Link key={notification.id} href={`/notifications?notification_id=${encodeURIComponent(notification.id)}`} className="grid grid-cols-[1fr_auto] gap-3 rounded-xl border bg-slate-50 p-3 text-sm transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10">
                  <span>
                    <span className="block font-medium">{notification.title}</span>
                    <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                      {notificationLifecycleLabel(notificationLifecycleState(notification))} · {notificationTimeAgo(notification.created_at)}
                    </span>
                  </span>
                  <span className={`self-start rounded-full border px-2 py-0.5 text-xs ${statusTone(notificationTone(notification.severity))}`}>{notificationSeverityLabel(notification.severity)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="Everything looks healthy" body="No active notifications. Your marketing operation is running normally." />
          )}
        </div>

        <div>
          <h2 className="text-xl font-semibold">Operational Inbox</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Read state lives in Notifications; resolved state comes from Health Engine.</p>
          <div className="mt-5 grid grid-cols-2 gap-2 text-center text-sm">
            <div className="rounded-xl border bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
              <div className="text-lg font-semibold">{numberText(counts.unread)}</div>
              <div className="text-xs text-slate-500">Unread</div>
            </div>
            <div className="rounded-xl border bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
              <div className="text-lg font-semibold">{numberText(counts.resolved)}</div>
              <div className="text-xs text-slate-500">Resolved</div>
            </div>
            <div className="rounded-xl border bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
              <div className="text-lg font-semibold">{numberText(counts.read)}</div>
              <div className="text-xs text-slate-500">Read</div>
            </div>
            <div className="rounded-xl border bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
              <div className="text-lg font-semibold">{numberText(counts.dismissed)}</div>
              <div className="text-xs text-slate-500">Dismissed</div>
            </div>
          </div>
          <Link href="/notifications" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:bg-white dark:text-slate-950">
            Open Notification Center
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </Card>
  );
}

function useOverviewData() {
  const [period, setPeriod] = React.useState(PERIODS[2]);
  const [snapshot, setSnapshot] = React.useState<Snapshot | null>(null);
  const [events, setEvents] = React.useState<EventRow[]>([]);
  const [kpisToday, setKpisToday] = React.useState<KpiResponse | null>(null);
  const [kpisMonth, setKpisMonth] = React.useState<KpiResponse | null>(null);
  const [revenueSeries, setRevenueSeries] = React.useState<RevenuePoint[]>([]);
  const [commissions, setCommissions] = React.useState<any[]>([]);
  const [notificationReport, setNotificationReport] = React.useState<NotificationsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      const today = todayYmd();
      const from = ymdDaysAgo(period.days);
      try {
        const [snapshotResult, eventsResult, notificationResult, kpisTodayResult, kpisMonthResult, revenueResult, commissionResult] = await Promise.allSettled([
          fetch(`/api/setup-wizard?workspace_id=${encodeURIComponent(WORKSPACE_ID)}`, { cache: "no-store", headers: { accept: "application/json" } }).then((res) => res.json()),
          fetch(`/api/events?workspace_id=${encodeURIComponent(WORKSPACE_ID)}&limit=100&from=${encodeURIComponent(from)}&to=${encodeURIComponent(today)}&dir=desc`, { cache: "no-store", headers: { accept: "application/json" } }).then((res) => res.json()),
          fetch(notificationQuery({ workspace_id: WORKSPACE_ID, limit: 5 }), { cache: "no-store", headers: { accept: "application/json" } }).then((res) => res.json()),
          apiGetJson<KpiResponse>(`/v1/kpis?from=${encodeURIComponent(today)}&to=${encodeURIComponent(today)}`),
          apiGetJson<KpiResponse>(`/v1/kpis?from=${encodeURIComponent(monthStartYmd())}&to=${encodeURIComponent(today)}`),
          apiGetJson<RevenueResponse>(`/v1/revenue-spend?from=${encodeURIComponent(from)}&to=${encodeURIComponent(today)}`),
          apiGetJson<CommissionResponse>(`/v1/payouts/affiliate-commissions?workspace_id=${encodeURIComponent(WORKSPACE_ID)}&limit=100`),
        ]);

        if (cancelled) return;
        if (snapshotResult.status === "fulfilled") setSnapshot(snapshotResult.value);
        if (eventsResult.status === "fulfilled") setEvents(Array.isArray(eventsResult.value?.events) ? eventsResult.value.events : []);
        if (notificationResult.status === "fulfilled" && notificationResult.value?.ok !== false) setNotificationReport(notificationResult.value);
        if (kpisTodayResult.status === "fulfilled") setKpisToday(kpisTodayResult.value);
        if (kpisMonthResult.status === "fulfilled") setKpisMonth(kpisMonthResult.value);
        if (revenueResult.status === "fulfilled") setRevenueSeries(Array.isArray(revenueResult.value?.series) ? revenueResult.value.series : []);
        if (commissionResult.status === "fulfilled") setCommissions(Array.isArray(commissionResult.value?.commissions) ? commissionResult.value.commissions : []);

        const rejected = [snapshotResult, eventsResult, notificationResult, kpisTodayResult, kpisMonthResult, revenueResult, commissionResult]
          .filter((result) => result.status === "rejected");
        if (rejected.length === 7) setError("Overview data is temporarily unavailable.");
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Overview failed to load.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [period]);

  return { period, setPeriod, snapshot, events, notificationReport, kpisToday, kpisMonth, revenueSeries, commissions, loading, error };
}

export default function OverviewClient() {
  const router = useRouter();
  const {
    period,
    setPeriod,
    snapshot,
    events,
    notificationReport,
    kpisToday,
    kpisMonth,
    revenueSeries,
    commissions,
    loading,
    error,
  } = useOverviewData();

  React.useEffect(() => {
    if (!loading && snapshot?.onboarding && !snapshot.onboarding.completed_at) {
      router.replace("/setup");
    }
  }, [loading, router, snapshot]);

  const browser = snapshot?.browser || {};
  const policy = snapshot?.attribution_policy || {};
  const health = browser.health || {};
  const reviewCount = Number(health.events_needing_review ?? events.filter((event) => event.status === "review").length);
  const processedEvents = events.filter((event) => event.status === "normalized").length;
  const loadedEvents = events.length;
  const successRate = loadedEvents ? `${Math.round((processedEvents / loadedEvents) * 100)}%` : "No events yet";
  const journeyCount = new Set(events.map((event) => event.journey_id).filter(Boolean)).size;
  const newVisitorCount = new Set(events.filter((event) => !event.person_id && event.tkid).map((event) => event.tkid)).size;
  const returningVisitorCount = new Set(events.filter((event) => event.person_id).map((event) => event.person_id)).size;
  const purchases = events.filter((event) => event.event_type === "purchase");
  const conversionRate = loadedEvents ? `${Math.round((purchases.length / loadedEvents) * 100)}%` : "No events yet";
  const attributedConversions = events.filter((event) => event.attribution_status === "attributed").length;
  const unattributedConversions = events.filter((event) => event.attribution_status === "unattributed" || event.attribution_status === "not_calculated").length;
  const confidence = purchases.length ? `${Math.round((attributedConversions / purchases.length) * 100)}%` : "Waiting";
  const draftCommissions = commissions.filter((commission) => String(commission.status || "draft") === "draft");
  const pendingCommissions = commissions.filter((commission) => String(commission.status || "") === "pending");

  const sourceCards = SOURCE_FALLBACKS.map((source) => {
    const sourceEvents = events.filter((event) => {
      const haystack = `${event.source || ""} ${event.affiliate_id || ""}`.toLowerCase();
      return haystack.includes(source.query);
    });
    return {
      name: source.name,
      visitors: new Set(sourceEvents.map((event) => event.person_id || event.tkid || event.event_key)).size,
      revenue: sourceEvents.reduce((sum, event) => sum + eventAmount(event), 0),
      conversions: sourceEvents.filter((event) => event.event_type === "purchase").length,
    };
  });

  const maxSourceRevenue = Math.max(1, ...sourceCards.map((source) => source.revenue));
  const chartHasData = revenueSeries.some((point) => Number(point.revenue || 0) || Number(point.net_profit || 0) || Number(point.spend || 0));
  const latestNotifications = notificationReport?.notifications || [];

  if (loading && !snapshot) {
    return (
      <div className="grid gap-5">
        <div className="h-40 animate-pulse rounded-2xl bg-slate-200 dark:bg-white/10" />
        <div className="grid gap-5 lg:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <div key={item} className="h-52 animate-pulse rounded-2xl bg-slate-200 dark:bg-white/10" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return <EmptyState title="Overview is temporarily unavailable" body={error} actionHref="/setup" actionLabel="Review setup" />;
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border bg-slate-950 p-6 text-white shadow-sm dark:border-white/10">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-blue-100">
              <Compass className="h-3.5 w-3.5" />
              Executive command center
            </div>
            <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">Know what is working, what is stuck, and where revenue is coming from.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">TraceKit brings tracking health, customer journeys, attribution, and commissions into one operational view.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-2xl bg-white/10 p-4">
              <div className="text-sm text-slate-300">Workspace</div>
              <div className="mt-1 font-semibold">{snapshot?.onboarding?.workspace_name || "Default Workspace"}</div>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <div className="text-sm text-slate-300">Website</div>
              <div className="mt-1 truncate font-semibold">{snapshot?.onboarding?.primary_website_url || "Add in setup"}</div>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <div className="text-sm text-slate-300">Environment</div>
              <div className="mt-1 font-semibold">Production</div>
            </div>
          </div>
        </div>
      </section>

      <NotificationSummaryPanel report={notificationReport} />

      <section className="grid gap-5 xl:grid-cols-4">
        <HealthCard
          title="Tracking Health"
          icon={<RadioTower className="h-5 w-5" />}
          tone={reviewCount ? "warning" : processedEvents ? "healthy" : "info"}
          status={reviewCount ? "Needs attention" : processedEvents ? "Healthy" : "Waiting for events"}
          metrics={[
            { label: "Events processed today", value: numberText(processedEvents) },
            { label: "Events requiring review", value: numberText(reviewCount) },
            { label: "Processing success rate", value: successRate },
            { label: "Last browser event", value: browser.last_event_received?.received_at ? "Recent" : "None yet" },
          ]}
          trend={processedEvents ? "Live data from browser events" : "Install tracking to start"}
          href="/events"
          action="View Events"
        />
        <HealthCard
          title="Customer Journeys"
          icon={<Users className="h-5 w-5" />}
          tone={journeyCount ? "info" : "neutral"}
          status={journeyCount ? "Active" : "Building"}
          metrics={[
            { label: "Active journeys", value: numberText(journeyCount) },
            { label: "New visitors", value: numberText(newVisitorCount) },
            { label: "Returning visitors", value: numberText(returningVisitorCount) },
            { label: "Conversion rate", value: conversionRate },
          ]}
          trend={journeyCount ? "Journey data is available" : "Journeys appear after events link to people"}
          href="/journeys"
          action="Explore Customer Journeys"
        />
        <HealthCard
          title="Attribution"
          icon={<BarChart3 className="h-5 w-5" />}
          tone="attribution"
          status={policy.active_model ? "Configured" : "Default"}
          metrics={[
            { label: "Active model", value: policy.active_model || "First Touch" },
            { label: "Attribution confidence", value: confidence },
            { label: "Attributed conversions", value: numberText(attributedConversions) },
            { label: "Unattributed conversions", value: numberText(unattributedConversions) },
          ]}
          trend={attributedConversions ? "Attribution credits detected" : "Credits appear after conversions"}
          href="/journeys"
          action="View Attribution"
        />
        <HealthCard
          title="Revenue"
          icon={<CircleDollarSign className="h-5 w-5" />}
          tone="healthy"
          status={Number(kpisToday?.gross_sales || 0) ? "Active" : "Waiting for revenue"}
          metrics={[
            { label: "Revenue today", value: money(kpisToday?.gross_sales) },
            { label: "Revenue this month", value: money(kpisMonth?.gross_sales) },
            { label: "Pending commissions", value: numberText(pendingCommissions.length) },
            { label: "Draft commissions", value: numberText(draftCommissions.length) },
          ]}
          trend={Number(kpisMonth?.gross_sales || 0) ? "Revenue reporting is live" : "Reporting becomes available as events accumulate"}
          href="/reports"
          action="Open Commissions"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.55fr_0.95fr]">
        <Card className="min-h-[28rem]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Revenue Trend</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Revenue, spend, and net profit from existing reporting APIs.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {PERIODS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setPeriod(item)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-slate-400 ${period.label === item.label ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950" : "hover:bg-slate-50 dark:hover:bg-white/10"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {chartHasData ? (
            <div className="mt-6 h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueSeries}>
                  <defs>
                    <linearGradient id="overviewRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="overviewProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={(value) => money(value)} />
                  <Tooltip formatter={(value: any) => money(value)} />
                  <Area type="monotone" dataKey="revenue" stroke="#2563eb" fill="url(#overviewRevenue)" strokeWidth={2} />
                  <Area type="monotone" dataKey="net_profit" stroke="#10b981" fill="url(#overviewProfit)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title="Revenue reporting will appear here"
              body="Reporting becomes available as purchase events and profit rollups accumulate."
              actionHref="/events"
              actionLabel="View Events"
            />
          )}
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Latest Notifications</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Operational inbox entries generated by the Notification Engine.</p>
            </div>
            <Link href="/notifications" className="rounded-full border px-3 py-1.5 text-sm font-medium hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10 dark:hover:bg-white/5">View All</Link>
          </div>
          <div className="mt-5 space-y-3">
            {latestNotifications.length ? latestNotifications.map((notification) => (
              <Link key={notification.id} href={`/notifications?notification_id=${encodeURIComponent(notification.id)}`} className={`flex items-start gap-3 rounded-2xl border p-4 transition hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400 ${statusTone(notificationTone(notification.severity))}`}>
                <AlertTriangle className="mt-0.5 h-5 w-5" />
                <span>
                  <span className="block font-medium">{notification.title}</span>
                  <span className="mt-1 block text-xs opacity-70">
                    {notificationLifecycleLabel(notificationLifecycleState(notification))} · {notificationSeverityLabel(notification.severity)} · {notificationTimeAgo(notification.created_at)}
                  </span>
                  <span className="mt-1 block text-sm opacity-80">{notification.summary}</span>
                </span>
              </Link>
            )) : (
              <EmptyState title="Everything looks healthy" body="No active notifications. Your marketing operation is running normally." actionHref="/notifications" actionLabel="Open Notifications" />
            )}
          </div>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <h2 className="text-xl font-semibold">Marketing Performance</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Source-level performance from the current event sample.</p>
          {events.length ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {sourceCards.map((source) => (
                <Link key={source.name} href={`/events?source=${encodeURIComponent(source.name.toLowerCase())}`} className="rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{source.name}</div>
                    <MousePointerClick className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                    <div><div className="font-semibold">{numberText(source.visitors)}</div><div className="text-xs text-slate-500">Visitors</div></div>
                    <div><div className="font-semibold">{money(source.revenue)}</div><div className="text-xs text-slate-500">Revenue</div></div>
                    <div><div className="font-semibold">{source.name === "Google" || source.name === "Facebook" ? "N/A" : numberText(source.conversions)}</div><div className="text-xs text-slate-500">{source.name === "Google" || source.name === "Facebook" ? "ROAS" : "Conversions"}</div></div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="No channel performance yet" body="Marketing cards will populate as browser events, attribution credits, and revenue events accumulate." actionHref="/setup" actionLabel="Install tracking" />
          )}
        </Card>

        <Card>
          <h2 className="text-xl font-semibold">Attribution Summary</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Attributed conversions grouped by source.</p>
          {sourceCards.some((source) => source.conversions || source.revenue) ? (
            <div className="mt-5 space-y-4">
              {sourceCards.map((source) => {
                const width = Math.max(4, Math.round((source.revenue / maxSourceRevenue) * 100));
                return (
                  <Link key={`bar:${source.name}`} href={`/events?source=${encodeURIComponent(source.name.toLowerCase())}`} className="block rounded-xl p-2 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:hover:bg-white/5">
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium">{source.name}</span>
                      <span className="text-slate-500">{money(source.revenue)}</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                      <div className="h-full rounded-full bg-purple-500" style={{ width: `${width}%` }} />
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No attributed channels yet" body="Attribution bars appear after conversions receive credit from a marketing source." actionHref="/journeys" actionLabel="View Customer Journeys" />
          )}
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <h2 className="text-xl font-semibold">Commission Summary</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Payable commission statuses from the commission ledger.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {["draft", "approved", "paid", "reversed"].map((status) => {
              const rows = commissions.filter((commission) => String(commission.status || "draft") === status);
              const total = rows.reduce((sum, row) => sum + Number(row.commission_amount || 0), 0);
              return (
                <div key={status} className="rounded-2xl border bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{status}</div>
                  <div className="mt-2 text-2xl font-semibold">{numberText(rows.length)}</div>
                  <div className="mt-1 text-sm text-slate-500">{money(total)} total</div>
                  <div className="mt-3 text-xs text-slate-400">Trend appears after repeated payout cycles.</div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <h2 className="text-xl font-semibold">Customer Funnel</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Browser and journey event stages from the current event sample.</p>
          {events.length ? (
            <div className="mt-5 grid gap-3 md:grid-cols-5">
              {FUNNEL_STAGES.map((stage, index) => {
                const count = events.filter((event) => stage.eventTypes.includes(event.event_type)).length;
                return (
                  <Link key={stage.label} href={stage.href} className="group relative rounded-2xl border bg-slate-50 p-4 text-center transition hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10 dark:bg-white/5">
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-black/20">
                      {index + 1}
                    </div>
                    <div className="mt-3 text-2xl font-semibold">{numberText(count)}</div>
                    <div className="mt-1 text-sm text-slate-500">{stage.label}</div>
                    {index < FUNNEL_STAGES.length - 1 ? <ArrowRight className="absolute -right-4 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-slate-300 md:block" /> : null}
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="No customer journeys yet"
              body="Install the browser SDK and visit your website to generate your first journey."
              actionHref="/setup"
              actionLabel="Install tracking"
            />
          )}
        </Card>
      </section>

      <section className="grid gap-4 rounded-3xl border bg-white p-5 shadow-sm dark:border-white/10 dark:bg-ink/85 md:grid-cols-3">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-1 h-5 w-5 text-emerald-500" />
          <div><div className="font-semibold">Health first</div><p className="mt-1 text-sm text-slate-500">Every card points to the next useful operational view.</p></div>
        </div>
        <div className="flex items-start gap-3">
          <LineChartIcon className="mt-1 h-5 w-5 text-blue-500" />
          <div><div className="font-semibold">Real data only</div><p className="mt-1 text-sm text-slate-500">Empty states appear when reporting APIs do not yet have enough history.</p></div>
        </div>
        <div className="flex items-start gap-3">
          <Sparkles className="mt-1 h-5 w-5 text-purple-500" />
          <div><div className="font-semibold">Built to expand</div><p className="mt-1 text-sm text-slate-500">Search, notifications, and workspace switching have room for future integrations.</p></div>
        </div>
      </section>
    </div>
  );
}
