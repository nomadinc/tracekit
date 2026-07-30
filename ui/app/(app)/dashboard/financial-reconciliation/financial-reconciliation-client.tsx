"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Banknote,
  ChevronDown,
  CheckCircle2,
  Clock3,
  Filter,
  ListChecks,
  Loader2,
  RotateCcw,
  Search,
  ShieldCheck,
  ShieldQuestion,
  XCircle,
} from "lucide-react";
import { sameOriginGetJson, sameOriginPostJson } from "@/lib/same-origin-api";
import {
  buildFinancialIssueCards,
  buildFinancialWorkQueue,
  deriveFinancialHealth,
  financialEventDisplayLabel,
  financialImpactRows,
  financialReconciliationQuery,
  netFinancialImpact,
  recentFinancialActivity,
  type FinancialIssueCategory,
  type FinancialIssueSeverity,
  type FinancialReconciliationItem,
  type FinancialReconciliationResponse,
  type FinancialWorkQueueItem,
} from "@/lib/financial-reconciliation";

const WORKSPACE_ID = "default";
const EVENT_TYPES = ["all", "refund", "chargeback", "chargeback_fee", "chargeback_reversal", "chargeback_fee_reversal"];
const STATES = ["all", "automatic", "manual", "ignored", "removed", "unmatched", "ambiguous"];
const CONFIDENCE = ["all", "exact", "high", "medium", "conflict", "none"];

function isoDateLocal(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function defaultRange() {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 29);
  return { from: isoDateLocal(from), to: isoDateLocal(today) };
}

function count(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.trunc(n).toLocaleString("en-US") : "-";
}

function money(value: number, currency: string | null | undefined, mixed?: boolean) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "-";
  if (mixed) return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} mixed`;
  if (!currency) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return n.toLocaleString("en-US", { style: "currency", currency, maximumFractionDigits: 2 });
}

function time(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "-";
  return d.toLocaleString();
}

function compact(value: unknown, fallback = "-") {
  const text = String(value || "").trim();
  if (!text) return fallback;
  if (text.length <= 42) return text;
  return `${text.slice(0, 22)}...${text.slice(-10)}`;
}

function label(value: string) {
  return value.replace(/_/g, " ");
}

function sentenceLabel(value: string | null | undefined, fallback = "Not reported") {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return label(text);
}

function displayAccount(value: string | null | undefined) {
  return String(value || "").trim() || "Unknown account";
}

function displayReference(value: string | null | undefined, fallback = "Not reported") {
  return String(value || "").trim() || fallback;
}

function eventSuffix(value: string) {
  return value ? value.slice(-8) : "unknown";
}

function orderReference(item: FinancialReconciliationItem | null | undefined) {
  return financialEventDisplayLabel(item).primary;
}

function stateTone(state: string) {
  if (state === "automatic" || state === "manual") return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100";
  if (state === "ignored" || state === "removed") return "border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200";
  if (state === "ambiguous") return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100";
  return "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100";
}

function confidenceTone(confidence: string) {
  if (confidence === "exact") return "text-emerald-700 dark:text-emerald-300";
  if (confidence === "high" || confidence === "medium") return "text-blue-700 dark:text-blue-300";
  if (confidence === "conflict") return "text-amber-700 dark:text-amber-300";
  return "text-slate-500";
}

function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `financial-reconciliation:${crypto.randomUUID()}`;
  }
  return `financial-reconciliation:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-lg border bg-white p-4 shadow-sm dark:border-white/10 dark:bg-ink/85 ${className}`}>{children}</section>;
}

function statusToneClasses(state: ReturnType<typeof deriveFinancialHealth>["state"]) {
  if (state === "healthy") return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100";
  if (state === "critical") return "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100";
  if (state === "partial") return "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100";
  if (state === "no_events") return "border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200";
  return "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100";
}

function severityTone(severity: FinancialIssueSeverity) {
  if (severity === "Critical") return "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100";
  if (severity === "Review") return "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100";
  return "border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200";
}

function HealthHero({ data, onReviewIssues, onOpenLedger }: { data: FinancialReconciliationResponse; onReviewIssues: () => void; onOpenLedger: () => void }) {
  const health = deriveFinancialHealth(data);
  const reviewed = health.reviewed.toLocaleString();
  const matched = health.matched.toLocaleString();
  const canReview = health.attention_items > 0 || health.state === "critical" || health.state === "review_needed";

  return (
    <section className="rounded-lg border bg-white p-5 shadow-sm dark:border-white/10 dark:bg-ink/90">
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${statusToneClasses(health.state)}`}>
              {health.state === "healthy" ? <CheckCircle2 className="h-4 w-4" /> : health.state === "critical" ? <XCircle className="h-4 w-4" /> : health.state === "partial" ? <Clock3 className="h-4 w-4" /> : <ShieldQuestion className="h-4 w-4" />}
              {health.label}
            </span>
            <span className="text-sm text-slate-500">Last updated {time(data.generated_at)}</span>
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight md:text-3xl">Can you trust this financial data?</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">{health.description}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onReviewIssues}
              disabled={!canReview}
              className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950"
            >
              <ListChecks className="h-4 w-4" />
              Review Issues
            </button>
            <button type="button" onClick={onOpenLedger} className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10 dark:hover:bg-white/5">
              Financial ledger
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Match health</div>
            <div className="mt-2 text-2xl font-semibold">{health.match_health_exact && health.match_health !== null ? `${health.match_health}%` : health.matched_label}</div>
            <p className="mt-1 text-xs text-slate-500">{matched} of {reviewed} events matched</p>
          </div>
          <div className="rounded-lg border bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Attention items</div>
            <div className="mt-2 text-2xl font-semibold">{count(health.attention_items)}</div>
            <p className="mt-1 text-xs text-slate-500">{health.issue_label}</p>
          </div>
          <div className="rounded-lg border bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Unmatched events</div>
            <div className="mt-2 text-2xl font-semibold">{count(data.summary.unmatched_events)}</div>
            <p className="mt-1 text-xs text-slate-500">Require deterministic order evidence</p>
          </div>
          <div className="rounded-lg border bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Events reviewed</div>
            <div className="mt-2 text-2xl font-semibold">{reviewed}</div>
            <p className="mt-1 text-xs text-slate-500">Refunds, chargebacks, fees, and reversals</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function IssueCards({ data, active, onSelect }: { data: FinancialReconciliationResponse; active: FinancialIssueCategory | "all"; onSelect: (category: FinancialIssueCategory | "all") => void }) {
  const cards = buildFinancialIssueCards(data);
  return (
    <section className="space-y-3" aria-labelledby="financial-attention-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="financial-attention-heading" className="text-lg font-semibold">What needs your attention?</h2>
          <p className="mt-1 text-sm text-slate-500">Diagnostics are review prompts. They do not change ledger totals.</p>
        </div>
        {active !== "all" ? (
          <button type="button" onClick={() => onSelect("all")} className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5">
            Show all issues
          </button>
        ) : null}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <button
            type="button"
            key={card.category}
            onClick={() => onSelect(card.category)}
            aria-label={`Show ${card.title}: ${card.count} ${card.severity.toLowerCase()} signal${card.count === 1 ? "" : "s"}`}
            className={`rounded-lg border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10 dark:bg-ink/85 ${active === card.category ? "ring-2 ring-slate-400" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{card.title}</h3>
                <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${severityTone(card.severity)}`}>{card.severity}</span>
              </div>
              <span className="text-2xl font-semibold">{count(card.count)}</span>
            </div>
            <p className="mt-3 text-sm leading-5 text-slate-600 dark:text-slate-300">{card.summary}</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">{card.why_it_matters}</p>
            <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-slate-800 dark:text-slate-100">
              {card.next_step}
              <ArrowRight className="h-4 w-4" />
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function Filters({ range, platform, account, eventType, state, confidence, needsReview }: {
  range: { from: string; to: string };
  platform: string;
  account: string;
  eventType: string;
  state: string;
  confidence: string;
  needsReview: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = React.useState({ ...range, platform, account, eventType, state, confidence, needsReview });

  React.useEffect(() => {
    setForm({ from: range.from, to: range.to, platform, account, eventType, state, confidence, needsReview });
  }, [account, confidence, eventType, needsReview, platform, range.from, range.to, state]);

  function apply() {
    const query = new URLSearchParams({ workspace_id: WORKSPACE_ID });
    if (form.from) query.set("from", form.from);
    if (form.to) query.set("to", form.to);
    if (form.platform) query.set("platform", form.platform);
    if (form.account) query.set("processor_account", form.account);
    if (form.eventType !== "all") query.set("event_type", form.eventType);
    if (form.state !== "all") query.set("reconciliation_state", form.state);
    if (form.confidence !== "all") query.set("confidence", form.confidence);
    if (form.needsReview) query.set("needs_review", "true");
    router.push(`/dashboard/financial-reconciliation?${query.toString()}`);
  }

  return (
    <Card>
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_auto]">
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">From</span>
          <input type="date" value={form.from} onChange={(e) => setForm((prev) => ({ ...prev, from: e.target.value }))} className="h-10 w-full rounded-md border bg-white px-3 text-sm dark:border-white/10 dark:bg-slate-950 dark:[color-scheme:dark]" />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">To</span>
          <input type="date" value={form.to} onChange={(e) => setForm((prev) => ({ ...prev, to: e.target.value }))} className="h-10 w-full rounded-md border bg-white px-3 text-sm dark:border-white/10 dark:bg-slate-950 dark:[color-scheme:dark]" />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Connector</span>
          <input value={form.platform} onChange={(e) => setForm((prev) => ({ ...prev, platform: e.target.value }))} placeholder="paypal, wowboost" className="h-10 w-full rounded-md border bg-white px-3 text-sm dark:border-white/10 dark:bg-slate-950" />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Event Type</span>
          <select value={form.eventType} onChange={(e) => setForm((prev) => ({ ...prev, eventType: e.target.value }))} className="h-10 w-full rounded-md border bg-white px-3 text-sm dark:border-white/10 dark:bg-slate-950">
            {EVENT_TYPES.map((item) => <option key={item} value={item}>{item === "all" ? "All events" : label(item)}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">State</span>
          <select value={form.state} onChange={(e) => setForm((prev) => ({ ...prev, state: e.target.value }))} className="h-10 w-full rounded-md border bg-white px-3 text-sm dark:border-white/10 dark:bg-slate-950">
            {STATES.map((item) => <option key={item} value={item}>{item === "all" ? "All states" : label(item)}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Confidence</span>
          <select value={form.confidence} onChange={(e) => setForm((prev) => ({ ...prev, confidence: e.target.value }))} className="h-10 w-full rounded-md border bg-white px-3 text-sm dark:border-white/10 dark:bg-slate-950">
            {CONFIDENCE.map((item) => <option key={item} value={item}>{item === "all" ? "All confidence" : label(item)}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <label className="flex h-10 items-center gap-2 whitespace-nowrap rounded-md border px-3 text-sm dark:border-white/10">
            <input type="checkbox" checked={form.needsReview} onChange={(e) => setForm((prev) => ({ ...prev, needsReview: e.target.checked }))} />
            Needs review
          </label>
          <button type="button" onClick={apply} className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-slate-400 dark:bg-white dark:text-slate-950">
            <Filter className="h-4 w-4" />
            Apply
          </button>
        </div>
      </div>
      <label className="mt-3 flex max-w-md items-center gap-2 rounded-md border bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
        <Search className="h-4 w-4 text-slate-400" />
        <input value={form.account} onChange={(e) => setForm((prev) => ({ ...prev, account: e.target.value }))} placeholder="Filter by processor account" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
      </label>
    </Card>
  );
}

function EventTable({ items, selectedId, onSelect }: { items: FinancialReconciliationItem[]; selectedId: string | null; onSelect: (item: FinancialReconciliationItem) => void }) {
  if (!items.length) {
    return (
      <Card>
        <div className="flex min-h-44 flex-col items-center justify-center text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          <h3 className="mt-3 font-semibold">No financial events found for this period.</h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">Adjust the date range or filters to inspect other events.</p>
        </div>
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b px-4 py-3 dark:border-white/10">
        <h2 className="font-semibold">Financial events</h2>
        <p className="mt-1 text-sm text-slate-500">Complete financial event history for the selected period.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[1180px] w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-white/10 dark:bg-white/5">
            <tr>
              {["Time", "Type", "Order / reference", "Connector", "Account", "Amount", "State", "Confidence", "Attribution", "Diagnostics"].map((heading) => (
                <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-white/10">
            {items.map((item) => (
              <tr key={item.id} className={`${selectedId === item.id ? "bg-slate-100 dark:bg-white/10" : "hover:bg-slate-50 dark:hover:bg-white/5"}`}>
                <td className="px-4 py-3 text-slate-500">{time(item.event_date)}</td>
                <td className="px-4 py-3 font-medium">{label(item.event_type)}</td>
                <td className="px-4 py-3">
                  <button type="button" onClick={() => onSelect(item)} className="text-left font-mono text-xs underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-slate-400">
                    {compact(orderReference(item), "Not reported")}
                  </button>
                  <div className="mt-1 text-xs text-slate-500">{financialEventDisplayLabel(item).secondary || `event ...${eventSuffix(item.id)}`}</div>
                </td>
                <td className="px-4 py-3">{item.connector}</td>
                <td className="px-4 py-3 font-mono text-xs">{compact(displayAccount(item.processor_account_id))}</td>
                <td className="px-4 py-3 font-semibold">{money(item.amount, item.currency)}</td>
                <td className="px-4 py-3">
                  <button type="button" onClick={() => onSelect(item)} className={`rounded-full border px-2 py-0.5 text-xs font-medium ${stateTone(item.match_status)}`}>{label(item.match_status)}</button>
                </td>
                <td className={`px-4 py-3 font-medium ${confidenceTone(item.confidence)}`}>{label(item.confidence)}</td>
                <td className="px-4 py-3">{item.attribution_present ? "Present" : "Missing affiliate/source"}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{item.needs_review ? compact(item.diagnostic_flags.join(", ") || item.reason_unmatched || "Needs review") : "Clear"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function WorkQueue({
  items,
  selectedId,
  activeIssue,
  healthState,
  onSelect,
}: {
  items: FinancialWorkQueueItem[];
  selectedId: string | null;
  activeIssue: FinancialIssueCategory | "all";
  healthState: ReturnType<typeof deriveFinancialHealth>["state"];
  onSelect: (entry: FinancialWorkQueueItem) => void;
}) {
  if (!items.length) {
    const filteredEmpty = activeIssue !== "all";
    const healthyEmpty = !filteredEmpty && (healthState === "healthy" || healthState === "no_events");
    return (
      <Card>
        <div className="flex min-h-36 flex-col items-center justify-center text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          <h3 className="mt-3 font-semibold">{healthyEmpty ? "No financial issues need review." : "No rows match this review queue."}</h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
            {healthyEmpty
              ? "All actionable items in this view have been reconciled or cleared."
              : filteredEmpty
                ? "Choose another issue type or open the Financial ledger to review all matching ledger events."
                : "The current diagnostics did not produce row-level work items for this result set."}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-0">
      <div className="border-b px-4 py-3 dark:border-white/10">
        <h2 className="font-semibold">Financial review queue</h2>
        <p className="mt-1 text-sm text-slate-500">Prioritized issues that need operator review or confirmation.</p>
      </div>
      <div className="divide-y dark:divide-white/10">
        {items.map((entry) => (
          <button
            type="button"
            key={entry.id}
            onClick={() => onSelect(entry)}
            aria-label={`${entry.severity} ${entry.title} for ${entry.order_reference}`}
            className={`grid w-full gap-3 px-4 py-4 text-left transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-slate-400 dark:hover:bg-white/5 md:grid-cols-[8rem_minmax(0,1.2fr)_minmax(0,1.4fr)_8rem_8rem] ${selectedId === entry.event_id ? "bg-slate-100 dark:bg-white/10" : ""}`}
          >
            <div>
              <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${severityTone(entry.severity)}`}>{entry.severity}</span>
              <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{sentenceLabel(entry.category)}</div>
            </div>
            <div>
              <div className="font-medium">{entry.title}</div>
              <div className="mt-1 font-mono text-xs text-slate-500">{compact(entry.order_reference, "Not reported")}</div>
            </div>
            <div className="text-sm leading-5 text-slate-600 dark:text-slate-300">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Why it matters</div>
              {entry.reason}
              <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-800 dark:text-slate-100">
                <span className="text-slate-500 dark:text-slate-400">Action:</span>
                {entry.next_step}
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Amount</div>
              <div className="mt-1 font-semibold">{entry.amount === null ? "Not applicable" : money(entry.amount, entry.currency)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date</div>
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{time(entry.event_date)}</div>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}

function FinancialImpact({ data }: { data: FinancialReconciliationResponse }) {
  const rows = financialImpactRows(data);
  const net = netFinancialImpact(data);
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Financial impact</h2>
          <p className="mt-1 text-sm text-slate-500">Ledger totals are separate from diagnostics. Diagnostics do not change these amounts.</p>
        </div>
        <div className="rounded-lg border bg-slate-50 px-4 py-3 text-right dark:border-white/10 dark:bg-white/5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{net.label}</div>
          <div className="mt-1 text-xl font-semibold">{net.mixed_currency ? "Multiple currencies" : money(net.amount || 0, net.currency)}</div>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {rows.map((row) => (
          <div key={row.type} className="rounded-lg border bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{row.label}</div>
              <Banknote className="h-4 w-4 text-slate-400" />
            </div>
            <div className="mt-2 text-lg font-semibold">{money(row.amount, row.currency, row.mixed_currency)}</div>
            <div className="mt-1 text-xs text-slate-500">{count(row.count)} event{row.count === 1 ? "" : "s"}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function RecentActivity({ data, onSelect }: { data: FinancialReconciliationResponse; onSelect: (eventId: string) => void }) {
  const stories = recentFinancialActivity(data, 6);
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Recent financial activity</h2>
          <p className="mt-1 text-sm text-slate-500">A compact lifecycle view from the current result set.</p>
        </div>
        <Activity className="h-5 w-5 text-slate-400" />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {stories.length ? stories.map((story) => (
          <button type="button" key={story.id} onClick={() => onSelect(story.event_id)} className="rounded-lg border bg-slate-50 p-3 text-left hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">{compact(story.title, "Not reported")}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {story.subtitle ? `${story.subtitle} · ` : ""}{time(story.event_date)} · {sentenceLabel(story.event_type)}
                </div>
              </div>
              <div className="text-right font-semibold">{money(story.amount, story.currency)}</div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className={`rounded-full border px-2 py-0.5 text-xs ${stateTone(story.status)}`}>{sentenceLabel(story.status)}</span>
              <span className="text-slate-500">{story.detail}</span>
            </div>
          </button>
        )) : (
          <div className="rounded-lg border bg-slate-50 p-4 text-sm text-slate-500 dark:border-white/10 dark:bg-white/5">No recent financial activity was found for this result set.</div>
        )}
      </div>
    </Card>
  );
}

function DetailPanel({
  item,
  data,
  reviewContext,
  onDecision,
}: {
  item: FinancialReconciliationItem | null;
  data: FinancialReconciliationResponse | null;
  reviewContext: FinancialWorkQueueItem | null;
  onDecision: () => void;
}) {
  const [reason, setReason] = React.useState("");
  const [matchedPlatformOrderId, setMatchedPlatformOrderId] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const manualEnabled = Boolean(data?.capabilities.manual_reconciliation);
  const disabledReason = data?.capabilities.reason || "Manual reconciliation is disabled.";

  React.useEffect(() => {
    setReason("");
    setMatchedPlatformOrderId(item?.suggested_order.candidate_order_id || "");
    setMessage(null);
  }, [item?.id, item?.suggested_order.candidate_order_id]);

  async function applyDecision(decisionType: "confirm_match" | "ignore" | "remove_match") {
    if (!item || !manualEnabled) return;
    try {
      setSaving(true);
      setMessage(null);
      const response = await sameOriginPostJson<any>("/api/financial-reconciliation/matches", {
        workspace_id: WORKSPACE_ID,
        financial_event_id: item.id,
        decision_type: decisionType,
        matched_platform_order_id: decisionType === "confirm_match" ? matchedPlatformOrderId : null,
        reason: decisionType === "confirm_match" ? (reason || "Operator confirmed deterministic match.") : reason,
        idempotency_key: newIdempotencyKey(),
        metadata: {
          ui: "financial_reconciliation_center",
          suggestion_method: item.suggested_order.method,
          confidence: item.confidence,
        },
      });
      if (!response.ok) throw new Error(response.message || response.error || "Decision failed.");
      setMessage("Decision recorded.");
      onDecision();
    } catch (e: any) {
      setMessage(e?.message || "Decision failed.");
    } finally {
      setSaving(false);
    }
  }

  if (!item) {
    return (
      <Card>
        <h2 className="font-semibold">Event detail</h2>
        <p className="mt-2 text-sm text-slate-500">Select a financial event to inspect deterministic references, reconciliation state, and operator controls.</p>
      </Card>
    );
  }

  const automaticExact = item.match_status === "automatic" && item.confidence === "exact";
  const confirmLabel = automaticExact ? "Confirm automatic match" : item.match_status === "manual" ? "Update manual match" : "Confirm match";
  const activeReviewContext = reviewContext?.event_id === item.id ? reviewContext : null;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{activeReviewContext ? "Review context" : "Financial event"}</h2>
          <p className="mt-1 text-sm text-slate-500">{activeReviewContext ? "This item came from the Financial Review Queue." : "Ledger event details and reconciliation evidence."}</p>
          <p className="mt-1 font-mono text-xs text-slate-500">{item.id}</p>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${stateTone(item.match_status)}`}>{label(item.match_status)}</span>
      </div>

      {activeReviewContext ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${severityTone(activeReviewContext.severity)}`}>{activeReviewContext.severity}</span>
            <span className="font-semibold">{sentenceLabel(activeReviewContext.category)}</span>
          </div>
          <p className="mt-2 leading-6">{activeReviewContext.reason}</p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide opacity-80">Recommended next step</p>
          <p className="mt-1">{activeReviewContext.next_step}</p>
        </div>
      ) : null}

      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        {[
          ["Type", label(item.event_type)],
          ["Amount", money(item.amount, item.currency)],
          ["Occurred", time(item.event_date)],
          ["Connector", displayReference(item.connector, "Unknown connector")],
          ["Processor account", displayAccount(item.processor_account_id)],
          ["Processor reference", displayReference(item.processor_reference)],
          ["Source event", displayReference(item.source_event_id)],
          ["Order / reference", orderReference(item)],
          ["Match method", item.suggested_order.method ? label(item.suggested_order.method) : automaticExact ? "ingestion match" : "Not reported"],
          ["Reconciliation", automaticExact ? "Automatically matched" : sentenceLabel(item.match_status)],
          ["Attribution", item.attribution_present ? "Present" : `Missing ${item.missing_attribution_fields.join(", ") || "affiliate/source evidence"}`],
        ].map(([term, value]) => (
          <div key={term} className="rounded-lg border bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{term}</dt>
            <dd className="mt-1 break-words text-sm">{value}</dd>
          </div>
        ))}
      </dl>

      {item.suggested_order.conflicts.length ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <div className="font-semibold">Deterministic conflict</div>
          <p className="mt-1 text-xs opacity-80">Multiple same-workspace orders matched the same reference. No suggestion was selected automatically.</p>
          <div className="mt-2 space-y-1 font-mono text-xs">
            {item.suggested_order.conflicts.map((conflict, index) => (
              <div key={`${conflict.platform_order_id}:${index}`}>{conflict.platform_order_id || conflict.order_id || "unknown order"} ({conflict.platform || "unknown platform"})</div>
            ))}
          </div>
        </div>
      ) : null}

      <section className="mt-5">
        <h3 className="font-semibold">Operator Decision</h3>
        {automaticExact ? (
          <p className="mt-2 text-sm leading-6 text-slate-500">
            This event is already automatically matched with exact deterministic evidence. Confirming it records an operator decision; it does not change the immutable ledger event.
          </p>
        ) : item.match_status === "manual" ? (
          <p className="mt-2 text-sm leading-6 text-slate-500">A manual decision is active. You can update the matched order or remove the manual match with a reason.</p>
        ) : (
          <p className="mt-2 text-sm leading-6 text-slate-500">Use manual controls only when deterministic evidence is clear enough to record an operator decision.</p>
        )}
        {!manualEnabled ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
            Manual controls are disabled. {disabledReason}
          </div>
        ) : null}
        <div className="mt-3 space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Matched platform order ID</span>
            <input disabled={!manualEnabled || saving} value={matchedPlatformOrderId} onChange={(e) => setMatchedPlatformOrderId(e.target.value)} placeholder="platform order ID" className="h-10 w-full rounded-md border bg-white px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-slate-950" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reason</span>
            <textarea disabled={!manualEnabled || saving} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Required for ignore/remove; recommended for confirmed matches." className="w-full rounded-md border bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-slate-950" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!manualEnabled || saving || !matchedPlatformOrderId.trim()} onClick={() => applyDecision("confirm_match")} className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950">
              <CheckCircle2 className="h-4 w-4" />
              {confirmLabel}
            </button>
            <button type="button" disabled={!manualEnabled || saving || !reason.trim()} onClick={() => applyDecision("ignore")} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10">
              <ShieldCheck className="h-4 w-4" />
              Ignore
            </button>
            <button type="button" disabled={!manualEnabled || saving || !reason.trim()} onClick={() => applyDecision("remove_match")} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10">
              <RotateCcw className="h-4 w-4" />
              Remove manual match
            </button>
          </div>
          {message ? <p className="text-sm text-slate-500">{message}</p> : null}
        </div>
      </section>
    </Card>
  );
}

function History({ data }: { data: FinancialReconciliationResponse }) {
  return (
    <Card>
      <h2 className="font-semibold">Decision History</h2>
      <div className="mt-3 divide-y rounded-lg border dark:divide-white/10 dark:border-white/10">
        {data.history.length ? data.history.map((entry) => (
          <div key={entry.id} className="grid gap-2 px-3 py-3 text-sm md:grid-cols-[1fr_8rem_12rem_1fr]">
            <div>
              <div className="font-mono text-xs">{entry.financial_event_id}</div>
              <div className="mt-1 text-xs text-slate-500">{time(entry.timestamp)}</div>
            </div>
            <div><span className={`rounded-full border px-2 py-0.5 text-xs ${stateTone(entry.new_state)}`}>{label(entry.new_state)}</span></div>
            <div className="font-mono text-xs text-slate-500">{compact(entry.matched_order)}</div>
            <div className="text-xs text-slate-500">{entry.reason || "No reason recorded."}</div>
          </div>
        )) : (
          <div className="px-3 py-4 text-sm text-slate-500">No manual reconciliation decisions have been recorded for this result set.</div>
        )}
      </div>
    </Card>
  );
}

export default function FinancialReconciliationClient() {
  const searchParams = useSearchParams();
  const fallback = defaultRange();
  const range = {
    from: searchParams.get("from") || fallback.from,
    to: searchParams.get("to") || fallback.to,
  };
  const platform = searchParams.get("platform") || "";
  const account = searchParams.get("processor_account") || "";
  const eventType = searchParams.get("event_type") || "all";
  const state = searchParams.get("reconciliation_state") || "all";
  const confidence = searchParams.get("confidence") || "all";
  const needsReview = searchParams.get("needs_review") === "true";
  const [data, setData] = React.useState<FinancialReconciliationResponse | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);
  const [activeIssue, setActiveIssue] = React.useState<FinancialIssueCategory | "all">("all");
  const hasAdvancedFilters = Boolean(platform || account || eventType !== "all" || state !== "all" || confidence !== "all" || needsReview);
  const [explorerOpen, setExplorerOpen] = React.useState(hasAdvancedFilters);
  const [reviewContext, setReviewContext] = React.useState<FinancialWorkQueueItem | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const query = financialReconciliationQuery({
      workspace_id: WORKSPACE_ID,
      from: range.from,
      to: range.to,
      platform,
      processor_account: account,
      event_type: eventType === "all" ? null : eventType,
      reconciliation_state: state === "all" ? null : state,
      confidence: confidence === "all" ? null : confidence,
      needs_review: needsReview,
    });

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const response = await sameOriginGetJson<FinancialReconciliationResponse>(query);
        if (!cancelled) {
          setData(response);
          setSelected((prev) => prev && response.items.some((item) => item.id === prev) ? prev : response.items[0]?.id || null);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Financial Health is unavailable.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [account, confidence, eventType, needsReview, platform, range.from, range.to, reloadToken, state]);

  const selectedItem = data?.items.find((item) => item.id === selected) || data?.items[0] || null;
  const workQueue = data ? buildFinancialWorkQueue(data, activeIssue) : [];
  const health = data ? deriveFinancialHealth(data) : null;

  React.useEffect(() => {
    if (hasAdvancedFilters) setExplorerOpen(true);
  }, [hasAdvancedFilters]);

  function reviewIssues(category: FinancialIssueCategory | "all" = "all") {
    setActiveIssue(category);
    window.requestAnimationFrame(() => {
      const queue = document.getElementById("work-queue");
      queue?.scrollIntoView({ behavior: "smooth", block: "start" });
      queue?.focus({ preventScroll: true });
    });
  }

  function openLedger() {
    setExplorerOpen(true);
    setReviewContext(null);
    window.requestAnimationFrame(() => {
      const ledger = document.getElementById("financial-ledger");
      ledger?.scrollIntoView({ behavior: "smooth", block: "start" });
      ledger?.focus({ preventScroll: true });
    });
  }

  function selectEventId(eventId: string | null | undefined) {
    if (!eventId) return;
    const item = data?.items.find((candidate) => candidate.id === eventId);
    if (item) setSelected(item.id);
  }

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">Revenue Operations</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Financial Health</h1>
          <p className="mt-2 max-w-3xl text-slate-600 dark:text-slate-300">
            See whether your refund, chargeback, fee, and reversal data is trustworthy and what needs attention.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/financial-import-monitor" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5">Import Monitor</Link>
          <Link href="/operations" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5">Work Items</Link>
        </div>
      </div>

      {loading ? (
        <Card>
          <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading financial health...</div>
        </Card>
      ) : error ? (
        <Card>
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-500" />
            <div>
              <h2 className="font-semibold">Financial Health is unavailable</h2>
              <p className="mt-1 text-sm text-slate-500">{error}</p>
              <p className="mt-2 text-xs text-slate-500">This page uses the authenticated server proxy <code>/api/financial-reconciliation</code>.</p>
            </div>
          </div>
        </Card>
      ) : data ? (
        <>
          {!data.capabilities.manual_reconciliation ? (
            <Card className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5" />
                <div>
                  <h2 className="font-semibold">Manual reconciliation is read-only</h2>
                  <p className="mt-1 text-sm opacity-85">{data.capabilities.reason || "Migration 036 has not been applied."}</p>
                </div>
              </div>
            </Card>
          ) : null}
          <HealthHero data={data} onReviewIssues={() => reviewIssues("all")} onOpenLedger={openLedger} />
          {data.partial ? (
            <Card className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
              <div className="flex items-start gap-3">
                <Clock3 className="mt-0.5 h-5 w-5" />
                <div>
                  <h2 className="font-semibold">Partial result set</h2>
                  <p className="mt-1 text-sm opacity-85">{data.partial_reason}</p>
                  {data.partial_sections.length ? <p className="mt-1 text-xs opacity-75">Affected sections: {data.partial_sections.join(", ")}. Match rate is hidden until the result set is exact.</p> : null}
                </div>
              </div>
            </Card>
          ) : null}
          <IssueCards data={data} active={activeIssue} onSelect={(category) => reviewIssues(category)} />
          <section id="work-queue" tabIndex={-1} className="grid scroll-mt-24 gap-6 focus:outline-none 2xl:grid-cols-[minmax(0,1.35fr)_minmax(420px,0.65fr)]">
            <WorkQueue
              items={workQueue}
              selectedId={selected}
              activeIssue={activeIssue}
              healthState={health?.state || "no_events"}
              onSelect={(entry) => {
                selectEventId(entry.event_id);
                setReviewContext(entry);
              }}
            />
            {workQueue.length ? <DetailPanel item={selectedItem} data={data} reviewContext={reviewContext} onDecision={() => setReloadToken((prev) => prev + 1)} /> : null}
          </section>
          <FinancialImpact data={data} />
          <RecentActivity data={data} onSelect={(eventId) => {
            selectEventId(eventId);
            setExplorerOpen(true);
            setReviewContext(null);
          }} />
          <section id="financial-ledger" tabIndex={-1} className="scroll-mt-24 space-y-4 focus:outline-none">
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Financial ledger</h2>
                  <p className="mt-1 text-sm text-slate-500">Search and inspect every refund, chargeback, fee, and reversal event.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setExplorerOpen((prev) => !prev)}
                  aria-expanded={explorerOpen}
                  aria-controls="financial-ledger-filters-panel"
                  className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10 dark:hover:bg-white/5"
                >
                  {explorerOpen ? "Hide advanced filters" : "Show advanced filters"}
                  <ChevronDown className={`h-4 w-4 transition ${explorerOpen ? "rotate-180" : ""}`} />
                </button>
              </div>
            </Card>
            {explorerOpen ? (
              <div id="financial-ledger-filters-panel" className="contents">
                <Filters range={range} platform={platform} account={account} eventType={eventType} state={state} confidence={confidence} needsReview={needsReview} />
                <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.4fr)_minmax(420px,0.8fr)]">
                  <EventTable items={data.items} selectedId={selected} onSelect={(item) => {
                    setSelected(item.id);
                    setReviewContext(null);
                  }} />
                  <DetailPanel item={selectedItem} data={data} reviewContext={null} onDecision={() => setReloadToken((prev) => prev + 1)} />
                </div>
                <History data={data} />
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </main>
  );
}
