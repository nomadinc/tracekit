"use client";

import * as React from "react";
import {
  Activity,
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock3,
  DollarSign,
  Fingerprint,
  GitBranch,
  Link2,
  Monitor,
  MousePointerClick,
  Receipt,
  RotateCcw,
  ShoppingCart,
  Target,
  UserPlus,
} from "lucide-react";
import {
  customerStatusTone,
  eventCategoryLabel,
  formatCustomerDateRange,
  formatCustomerMoney,
  formatCustomerTime,
  redactCustomerEvidence,
  type CustomerBadgeTone,
} from "@/lib/customers";

export type ActivityFilter = "all" | "marketing" | "identity" | "commerce" | "attribution" | "commission" | "system";
export type TimelineViewMode = "story" | "technical";

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: CustomerBadgeTone }) {
  const cls = {
    good: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
    warn: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100",
    bad: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
    neutral: "border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200",
  }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export function Section({ title, icon: Icon, children, right }: { title: string; icon?: any; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-white p-5 shadow-sm dark:bg-ink/80">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          {Icon ? <Icon className="h-4 w-4 text-slate-500" /> : null}
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function DetailGrid({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  const populated = rows.filter(([, value]) => value !== null && value !== undefined && value !== "" && value !== "-");
  if (!populated.length) return <p className="text-sm text-slate-500">No details available.</p>;
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {populated.map(([label, value]) => (
        <div key={label} className="rounded-md border bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
          <dd className="mt-1 break-words text-sm">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function populatedEntries(value: Record<string, any> = {}) {
  return Object.entries(value).filter(([, nested]) => nested !== null && nested !== undefined && nested !== "");
}

function ActivityIcon({ activity }: { activity: any }) {
  const type = String(activity.activity_type || "").toLowerCase();
  if (activity.category === "marketing") return <MousePointerClick className="h-4 w-4" />;
  if (activity.category === "identity") return type.includes("attach") ? <Link2 className="h-4 w-4" /> : <Fingerprint className="h-4 w-4" />;
  if (activity.category === "commerce") return type.includes("refund") || type.includes("reversal") ? <RotateCcw className="h-4 w-4" /> : type.includes("checkout") ? <ShoppingCart className="h-4 w-4" /> : <Receipt className="h-4 w-4" />;
  if (activity.category === "attribution") return <Target className="h-4 w-4" />;
  if (activity.category === "commission") return <Banknote className="h-4 w-4" />;
  if (activity.category === "exception") return <AlertTriangle className="h-4 w-4" />;
  if (type.includes("lead")) return <UserPlus className="h-4 w-4" />;
  return <Activity className="h-4 w-4" />;
}

function categoryTone(category: string): CustomerBadgeTone {
  if (["attribution", "commission", "identity"].includes(category)) return "good";
  if (category === "exception") return "bad";
  if (category === "system") return "neutral";
  return "warn";
}

export function ActivityFilterBar({
  value,
  mode,
  onChange,
  onModeChange,
}: {
  value: ActivityFilter;
  mode: TimelineViewMode;
  onChange: (value: ActivityFilter) => void;
  onModeChange: (value: TimelineViewMode) => void;
}) {
  const filters: ActivityFilter[] = ["all", "marketing", "identity", "commerce", "attribution", "commission", "system"];
  return (
    <div className="flex flex-col gap-3 border-b pb-4 dark:border-white/10 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => (
          <button
            type="button"
            key={filter}
            onClick={() => onChange(filter)}
            className={`rounded-md border px-3 py-1.5 text-sm ${value === filter ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950" : "hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"}`}
          >
            {filter === "all" ? "All activity" : eventCategoryLabel(filter)}
          </button>
        ))}
      </div>
      <div className="inline-flex w-fit rounded-md border p-1 text-sm dark:border-white/10">
        {(["story", "technical"] as TimelineViewMode[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onModeChange(option)}
            className={`rounded px-3 py-1 ${mode === option ? "bg-slate-100 font-medium dark:bg-white/10" : "text-slate-500"}`}
          >
            {option === "story" ? "Story view" : "Technical view"}
          </button>
        ))}
      </div>
    </div>
  );
}

export function JourneyStoryHeader({ journey, summary }: { journey: any; summary: any }) {
  const metrics = [
    ["Events", summary?.events],
    ["Marketing", summary?.marketing_touchpoints],
    ["Purchases", summary?.purchases],
    ["Revenue", summary?.revenue],
    ["Commission", summary?.commission_total],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");
  return (
    <div className="rounded-lg border bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{formatCustomerDateRange(summary?.date_range?.from || journey?.started_at, summary?.date_range?.to || journey?.ended_at)}</h3>
            {summary?.status ? <Badge tone={customerStatusTone(summary.status)}>{summary.status}</Badge> : null}
          </div>
          {summary?.attributed_source ? (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {summary.attributed_source.affiliate_id ? `Affiliate ${summary.attributed_source.affiliate_id}` : summary.attributed_source.source || "Stored source"} attributed through {summary.attributed_source.model || "the active model"}.
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No attribution credit is recorded for this journey.</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:min-w-[520px]">
          {metrics.map(([label, value]) => (
            <div key={label} className="rounded-md border bg-white p-3 dark:border-white/10 dark:bg-ink/50">
              <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
              <div className="mt-1 font-medium">{String(value)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TechnicalEvidenceDrawer({ evidence }: { evidence: any }) {
  if (!evidence || (typeof evidence === "object" && !Object.keys(evidence).length)) {
    return <p className="mt-3 text-xs text-slate-500">Technical evidence was not retained for this event.</p>;
  }
  return (
    <details className="mt-3 rounded-md border bg-slate-50 p-3 text-xs dark:border-white/10 dark:bg-white/5">
      <summary className="cursor-pointer font-medium">Technical evidence</summary>
      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(redactCustomerEvidence(evidence), null, 2)}</pre>
    </details>
  );
}

function ActivityTimelineItem({ activity, highlighted, mode }: { activity: any; highlighted: boolean; mode: TimelineViewMode }) {
  const displayFields = populatedEntries(activity.display_fields || {});
  return (
    <li className="relative pl-10" data-related-order={activity.related_order_id || undefined}>
      <div className={`absolute left-0 top-1 z-10 flex h-8 w-8 items-center justify-center rounded-full border ${highlighted ? "border-amber-300 bg-amber-100 text-amber-800" : "border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-ink dark:text-slate-200"}`}>
        <ActivityIcon activity={activity} />
      </div>
      <div className={`rounded-lg border p-4 ${highlighted ? "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10" : "bg-white dark:border-white/10 dark:bg-ink/70"}`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="font-medium">{mode === "technical" ? eventCategoryLabel(activity.activity_type) : activity.title}</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{mode === "technical" ? activity.source_platform || "TraceKit" : activity.summary}</p>
            <p className="mt-1 text-xs text-slate-500">{formatCustomerTime(activity.occurred_at)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={categoryTone(activity.category)}>{eventCategoryLabel(activity.category)}</Badge>
            {activity.system_derived ? <Badge>System-derived</Badge> : null}
          </div>
        </div>
        {displayFields.length ? (
          <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {displayFields.map(([key, value]) => (
              <div key={key} className="rounded-md border bg-slate-50 p-2 dark:border-white/10 dark:bg-white/5">
                <dt className="text-[11px] uppercase tracking-wide text-slate-500">{eventCategoryLabel(key)}</dt>
                <dd className="mt-1 break-words text-sm">{String(value)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {activity.explanation && Object.keys(activity.explanation).length ? (
          <details className="mt-3 rounded-md border p-3 text-sm dark:border-white/10">
            <summary className="cursor-pointer font-medium">Explanation</summary>
            <div className="mt-3 space-y-2 text-slate-600 dark:text-slate-300">
              {populatedEntries(activity.explanation).map(([key, value]) => (
                <p key={key}><span className="font-medium text-slate-800 dark:text-slate-100">{eventCategoryLabel(key)}:</span> {typeof value === "object" ? JSON.stringify(redactCustomerEvidence(value)) : String(value)}</p>
              ))}
            </div>
          </details>
        ) : null}
        <TechnicalEvidenceDrawer evidence={activity.technical_evidence} />
      </div>
    </li>
  );
}

function groupActivitiesByDate(activities: any[]) {
  const groups = new Map<string, any[]>();
  for (const activity of activities) {
    const ms = Date.parse(String(activity.occurred_at || ""));
    const key = Number.isFinite(ms)
      ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(ms))
      : "Undated";
    const bucket = groups.get(key) || [];
    bucket.push(activity);
    groups.set(key, bucket);
  }
  return Array.from(groups.entries());
}

function groupActivitiesBySession(activities: any[]) {
  const groups: Array<{ session: string | null; rows: any[] }> = [];
  for (const activity of activities) {
    const session = activity.display_fields?.session ? String(activity.display_fields.session) : null;
    const last = groups[groups.length - 1];
    if (last && last.session === session) {
      last.rows.push(activity);
    } else {
      groups.push({ session, rows: [activity] });
    }
  }
  return groups;
}

export function NarrativeTimeline({
  activities,
  filter,
  mode,
  highlightedOrderId,
}: {
  activities: any[];
  filter: ActivityFilter;
  mode: TimelineViewMode;
  highlightedOrderId?: string | null;
}) {
  const filtered = activities.filter((activity) => filter === "all" || activity.category === filter);
  if (!filtered.length) {
    return <EmptyInvestigationState title="No activity in this view" body="This journey exists, but no timeline events are available for the selected filter." />;
  }
  return (
    <div className="space-y-6">
      {groupActivitiesByDate(filtered).map(([date, rows]) => (
        <div key={date}>
          <div className="mb-3 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{date}</h3>
            <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
          </div>
          <div className="space-y-4">
            {groupActivitiesBySession(rows).map((group, index) => (
              <div key={`${group.session || "sessionless"}:${index}`} className="space-y-3">
                {group.session ? <div className="ml-10 text-xs font-medium text-slate-500">Session {group.session}</div> : null}
                <ol className="relative space-y-4 before:absolute before:left-4 before:top-3 before:h-[calc(100%-1.5rem)] before:w-px before:bg-slate-200 dark:before:bg-white/10">
                  {group.rows.map((activity) => (
                    <ActivityTimelineItem
                      key={activity.id}
                      activity={activity}
                      mode={mode}
                      highlighted={Boolean(highlightedOrderId && activity.related_order_id === highlightedOrderId)}
                    />
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function IdentityExplanationCard({ explanation }: { explanation: any }) {
  const identifiers = explanation?.linked_identifiers || [];
  return (
    <Section title="Identity Resolution" icon={Fingerprint}>
      <div className="space-y-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Primary person</div>
          <div className="mt-1 font-medium">{explanation?.primary_person?.display_name || explanation?.primary_person?.id || "Unknown person"}</div>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">{explanation?.why_linked || "Linked by the TraceKit Identity Engine."}</p>
        <div className="space-y-2">
          {identifiers.length ? identifiers.slice(0, 8).map((identifier: any) => (
            <div key={identifier.id || `${identifier.type}:${identifier.normalized_value}`} className="rounded-md border p-3 dark:border-white/10">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                <div>
                  <div className="font-medium">{identifier.normalized_value || identifier.raw_value}</div>
                  <div className="text-xs text-slate-500">{eventCategoryLabel(identifier.type)} · First seen {formatCustomerTime(identifier.first_seen_at)}</div>
                </div>
              </div>
            </div>
          )) : <EmptyInvestigationState title="Identity evidence is limited" body="This customer has limited identity evidence." />}
        </div>
      </div>
    </Section>
  );
}

export function AttributionExplanationCard({ explanations }: { explanations: any[] }) {
  return (
    <Section title="Attribution Result" icon={Target}>
      <div className="space-y-4">
        {explanations?.length ? explanations.map((group) => (
          <div key={group.conversion_event_id || "conversion"} className="rounded-md border p-3 dark:border-white/10">
            <div className="space-y-3">
              {group.credits?.map((credit: any) => (
                <div key={credit.id} className="rounded-md bg-slate-50 p-3 dark:bg-white/5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{credit.winner || "Stored attribution credit"}</div>
                      <div className="text-xs text-slate-500">{eventCategoryLabel(credit.model)} · {credit.credit_percent || "0"}%</div>
                    </div>
                    <Badge tone="good">{formatCustomerMoney(credit.credit_amount, credit.currency)} credited</Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    {credit.reason_is_stored ? credit.reason : "Attribution Engine result."}
                  </p>
                  {credit.touchpoint ? (
                    <div className="mt-2 text-xs text-slate-500">Winning touchpoint: {formatCustomerTime(credit.touchpoint.occurred_at)}</div>
                  ) : null}
                </div>
              ))}
              {!group.exclusion_evidence_available ? <p className="text-xs text-slate-500">{group.missing_exclusion_evidence_message}</p> : null}
            </div>
          </div>
        )) : <EmptyInvestigationState title="No attribution" body="No attribution credit was created for this conversion." />}
      </div>
    </Section>
  );
}

export function CommissionExplanationCard({ explanations }: { explanations: any[] }) {
  return (
    <Section title="Commission" icon={DollarSign}>
      <div className="space-y-3">
        {explanations?.length ? explanations.map((commission) => (
          <div key={commission.id} className="rounded-md border p-3 dark:border-white/10">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">{formatCustomerMoney(commission.commission_amount, commission.currency)}</div>
                <div className="text-xs text-slate-500">Affiliate {commission.affiliate || "unknown"}</div>
              </div>
              <Badge tone={customerStatusTone(commission.status)}>{commission.status || "stored"}</Badge>
            </div>
            {commission.formula ? <p className="mt-3 text-sm">{commission.formula}</p> : <p className="mt-3 text-sm text-slate-500">Stored calculation basis is available only in technical evidence.</p>}
          </div>
        )) : <EmptyInvestigationState title="No commission" body="No commission is associated with this conversion." />}
      </div>
    </Section>
  );
}

export function OrderInvestigationPanel({ order, attribution, commissions }: { order: any | null; attribution: any[]; commissions: any[] }) {
  if (!order) return null;
  const relatedAttribution = attribution.filter((credit) => !order.platform_order_id || credit.conversion_event_id === order.related_conversion_id || credit.touchpoint_event_id === order.related_touchpoint_id);
  return (
    <Section title="Selected Order" icon={Receipt}>
      <div className="space-y-3">
        <DetailGrid rows={[
          ["Order", order.order_id || order.platform_order_id],
          ["Platform", order.platform],
          ["Status", order.status],
          ["Amount", formatCustomerMoney(order.amount, order.currency)],
          ["Transaction", order.transaction_id],
          ["Affiliate", order.affiliate_id],
        ]} />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border p-3 dark:border-white/10">
            <div className="font-medium">Associated attribution</div>
            <p className="mt-1 text-sm text-slate-500">{relatedAttribution.length || attribution.length} stored credit records available.</p>
          </div>
          <div className="rounded-md border p-3 dark:border-white/10">
            <div className="font-medium">Related commissions</div>
            <p className="mt-1 text-sm text-slate-500">{commissions.length} stored commission records available.</p>
          </div>
        </div>
      </div>
    </Section>
  );
}

export function EmptyInvestigationState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center dark:border-white/10">
      <Monitor className="mx-auto h-6 w-6 text-slate-400" />
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{body}</p>
    </div>
  );
}
