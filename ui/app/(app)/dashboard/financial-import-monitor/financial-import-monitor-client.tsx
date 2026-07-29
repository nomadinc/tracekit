"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Copy,
  DatabaseZap,
  Filter,
  Loader2,
  Search,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { sameOriginGetJson } from "@/lib/same-origin-api";
import {
  financialImportMonitorQuery,
  type FinancialImportMonitorAccount,
  type FinancialImportMonitorResponse,
  type FinancialImportMonitorStatus,
} from "@/lib/financial-import-monitor";

const WORKSPACE_ID = "default";
const STATUSES: Array<FinancialImportMonitorStatus | "all"> = ["all", "Healthy", "Running", "Waiting", "Attention", "Failed", "Diagnostic only", "Never run", "Disabled"];
const MODES = ["all", "active", "diagnostic_only", "unsupported"];
const LEDGER_LABELS: Array<[keyof FinancialImportMonitorAccount["financial_event_totals"], string]> = [
  ["refund", "Refunds"],
  ["chargeback", "Chargebacks"],
  ["chargeback_fee", "Chargeback Fees"],
  ["chargeback_reversal", "Chargeback Reversals"],
  ["chargeback_fee_reversal", "Fee Reversals"],
];

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

function financialAmount(total: { amount: number; currency: string | null; mixed_currency: boolean }) {
  const n = Number(total.amount ?? 0);
  if (!Number.isFinite(n)) return "-";
  if (total.mixed_currency) return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} mixed`;
  if (!total.currency) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return n.toLocaleString("en-US", { style: "currency", currency: total.currency, maximumFractionDigits: 2 });
}

function count(value: unknown) {
  if (value === null || value === undefined) return "Not reported";
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "-";
  return Math.trunc(n).toLocaleString("en-US");
}

function time(value: string | null | undefined) {
  if (!value) return "Never";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

function compact(value: unknown, fallback = "-") {
  const text = String(value || "").trim();
  if (!text) return fallback;
  if (text.length <= 34) return text;
  return `${text.slice(0, 18)}...${text.slice(-8)}`;
}

function statusTone(status: string) {
  if (status === "Healthy") return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100";
  if (status === "Running") return "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100";
  if (status === "Waiting" || status === "Never run") return "border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200";
  if (status === "Diagnostic only") return "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-100";
  if (status === "Failed") return "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100";
  if (status === "Disabled") return "border-slate-200 bg-slate-100 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400";
  return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100";
}

function statusIcon(status: string) {
  if (status === "Healthy") return <CheckCircle2 className="h-4 w-4" />;
  if (status === "Running") return <Loader2 className="h-4 w-4 animate-spin" />;
  if (status === "Failed") return <XCircle className="h-4 w-4" />;
  if (status === "Attention") return <AlertTriangle className="h-4 w-4" />;
  return <Clock3 className="h-4 w-4" />;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-lg border bg-white p-4 shadow-sm dark:border-white/10 dark:bg-ink/85 ${className}`}>{children}</section>;
}

function SummaryCards({ data }: { data: FinancialImportMonitorResponse }) {
  const items = [
    ["Connector accounts", data.summary.connector_accounts, DatabaseZap],
    ["Healthy", data.summary.healthy, CheckCircle2],
    ["Running", data.summary.running, Loader2],
    ["Attention required", data.summary.attention_required, AlertTriangle],
    ["Failed", data.summary.failed, XCircle],
    ["Unmatched events", data.summary.unmatched_financial_events, ShieldAlert],
    ["Imports last 24h", data.summary.imports_last_24h, Clock3],
  ];
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
      {items.map(([label, value, Icon]: any) => (
        <Card key={label}>
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
            <Icon className={`h-4 w-4 ${label === "Running" && Number(value) ? "animate-spin" : ""} text-slate-400`} />
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">{Number(value || 0).toLocaleString()}</div>
        </Card>
      ))}
    </section>
  );
}

function Filters({ range, platform, account, status, mode, attentionOnly }: {
  range: { from: string; to: string };
  platform: string;
  account: string;
  status: string;
  mode: string;
  attentionOnly: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = React.useState({ ...range, platform, account, status, mode, attentionOnly });

  React.useEffect(() => {
    setForm({ from: range.from, to: range.to, platform, account, status, mode, attentionOnly });
  }, [account, attentionOnly, mode, platform, range.from, range.to, status]);

  function apply() {
    const query = new URLSearchParams({ workspace_id: WORKSPACE_ID });
    if (form.from) query.set("from", form.from);
    if (form.to) query.set("to", form.to);
    if (form.platform) query.set("platform", form.platform);
    if (form.account) query.set("processor_account", form.account);
    if (form.status && form.status !== "all") query.set("status", form.status.toLowerCase());
    if (form.mode && form.mode !== "all") query.set("ingestion_mode", form.mode);
    if (form.attentionOnly) query.set("attention_only", "true");
    router.push(`/dashboard/financial-import-monitor?${query.toString()}`);
  }

  return (
    <Card>
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]">
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
          <input value={form.platform} onChange={(e) => setForm((prev) => ({ ...prev, platform: e.target.value }))} placeholder="paypal, nmi, wowboost" className="h-10 w-full rounded-md border bg-white px-3 text-sm dark:border-white/10 dark:bg-slate-950" />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
          <select value={form.status || "all"} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))} className="h-10 w-full rounded-md border bg-white px-3 text-sm dark:border-white/10 dark:bg-slate-950">
            {STATUSES.map((item) => <option key={item} value={item}>{item === "all" ? "All statuses" : item}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mode</span>
          <select value={form.mode || "all"} onChange={(e) => setForm((prev) => ({ ...prev, mode: e.target.value }))} className="h-10 w-full rounded-md border bg-white px-3 text-sm dark:border-white/10 dark:bg-slate-950">
            {MODES.map((item) => <option key={item} value={item}>{item === "all" ? "All modes" : item.replace(/_/g, " ")}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <label className="flex h-10 items-center gap-2 whitespace-nowrap rounded-md border px-3 text-sm dark:border-white/10">
            <input type="checkbox" checked={form.attentionOnly} onChange={(e) => setForm((prev) => ({ ...prev, attentionOnly: e.target.checked }))} />
            Needs attention
          </label>
          <button type="button" onClick={apply} className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-slate-400 dark:bg-white dark:text-slate-950">
            <Filter className="h-4 w-4" />
            Apply
          </button>
        </div>
      </div>
      <label className="mt-3 flex max-w-md items-center gap-2 rounded-md border bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
        <Search className="h-4 w-4 text-slate-400" />
        <input value={form.account} onChange={(e) => setForm((prev) => ({ ...prev, account: e.target.value }))} placeholder="Filter by account identifier" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
      </label>
    </Card>
  );
}

function AccountTable({ accounts, selected, onSelect }: { accounts: FinancialImportMonitorAccount[]; selected: string | null; onSelect: (account: FinancialImportMonitorAccount) => void }) {
  if (!accounts.length) {
    return (
      <Card>
        <div className="flex min-h-44 flex-col items-center justify-center text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          <h3 className="mt-3 font-semibold">No financial import accounts found</h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">Configured accounts and runtime history will appear here once financial connectors are connected or imported.</p>
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
              {["Connector", "Account", "Status", "Last successful", "Last attempted", "Imported", "Inserted", "Duplicate", "Matched", "Unmatched", "Missing affiliate", "Errors", "Cursor/window"].map((heading) => (
                <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-white/10">
            {accounts.map((account) => (
              <tr key={account.account_key} className={`${selected === account.account_key ? "bg-slate-100 dark:bg-white/10" : "hover:bg-slate-50 dark:hover:bg-white/5"}`}>
                <td className="px-4 py-3">
                  <button type="button" onClick={() => onSelect(account)} className="text-left font-medium text-slate-950 underline-offset-4 hover:underline dark:text-white">{account.connector_label}</button>
                  <div className="text-xs text-slate-500">{account.ingestion_mode.replace(/_/g, " ")}</div>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{compact(account.account)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${statusTone(account.status)}`}>
                    {statusIcon(account.status)}
                    {account.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{time(account.last_successful_import)}</td>
                <td className="px-4 py-3 text-slate-500">{time(account.last_attempted_import)}</td>
                <td className="px-4 py-3">{count(account.imported_events)}</td>
                <td className="px-4 py-3">{count(account.inserted_events)}</td>
                <td className="px-4 py-3">{count(account.duplicate_events)}</td>
                <td className="px-4 py-3">{count(account.matched)}</td>
                <td className="px-4 py-3">{count(account.unmatched)}</td>
                <td className="px-4 py-3">{count(account.missing_affiliate_attribution)}</td>
                <td className="px-4 py-3">{count(account.errors)}</td>
                <td className="max-w-48 truncate px-4 py-3 text-xs text-slate-500">{account.current_cursor_window || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function DetailPanel({ account }: { account: FinancialImportMonitorAccount | null }) {
  if (!account) {
    return (
      <Card>
        <h2 className="font-semibold">Account Details</h2>
        <p className="mt-2 text-sm text-slate-500">Select an account row to inspect import history, diagnostics, and financial event totals.</p>
      </Card>
    );
  }
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{account.connector_label}</h2>
          <p className="mt-1 font-mono text-xs text-slate-500">{account.account_key}</p>
        </div>
        <button type="button" onClick={() => navigator.clipboard?.writeText(account.account_key)} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm dark:border-white/10">
          <Copy className="h-4 w-4" />
          Copy account identifier
        </button>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Processor account", account.processor_account_id || "-"],
          ["Platform", account.platform],
          ["Enabled", account.enabled ? "Enabled" : "Disabled"],
          ["Mode", account.ingestion_mode.replace(/_/g, " ")],
          ["Current cursor/window", account.current_cursor_window || "-"],
          ["Retry count", account.current_task?.attempt_count ?? "-"],
          ["Last successful job", account.last_successful_import ? time(account.last_successful_import) : "Never"],
          ["Last failed/current error", account.current_task?.last_error || account.recent_jobs.find((job) => job.last_error)?.last_error || "-"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className="mt-1 break-words text-sm">{String(value)}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <section>
          <h3 className="font-semibold">Financial Event Breakdown</h3>
          <div className="mt-3 divide-y rounded-lg border dark:divide-white/10 dark:border-white/10">
            {LEDGER_LABELS.map(([key, label]) => {
              const total = account.financial_event_totals[key];
              return (
                <div key={key} className="grid grid-cols-3 gap-2 px-3 py-2 text-sm">
                  <span>{label}</span>
                  <span>{count(total.event_count)}</span>
                  <span className="text-right font-medium">{financialAmount(total)}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h3 className="font-semibold">Diagnostics</h3>
          <div className="mt-3 space-y-2">
            {account.diagnostics.length ? account.diagnostics.map((diagnostic) => (
              <div key={`${diagnostic.type}:${diagnostic.message}`} className={`rounded-lg border p-3 text-sm ${diagnostic.severity === "critical" ? statusTone("Failed") : diagnostic.severity === "warning" ? statusTone("Attention") : statusTone("Waiting")}`}>
                <div className="font-medium">{diagnostic.type.replace(/_/g, " ")}</div>
                <div className="mt-1 text-xs opacity-80">{diagnostic.message}{diagnostic.count ? ` (${count(diagnostic.count)})` : ""}</div>
              </div>
            )) : (
              <div className="rounded-lg border border-dashed p-4 text-sm text-slate-500 dark:border-white/10">No diagnostics for this account.</div>
            )}
          </div>
        </section>
      </div>

      <section className="mt-5">
        <h3 className="font-semibold">Recent Import History</h3>
        <div className="mt-3 divide-y rounded-lg border dark:divide-white/10 dark:border-white/10">
          {account.recent_jobs.length ? account.recent_jobs.map((job) => (
            <div key={job.id} className="grid gap-2 px-3 py-3 text-sm md:grid-cols-[1fr_8rem_12rem_12rem]">
              <div>
                <Link href={`/operations?job_id=${encodeURIComponent(job.id)}`} className="font-mono text-xs text-teal-700 hover:underline dark:text-teal-300">{job.id}</Link>
                <div className="mt-1 text-xs text-slate-500">{job.job_type || "import job"} · {job.phase || "phase unavailable"}</div>
              </div>
              <div><span className={`rounded-full border px-2 py-0.5 text-xs ${statusTone(job.status === "failed" ? "Failed" : job.status === "completed" ? "Healthy" : "Waiting")}`}>{job.status}</span></div>
              <div className="text-slate-500">{time(job.updated_at)}</div>
              <div className="truncate text-xs text-slate-500">{job.last_error || `${job.requested_from || "?"} to ${job.requested_to || "?"}`}</div>
            </div>
          )) : (
            <div className="px-3 py-4 text-sm text-slate-500">No import history for this account.</div>
          )}
        </div>
      </section>
    </Card>
  );
}

export default function FinancialImportMonitorClient() {
  const searchParams = useSearchParams();
  const fallback = defaultRange();
  const range = {
    from: searchParams.get("from") || fallback.from,
    to: searchParams.get("to") || fallback.to,
  };
  const platform = searchParams.get("platform") || "";
  const account = searchParams.get("processor_account") || "";
  const status = searchParams.get("status") || "all";
  const mode = searchParams.get("ingestion_mode") || "all";
  const attentionOnly = searchParams.get("attention_only") === "true";
  const [data, setData] = React.useState<FinancialImportMonitorResponse | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const query = financialImportMonitorQuery({
      workspace_id: WORKSPACE_ID,
      from: range.from,
      to: range.to,
      platform,
      processor_account: account,
      status: status === "all" ? null : status,
      ingestion_mode: mode === "all" ? null : mode,
      attention_only: attentionOnly,
    });

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const response = await sameOriginGetJson<FinancialImportMonitorResponse>(query);
        if (!cancelled) {
          setData(response);
          setSelected((prev) => prev || response.accounts[0]?.account_key || null);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Financial Import Monitor is unavailable.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [account, attentionOnly, mode, platform, range.from, range.to, status]);

  const selectedAccount = data?.accounts.find((item) => item.account_key === selected) || data?.accounts[0] || null;

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">Revenue Operations</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Financial Import Monitor</h1>
          <p className="mt-2 max-w-3xl text-slate-600 dark:text-slate-300">
            Monitor financial connector health, runtime progress, normalized ledger activity, and reconciliation diagnostics before enabling broader chargeback ingestion.
          </p>
        </div>
        <Link href="/operations" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5">View jobs</Link>
      </div>

      <Filters range={range} platform={platform} account={account} status={status} mode={mode} attentionOnly={attentionOnly} />

      {loading ? (
        <Card>
          <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading financial import health...</div>
        </Card>
      ) : error ? (
        <Card>
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-500" />
            <div>
              <h2 className="font-semibold">Financial Import Monitor is unavailable</h2>
              <p className="mt-1 text-sm text-slate-500">{error}</p>
              <p className="mt-2 text-xs text-slate-500">The monitor uses the authenticated server proxy <code>/api/financial-import-monitor</code>. Confirm the UI server can call authenticated operational APIs.</p>
            </div>
          </div>
        </Card>
      ) : data ? (
        <>
          <SummaryCards data={data} />
          <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.4fr)_minmax(420px,0.8fr)]">
            <AccountTable accounts={data.accounts} selected={selected} onSelect={(next) => setSelected(next.account_key)} />
            <DetailPanel account={selectedAccount} />
          </div>
        </>
      ) : null}
    </main>
  );
}
