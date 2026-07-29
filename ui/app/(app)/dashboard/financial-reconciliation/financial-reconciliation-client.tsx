"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileWarning,
  Filter,
  GitBranch,
  Loader2,
  RotateCcw,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { sameOriginGetJson, sameOriginPostJson } from "@/lib/same-origin-api";
import {
  financialReconciliationQuery,
  type FinancialReconciliationItem,
  type FinancialReconciliationResponse,
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

function SummaryCards({ data }: { data: FinancialReconciliationResponse }) {
  const cards = [
    ["Events reviewed", data.summary.financial_events_reviewed, ShieldCheck],
    ["Matched", data.summary.matched_events, CheckCircle2],
    ["Unmatched", data.summary.unmatched_events, XCircle],
    ["Needs review", data.summary.needs_review, AlertTriangle],
    ["Double debit", data.summary.double_debit_candidates, FileWarning],
    ["Broken chains", data.summary.broken_chains, GitBranch],
    ["Missing attribution", data.summary.missing_attribution, Search],
  ];
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
      {cards.map(([title, value, Icon]: any) => (
        <Card key={title}>
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</div>
            <Icon className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">{count(value)}</div>
        </Card>
      ))}
    </section>
  );
}

function TotalsByType({ data }: { data: FinancialReconciliationResponse }) {
  return (
    <Card>
      <h2 className="font-semibold">Financial Event Totals</h2>
      <div className="mt-3 grid gap-2 md:grid-cols-5">
        {Object.entries(data.summary.totals_by_type).map(([type, total]) => (
          <div key={type} className="rounded-lg border bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label(type)}</div>
            <div className="mt-2 text-lg font-semibold">{money(total.amount, total.currency, total.mixed_currency)}</div>
            <div className="mt-1 text-xs text-slate-500">{count(total.count)} events</div>
          </div>
        ))}
      </div>
    </Card>
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
          <h3 className="mt-3 font-semibold">No financial events need review</h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">Refund, chargeback, fee, and reversal events will appear here when they match the selected filters.</p>
        </div>
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="min-w-[1180px] w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-white/10 dark:bg-white/5">
            <tr>
              {["Time", "Type", "Connector", "Account", "Amount", "State", "Confidence", "Suggested Order", "Attribution", "Diagnostics"].map((heading) => (
                <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-white/10">
            {items.map((item) => (
              <tr key={item.id} className={`${selectedId === item.id ? "bg-slate-100 dark:bg-white/10" : "hover:bg-slate-50 dark:hover:bg-white/5"}`}>
                <td className="px-4 py-3 text-slate-500">{time(item.event_date)}</td>
                <td className="px-4 py-3 font-medium">{label(item.event_type)}</td>
                <td className="px-4 py-3">{item.connector}</td>
                <td className="px-4 py-3 font-mono text-xs">{compact(item.processor_account_id)}</td>
                <td className="px-4 py-3 font-semibold">{money(item.amount, item.currency)}</td>
                <td className="px-4 py-3">
                  <button type="button" onClick={() => onSelect(item)} className={`rounded-full border px-2 py-0.5 text-xs font-medium ${stateTone(item.match_status)}`}>{label(item.match_status)}</button>
                </td>
                <td className={`px-4 py-3 font-medium ${confidenceTone(item.confidence)}`}>{label(item.confidence)}</td>
                <td className="px-4 py-3 font-mono text-xs">{compact(item.suggested_order.public_order_label || item.suggested_order.candidate_order_id)}</td>
                <td className="px-4 py-3">{item.attribution_present ? "Present" : "Missing"}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{item.needs_review ? compact(item.diagnostic_flags.join(", ") || item.reason_unmatched || "Needs review") : "Clear"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Diagnostics({ data }: { data: FinancialReconciliationResponse }) {
  const sections = [
    ["Missing attribution", data.diagnostics.missing_attribution.length, "Matched events without affiliate/source evidence."],
    ["Double debit candidates", data.diagnostics.double_debit.length, `Refund principal and chargeback principal on the same deterministic order within ${data.config.double_debit_window_days} days.`],
    ["Duplicate diagnostics", data.diagnostics.duplicates.length, "Stored duplicate evidence, identical duplicate ledger evidence, or conflicting duplicate evidence."],
    ["Broken chains", data.diagnostics.broken_chains.length, "Fees, reversals, mixed currencies, or unmatched financial events that need chain review."],
  ];
  return (
    <Card>
      <h2 className="font-semibold">Diagnostics</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {sections.map(([title, value, description]: any) => (
          <div key={title} className="rounded-lg border bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">{title}</h3>
              <span className="text-lg font-semibold">{count(value)}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">{description}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function DetailPanel({ item, data, onDecision }: { item: FinancialReconciliationItem | null; data: FinancialReconciliationResponse | null; onDecision: () => void }) {
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
        <h2 className="font-semibold">Event Detail</h2>
        <p className="mt-2 text-sm text-slate-500">Select a financial event to inspect deterministic references, reconciliation state, and operator controls.</p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{label(item.event_type)}</h2>
          <p className="mt-1 font-mono text-xs text-slate-500">{item.id}</p>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${stateTone(item.match_status)}`}>{label(item.match_status)}</span>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        {[
          ["Amount", money(item.amount, item.currency)],
          ["Occurred", time(item.event_date)],
          ["Connector", item.connector],
          ["Processor account", item.processor_account_id || "-"],
          ["Processor reference", item.processor_reference || "-"],
          ["Source event", item.source_event_id || "-"],
          ["Suggested order", item.suggested_order.public_order_label || "-"],
          ["Match method", item.suggested_order.method ? label(item.suggested_order.method) : "-"],
          ["Automatic match present", item.automatic_match_present ? "Yes" : "No"],
          ["Attribution", item.attribution_present ? "Present" : `Missing ${item.missing_attribution_fields.join(", ") || "evidence"}`],
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
              Confirm match
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
        if (!cancelled) setError(e?.message || "Financial Reconciliation Center is unavailable.");
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

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">Revenue Operations</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Financial Reconciliation Center</h1>
          <p className="mt-2 max-w-3xl text-slate-600 dark:text-slate-300">
            Review refund, chargeback, fee, and reversal ledger events against deterministic order evidence without changing immutable financial events.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/financial-import-monitor" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5">Import Monitor</Link>
          <Link href="/operations" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5">Work Items</Link>
        </div>
      </div>

      <Filters range={range} platform={platform} account={account} eventType={eventType} state={state} confidence={confidence} needsReview={needsReview} />

      {loading ? (
        <Card>
          <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading financial reconciliation diagnostics...</div>
        </Card>
      ) : error ? (
        <Card>
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-500" />
            <div>
              <h2 className="font-semibold">Financial Reconciliation Center is unavailable</h2>
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
          <SummaryCards data={data} />
          <TotalsByType data={data} />
          <Diagnostics data={data} />
          <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.4fr)_minmax(420px,0.8fr)]">
            <EventTable items={data.items} selectedId={selected} onSelect={(item) => setSelected(item.id)} />
            <DetailPanel item={selectedItem} data={data} onDecision={() => setReloadToken((prev) => prev + 1)} />
          </div>
          <History data={data} />
        </>
      ) : null}
    </main>
  );
}
