"use client";

import * as React from "react";
import { FileClock, RefreshCw, Search, ShieldAlert, UserRound } from "lucide-react";
import { AccessBoundary } from "./access-control";
import { humanizeAuditAction, type AuditHistoryRecord } from "@/lib/identity/audit-history";

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function resultTone(result: AuditHistoryRecord["result"]) {
  if (result === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300";
  if (result === "denied") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300";
  return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300";
}

function detailFor(event: AuditHistoryRecord) {
  const metadata = event.metadata || {};
  if (event.action === "team.membership.update_denied" && metadata.reason === "final_owner") return "Final owner protection blocked the change.";
  if (event.action === "user.access.denied") {
    const status = typeof metadata.membership_status === "string" ? metadata.membership_status : null;
    return status ? `No active membership (${status}).` : "No active membership was available.";
  }
  if (event.action.startsWith("team.invitation.")) {
    const role = typeof metadata.role === "string" ? metadata.role : null;
    return role ? `Role: ${role}` : "Invitation activity";
  }
  if (event.action === "team.membership.updated") {
    const previousStatus = typeof metadata.previous_status === "string" ? metadata.previous_status : null;
    const nextStatus = typeof metadata.new_status === "string" ? metadata.new_status : null;
    if (previousStatus && nextStatus && previousStatus !== nextStatus) return `${previousStatus} → ${nextStatus}`;
    const previousRole = typeof metadata.previous_role === "string" ? metadata.previous_role : null;
    const nextRole = typeof metadata.new_role === "string" ? metadata.new_role : null;
    if (previousRole && nextRole && previousRole !== nextRole) return `${previousRole} → ${nextRole}`;
  }
  return event.targetType ? `${event.targetType}${event.targetId ? ` · ${event.targetId.slice(0, 8)}…` : ""}` : "—";
}

export function AuditHistoryWorkspace() {
  return (
    <AccessBoundary permission="audit_logs.view">
      <AuditHistoryContent />
    </AccessBoundary>
  );
}

function AuditHistoryContent() {
  const [events, setEvents] = React.useState<AuditHistoryRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [result, setResult] = React.useState("all");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/audit-events", { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { events?: AuditHistoryRecord[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Audit history is unavailable.");
      setEvents(payload.events || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Audit history is unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const filtered = events.filter((event) => {
    if (result !== "all" && event.result !== result) return false;
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [event.actorName, event.actorEmail, event.action, humanizeAuditAction(event.action, event.metadata), detailFor(event)]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle));
  });

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-white/10 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500"><FileClock className="h-3.5 w-3.5" /> Identity & Access</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Activity & Login History</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Review authentication, invitations, team changes, access denials and other security-sensitive tenancy activity.</p>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-ink dark:text-slate-200 dark:hover:bg-white/5">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric label="Recent events" value={String(events.length)} />
        <Metric label="Denied" value={String(events.filter((event) => event.result === "denied").length)} />
        <Metric label="Sign-ins" value={String(events.filter((event) => event.action === "authentication.sign_in.succeeded").length)} />
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-ink md:flex-row">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search user or activity" className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-black/10" />
        </label>
        <select value={result} onChange={(event) => setResult(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-ink">
          <option value="all">All results</option><option value="success">Success</option><option value="denied">Denied</option><option value="failure">Failure</option>
        </select>
      </section>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">{error}</div>}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-ink">
        <div className="grid grid-cols-[minmax(170px,0.8fr)_minmax(180px,1fr)_minmax(220px,1.4fr)_110px] gap-4 border-b border-slate-200 px-5 py-3 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500 dark:border-white/10">
          <span>Date / Time</span><span>User</span><span>Event</span><span>Result</span>
        </div>
        {loading ? <State text="Loading activity…" /> : filtered.length === 0 ? <State text="No audit events match these filters." /> : (
          <div className="divide-y divide-slate-100 dark:divide-white/10">
            {filtered.map((event) => (
              <div key={event.id} className="grid grid-cols-[minmax(170px,0.8fr)_minmax(180px,1fr)_minmax(220px,1.4fr)_110px] gap-4 px-5 py-4 text-sm">
                <div className="text-xs text-slate-500">{formatDateTime(event.occurredAt)}</div>
                <div className="flex min-w-0 items-start gap-2"><UserRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /><div className="min-w-0"><div className="truncate font-medium">{event.actorName || "System / unknown"}</div>{event.actorEmail && <div className="truncate text-xs text-slate-500">{event.actorEmail}</div>}</div></div>
                <div className="min-w-0"><div className="font-medium">{humanizeAuditAction(event.action, event.metadata)}</div><div className="mt-1 truncate text-xs text-slate-500">{detailFor(event)}</div></div>
                <div><span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${resultTone(event.result)}`}>{event.result}</span></div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-white/10 dark:bg-white/5"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />Audit history is server-scoped to the authenticated tenant. Organization scope is derived by TraceKit and is not accepted from browser input.</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-ink"><div className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">{label}</div><div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div></div>;
}
function State({ text }: { text: string }) { return <div className="px-5 py-10 text-center text-sm text-slate-500">{text}</div>; }
