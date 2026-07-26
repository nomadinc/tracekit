"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CircleDollarSign,
  ClipboardList,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { EntityLink } from "@/components/shared/entity-link";
import {
  HOME_WINDOWS,
  formatHomeMoney,
  formatHomeNumber,
  formatHomePercent,
  homeQuery,
  homeTimeAgo,
  type HomeSummaryResponse,
  type HomeWindow,
  type HomeActivity,
} from "@/lib/home";
import type { InvestigationTarget } from "@/lib/entities";
import { LIVE_WORKSPACE_UPDATE_EVENT, type WorkspaceUpdate } from "@/lib/live";
import {
  WORK_ITEM_CATEGORY_LABELS,
  workItemPriorityLabel,
  workItemStatusLabel,
  workItemTimeAgo,
  type WorkItem,
} from "@/lib/work-items";

const WORKSPACE_ID = "default";

function cardClass(extra = "") {
  return `rounded-xl border bg-white p-5 shadow-sm dark:border-white/10 dark:bg-ink/85 ${extra}`;
}

function toneClass(tone: string) {
  if (tone === "critical" || tone === "urgent") return "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100";
  if (tone === "warning" || tone === "high") return "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-100";
  if (tone === "success" || tone === "healthy") return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100";
  if (tone === "info") return "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100";
  return "border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200";
}

function metricHref(key: string) {
  if (key === "open") return "/operations?status=open,acknowledged,in_progress";
  if (key === "urgent") return "/operations?priority=urgent&status=open,acknowledged,in_progress";
  if (key === "unassigned") return "/operations?assigned_to=unassigned&status=open,acknowledged,in_progress";
  if (key === "resolved_today") return "/operations?status=resolved&resolved_period=today";
  return "/operations";
}

function customerName(customer: any) {
  return String(customer?.customer?.display_name || customer?.primary_identifier?.value || customer?.customer?.id || "Unknown customer");
}

function customerId(customer: any) {
  return String(customer?.customer?.id || "");
}

function customerLatest(customer: any) {
  if (customer?.has_purchase) return "Purchased";
  if (customer?.has_attribution) return "Attributed";
  if (customer?.has_commission) return "Commissioned";
  return "Recent activity";
}

function activityTarget(activity: HomeActivity): InvestigationTarget | null {
  if (activity.work_item_id) return { type: "work_item", id: activity.work_item_id, label: activity.title, query: { workspace_id: WORKSPACE_ID } };
  if (activity.order_id) return { type: "order", id: activity.order_id, label: activity.title, query: { workspace_id: WORKSPACE_ID } };
  if (activity.person_id) return { type: "customer", id: activity.person_id, label: activity.title, query: { workspace_id: WORKSPACE_ID } };
  return null;
}

function SectionHeader({ title, body, href, action }: { title: string; body?: string; href?: string; action?: string }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {body ? <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{body}</p> : null}
      </div>
      {href && action ? (
        <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium hover:underline">
          {action}
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}

function EmptyState({ title, body, href, action }: { title: string; body: string; href?: string; action?: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-slate-50 p-5 text-sm dark:border-white/10 dark:bg-white/5">
      <div className="font-medium">{title}</div>
      <p className="mt-2 leading-6 text-slate-500 dark:text-slate-400">{body}</p>
      {href && action ? (
        <Link href={href} className="mt-4 inline-flex items-center gap-2 rounded-lg border px-3 py-2 font-medium hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 dark:hover:bg-white/10">
          {action}
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}

function HomeHeader({
  summary,
  windowKey,
  loading,
  onWindowChange,
  onRefresh,
}: {
  summary: HomeSummaryResponse | null;
  windowKey: HomeWindow;
  loading: boolean;
  onWindowChange: (value: HomeWindow) => void;
  onRefresh: () => void;
}) {
  const workspaceName = summary?.onboarding?.workspace_name || "Default Workspace";
  const state = summary?.onboarding?.state || "active";
  const setupAware = state === "new_workspace" || state === "initializing";
  return (
    <section className={cardClass("overflow-hidden")}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <span>{workspaceName}</span>
            <span aria-hidden="true">/</span>
            <span>{summary?.window?.label || "Month to Date"}</span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            {setupAware ? "TraceKit is preparing this workspace." : "Good afternoon"}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            {setupAware
              ? `${Math.max(0, (summary?.onboarding?.total_steps || 0) - (summary?.onboarding?.completed_steps?.length || 0))} setup step(s) remain before attribution monitoring is fully active.`
              : "Here is what needs attention across your marketing operation right now."}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="inline-flex rounded-xl border bg-slate-50 p-1 dark:border-white/10 dark:bg-white/5">
            {HOME_WINDOWS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onWindowChange(item.key)}
                className={[
                  "rounded-lg px-3 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-slate-400",
                  windowKey === item.key ? "bg-white shadow-sm dark:bg-white/10" : "text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-white/10",
                ].join(" ")}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:hover:bg-white/10"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span>Updated {summary ? homeTimeAgo(summary.generated_at) : "not yet"}</span>
        {summary?.diagnostics?.section_errors?.length ? (
          <span className={`rounded-full border px-2 py-1 ${toneClass("warning")}`}>{summary.diagnostics.section_errors.length} partial section warning(s)</span>
        ) : null}
      </div>
    </section>
  );
}

function OperationalSummary({ summary }: { summary: HomeSummaryResponse }) {
  const metrics = summary.operations.metrics;
  const items = [
    { key: "open", label: "Open Work Items", value: metrics.open, tone: metrics.open ? "warning" : "success" },
    { key: "urgent", label: "Urgent", value: metrics.urgent, tone: metrics.urgent ? "urgent" : "neutral" },
    { key: "unassigned", label: "Unassigned", value: metrics.unassigned, tone: metrics.unassigned ? "warning" : "neutral" },
    { key: "resolved_today", label: "Resolved Today", value: metrics.resolved_today, tone: "success" },
    { key: "health", label: "Health Score", value: summary.health?.overall.score ?? null, tone: summary.health?.overall.status === "Critical" ? "critical" : summary.health?.overall.status === "Needs Attention" ? "warning" : "success" },
  ];
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.key === "health" ? "/notifications" : metricHref(item.key)}
          className={`rounded-xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10 dark:bg-ink/85`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-slate-500 dark:text-slate-400">{item.label}</div>
            <span className={`h-2.5 w-2.5 rounded-full border ${toneClass(item.tone)}`} aria-hidden="true" />
          </div>
          <div className="mt-3 text-3xl font-semibold tracking-tight">
            {item.value === null ? "N/A" : formatHomeNumber(item.value)}
          </div>
        </Link>
      ))}
    </section>
  );
}

function OnboardingCard({ summary }: { summary: HomeSummaryResponse }) {
  const onboarding = summary.onboarding;
  if (onboarding.state === "active" && onboarding.completed_at) return null;
  return (
    <section className={cardClass()}>
      <SectionHeader
        title="Finish setting up TraceKit"
        body={`${onboarding.completed_steps.length} of ${onboarding.total_steps} setup steps are complete.`}
        href="/setup"
        action="Continue setup"
      />
      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
        <div className="h-full rounded-full bg-slate-950 dark:bg-white" style={{ width: `${Math.max(4, onboarding.progress_percent)}%` }} />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {onboarding.next_steps.length ? onboarding.next_steps.map((step) => (
          <Link key={step.id} href={step.deep_link} className="rounded-xl border bg-slate-50 p-3 text-sm hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10">
            <div className="font-medium">{step.label}</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Pending setup step</div>
          </Link>
        )) : (
          <div className="rounded-xl border bg-slate-50 p-3 text-sm dark:border-white/10 dark:bg-white/5">TraceKit is validating the setup state.</div>
        )}
      </div>
    </section>
  );
}

function PriorityWorkItems({ items }: { items: WorkItem[] }) {
  return (
    <section className={cardClass()}>
      <SectionHeader title="Needs Attention" body="Highest-priority active Work Items from Operations." href="/operations?status=open,acknowledged,in_progress" action="Open Operations" />
      {items.length ? (
        <div className="space-y-3">
          {items.map((item) => (
            <EntityLink
              key={item.id}
              target={{ type: "work_item", id: item.id, label: item.title, query: { workspace_id: WORKSPACE_ID } }}
              href={`/operations?workspace_id=${encodeURIComponent(WORKSPACE_ID)}&inspect=${encodeURIComponent(`work_item:${item.id}`)}`}
              className="block rounded-xl border p-4 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10 dark:hover:bg-white/5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-1 text-xs font-medium ${toneClass(item.priority)}`}>{workItemPriorityLabel(item.priority)}</span>
                <span className="rounded-full border px-2 py-1 text-xs font-medium dark:border-white/10">{workItemStatusLabel(item.status)}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{WORK_ITEM_CATEGORY_LABELS[item.category] || item.category}</span>
              </div>
              <div className="mt-3 font-semibold">{item.title}</div>
              <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{item.summary}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                <span>Open for {workItemTimeAgo(item.first_detected_at)}</span>
                {item.related_order_id ? <span>Order {item.related_order_id}</span> : null}
                {item.related_connector_id ? <span>{item.related_connector_id}</span> : null}
              </div>
            </EntityLink>
          ))}
        </div>
      ) : (
        <EmptyState title="Operations are clear" body="No open Work Items currently require attention." href="/operations" action="View Operations" />
      )}
    </section>
  );
}

function WorkspaceHealth({ summary }: { summary: HomeSummaryResponse }) {
  if (!summary.health) {
    return (
      <section className={cardClass()}>
        <EmptyState title="Health is not available" body="Workspace Health will appear when the Health Engine response is available." href="/notifications" action="Open Notifications" />
      </section>
    );
  }
  return (
    <section className={cardClass()}>
      <SectionHeader title="Workspace Health" body="Lifecycle-aware checks from the Health Engine." href="/notifications" action="Open notifications" />
      <div className="flex items-center justify-between rounded-xl border bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
        <div>
          <div className="text-4xl font-semibold">{summary.health.overall.score}</div>
          <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{summary.health.overall.status}</div>
        </div>
        <ShieldCheck className="h-10 w-10 text-slate-400" />
      </div>
      <div className="mt-4 space-y-3">
        {summary.health.categories.map((category) => (
          <Link key={category.category} href={category.deep_link} className="block rounded-xl border p-3 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10 dark:hover:bg-white/5">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium">{category.label}</div>
              <span className={`rounded-full border px-2 py-0.5 text-xs ${toneClass(category.severity)}`}>{category.lifecycle_state.replace(/_/g, " ")}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{category.summary}</p>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {category.metric_value || "No metric"} · {category.work_item_count} related Work Item{category.work_item_count === 1 ? "" : "s"}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function RecentActivity({ summary }: { summary: HomeSummaryResponse }) {
  return (
    <section className={cardClass()}>
      <SectionHeader title="What's Happening" body="Business-level and operational events, deduped by source identifiers." href="/events" action="Open Event Explorer" />
      {summary.recent_activity.length ? (
        <div className="space-y-3">
          {summary.recent_activity.map((activity) => {
            const target = activityTarget(activity);
            const content = (
              <>
                <span className={`mt-1 flex h-9 w-9 items-center justify-center rounded-xl border ${toneClass(activity.tone)}`}>
                  {activity.type.includes("purchase") ? <CircleDollarSign className="h-4 w-4" /> : activity.type.includes("work_item") ? <ClipboardList className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{activity.title}</span>
                  <span className="mt-1 block text-sm leading-6 text-slate-500 dark:text-slate-400">{activity.summary}</span>
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{homeTimeAgo(activity.occurred_at)}</span>
              </>
            );
            const className = "grid grid-cols-[auto_1fr_auto] gap-3 rounded-xl border p-3 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10 dark:hover:bg-white/5";
            return target ? (
              <EntityLink key={activity.id} target={target} href={activity.deep_link} className={className}>
                {content}
              </EntityLink>
            ) : (
              <Link key={activity.id} href={activity.deep_link} className={className}>
                {content}
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState title="No recent business activity" body="Activity will appear after linked orders, attribution credits, commissions, or Work Item activity are stored." />
      )}
    </section>
  );
}

function RevenueAndAttribution({ summary }: { summary: HomeSummaryResponse }) {
  const currency = summary.revenue.currency || "USD";
  return (
    <div className="grid gap-4">
      <section className={cardClass()}>
        <SectionHeader title="Revenue Snapshot" body={`Selected window: ${summary.window.label}.`} href="/reports" action="Open Revenue" />
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
            <div className="text-xl font-semibold">{formatHomeMoney(summary.revenue.gross_revenue, currency)}</div>
            <div className="mt-1 text-xs text-slate-500">Gross revenue</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
            <div className="text-xl font-semibold">{formatHomeMoney(summary.revenue.net_revenue, currency)}</div>
            <div className="mt-1 text-xs text-slate-500">Net revenue</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
            <div className="text-xl font-semibold">{formatHomeMoney(summary.revenue.commission_generated, currency)}</div>
            <div className="mt-1 text-xs text-slate-500">Commission generated</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
            <div className="text-xl font-semibold">{formatHomeMoney(summary.revenue.refunded_revenue, currency)}</div>
            <div className="mt-1 text-xs text-slate-500">Refunded revenue</div>
          </div>
        </div>
      </section>
      <section className={cardClass()}>
        <SectionHeader title="Attribution" body={`Stored credits for ${summary.attribution.active_model || "selected model"}.`} href="/journeys" action="Open Marketing" />
        <div className="grid gap-3">
          <div className="rounded-xl border p-4 dark:border-white/10">
            <div className="text-3xl font-semibold">{formatHomePercent(summary.attribution.attribution_coverage)}</div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">Attribution coverage</div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
              <div className="font-semibold">{formatHomeNumber(summary.attribution.attributed_purchases)}</div>
              <div className="text-xs text-slate-500">Attributed purchases</div>
            </div>
            <Link href="/operations?category=attribution&status=open,acknowledged,in_progress" className="rounded-xl bg-slate-50 p-3 hover:bg-white dark:bg-white/5 dark:hover:bg-white/10">
              <div className="font-semibold">{formatHomeNumber(summary.attribution.needs_review_count || summary.attribution.unattributed_purchases)}</div>
              <div className="text-xs text-slate-500">Need review</div>
            </Link>
          </div>
          <div className="rounded-xl border p-3 text-sm dark:border-white/10">
            <div className="text-xs text-slate-500">Top affiliate</div>
            <div className="mt-1 font-medium">{summary.attribution.top_affiliate?.affiliate_id || "Not available"}</div>
            <div className="mt-1 text-xs text-slate-500">{summary.attribution.top_affiliate ? formatHomeMoney(summary.attribution.top_affiliate.credited_revenue, currency) : "Attribution results will appear after eligible journeys are processed."}</div>
          </div>
        </div>
      </section>
    </div>
  );
}

function RecentCustomers({ summary }: { summary: HomeSummaryResponse }) {
  return (
    <section className={cardClass()}>
      <SectionHeader title="Recent Customers" body="Bounded customer summaries from Customer Explorer." href="/customers" action="Open Customers" />
      {summary.recent_customers.length ? (
        <div className="space-y-2">
          {summary.recent_customers.map((customer) => {
            const id = customerId(customer);
            return (
              <EntityLink
                key={id || customerName(customer)}
                target={{ type: "customer", id, label: customerName(customer), query: { workspace_id: WORKSPACE_ID } }}
                href={id ? `/customers/${encodeURIComponent(id)}?workspace_id=${encodeURIComponent(WORKSPACE_ID)}` : "/customers"}
                mode={id ? "panel" : "page"}
                className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10 dark:hover:bg-white/5"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{customerName(customer)}</span>
                  <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{customerLatest(customer)} · {homeTimeAgo(customer.last_activity_at)}</span>
                </span>
                <span className="text-right">
                  <span className="block font-medium">{formatHomeMoney(customer.revenue, "USD")}</span>
                  <span className="text-xs text-slate-500">{customer.has_attribution ? "Attributed" : "Needs context"}</span>
                </span>
              </EntityLink>
            );
          })}
        </div>
      ) : (
        <EmptyState title="No recent customers" body="Customer summaries will appear after identified journeys or linked orders are available." href="/customers" action="Search customers" />
      )}
    </section>
  );
}

function IntegrationsAndActions({ summary }: { summary: HomeSummaryResponse }) {
  return (
    <div className="grid gap-4">
      <section className={cardClass()}>
        <SectionHeader title="Integrations & Tracking" body="Connected systems reported by Health and connector state." href="/settings/integrations" action="Manage" />
        {summary.integrations.length ? (
          <div className="space-y-2">
            {summary.integrations.map((integration) => (
              <Link key={integration.id} href={integration.deep_link} className="block rounded-xl border p-3 text-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10 dark:hover:bg-white/5">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{integration.name}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-xs ${toneClass(integration.severity)}`}>{integration.status.replace(/_/g, " ")}</span>
                </div>
                <div className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{integration.summary}</div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState title="No connected integrations" body="Connect a data source to begin importing orders and customer activity." href="/settings/integrations" action="Connect source" />
        )}
      </section>
      <section className={cardClass()}>
        <SectionHeader title="Quick Actions" body="Jump into existing TraceKit workflows." />
        <div className="grid gap-2">
          {summary.quick_actions.map((action) => (
            <Link key={action.href} href={action.href} className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm font-medium transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10 dark:hover:bg-white/5">
              <span>{action.label}</span>
              <ArrowRight className="h-4 w-4 text-slate-400" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

export function HomeLoading() {
  return (
    <div className="space-y-4">
      <div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-white/10" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-xl bg-slate-100 dark:bg-white/10" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.9fr)]">
        <div className="h-96 animate-pulse rounded-xl bg-slate-100 dark:bg-white/10" />
        <div className="h-96 animate-pulse rounded-xl bg-slate-100 dark:bg-white/10" />
      </div>
    </div>
  );
}

export default function HomeCommandCenter() {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const requestedWindow = (searchParams.get("window") || "month_to_date") as HomeWindow;
  const windowKey = HOME_WINDOWS.some((item) => item.key === requestedWindow) ? requestedWindow : "month_to_date";
  const [summary, setSummary] = React.useState<HomeSummaryResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshId, setRefreshId] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(homeQuery({ workspace_id: WORKSPACE_ID, window: windowKey }), {
          cache: "no-store",
          headers: { accept: "application/json" },
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || json?.ok === false) throw new Error(json?.message || json?.error || `Home API ${res.status}`);
        setSummary(json as HomeSummaryResponse);
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Failed to load Home.");
          setSummary(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const timer = window.setInterval(() => {
      setRefreshId((value) => value + 1);
    }, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [windowKey, refreshId]);

  React.useEffect(() => {
    function onWorkspaceUpdate(event: Event) {
      const update = (event as CustomEvent<WorkspaceUpdate>).detail;
      if (!update || update.workspaceId !== WORKSPACE_ID) return;
      if (
        update.type === "work_item.changed" ||
        update.type === "notification.created" ||
        update.type === "health.changed" ||
        update.type === "metric.changed" ||
        update.type === "activity.created" ||
        update.type === "activity.updated"
      ) {
        setRefreshId((value) => value + 1);
      }
    }
    window.addEventListener(LIVE_WORKSPACE_UPDATE_EVENT, onWorkspaceUpdate);
    return () => window.removeEventListener(LIVE_WORKSPACE_UPDATE_EVENT, onWorkspaceUpdate);
  }, []);

  function changeWindow(value: HomeWindow) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("window", value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  if (loading && !summary) return <HomeLoading />;

  if (error || !summary) {
    return (
      <div className={cardClass()}>
        <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl border ${toneClass("warning")}`}>
          <AlertTriangle className="h-5 w-5" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold">Home is temporarily unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{error || "The Home API did not return a usable response."}</p>
        <button type="button" onClick={() => setRefreshId((value) => value + 1)} className="mt-4 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:hover:bg-white/10">
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <HomeHeader
        summary={summary}
        windowKey={windowKey}
        loading={loading}
        onWindowChange={changeWindow}
        onRefresh={() => setRefreshId((value) => value + 1)}
      />
      <OperationalSummary summary={summary} />
      <OnboardingCard summary={summary} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.9fr)]">
        <div className="space-y-4">
          <PriorityWorkItems items={summary.priority_work_items} />
          <RecentActivity summary={summary} />
          <RecentCustomers summary={summary} />
        </div>
        <div className="space-y-4">
          <WorkspaceHealth summary={summary} />
          <RevenueAndAttribution summary={summary} />
          <IntegrationsAndActions summary={summary} />
        </div>
      </div>
    </div>
  );
}
