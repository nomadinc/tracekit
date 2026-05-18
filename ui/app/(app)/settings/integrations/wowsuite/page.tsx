// ui/app/(app)/settings/integrations/wowsuite/page.tsx
"use client";

import * as React from "react";
import { apiPostJson, apiGetJson } from "@/lib/api";

type TestConnectResponse = {
  ok: boolean;
  platform?: string;
  message?: string;
  http_status?: number;
  response_snippet?: string;
  parsed?: any;
  debug?: any;
};

type SaveConnectResponse = {
  ok: boolean;
  platform?: string;
  message?: string;
};

type ImportOrdersResponse = {
  ok: boolean;
  platform?: string;
  message?: string;
  from?: string;
  to?: string;
  filter?: string;
  fetched?: number;
  upserted?: number;
  pages?: number;
  error?: string;
};

type StatusResponse = {
  ok: boolean;
  connected?: boolean;
  platform?: string;
  baseUrl?: string;
  username?: string;
  created_at?: string;
  updated_at?: string;
  message?: string;
};

type RunNowResponse = {
  ok: boolean;
  message?: string;
  platform?: string;
  from?: string;
  to?: string;
  filter?: string;
  fetched?: number;
  upserted?: number;
  pages?: number;
  error?: string;
};

const IMPORT_FILTERS = [
  { value: "all_sales", label: "All Sales" },
  { value: "completed", label: "Completed" },
  { value: "pending", label: "Pending" },
  { value: "partial", label: "Partial" },
  { value: "declined", label: "Declined" },
  { value: "refunded", label: "Refunded" },
  { value: "cancelled", label: "Cancelled" },
] as const;

function toLocalDateTimeLabel(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString();
}

function buildOrdersUrl(platform: string, from: string, to: string, status?: string) {
  const qs = new URLSearchParams({
    platform,
    from,
    to,
    limit: "200",
  });
  if (status) qs.set("status", status);
  return `/orders?${qs.toString()}`;
}

function isoYmdLocal(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

type PlatformKey = "wowboost" | "wowpay";

const PLATFORM_META: Record<
  PlatformKey,
  { label: string; defaultBaseUrl: string; help: string }
> = {
  wowboost: {
    label: "WowBoost",
    defaultBaseUrl: "https://public-api.tryemanagecrm.com",
    help: "Uses Basic auth → bearer token → export CSV flow.",
  },
  wowpay: {
    label: "WowPay",
    defaultBaseUrl: "https://public-api.tryemanagecrm.com",
    help: "Uses WowPay public API (separate credentials + endpoints).",
  },
};

function Pill({ connected, idleText }: { connected: boolean; idleText?: string }) {
  const cls = connected
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : "bg-gray-50 text-gray-700 border-gray-200";
  return (
    <span className={["rounded-full border px-3 py-1 text-xs", cls].join(" ")}>
      {connected ? "Connected" : idleText ?? "Not connected"}
    </span>
  );
}

function SubWizard({ platform }: { platform: PlatformKey }) {
  const meta = PLATFORM_META[platform];

  // Connection fields
  const [baseUrl, setBaseUrl] = React.useState(meta.defaultBaseUrl);
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");

  // Connect status
  const [status, setStatus] = React.useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [statusMsg, setStatusMsg] = React.useState<string | null>(null);

  // Status panel
  const [statusLoading, setStatusLoading] = React.useState(false);
  const [statusResp, setStatusResp] = React.useState<StatusResponse | null>(null);
  const [statusErr, setStatusErr] = React.useState<string | null>(null);

  // Force run
  const [runNowLoading, setRunNowLoading] = React.useState(false);
  const [runNowMsg, setRunNowMsg] = React.useState<string | null>(null);

  // Import
  const [impFrom, setImpFrom] = React.useState(() => isoYmdLocal(new Date(Date.now() - 24 * 60 * 60 * 1000)));
  const [impTo, setImpTo] = React.useState(() => isoYmdLocal(new Date()));
  const [impFilter, setImpFilter] = React.useState<(typeof IMPORT_FILTERS)[number]["value"]>("all_sales");
  const [impStatus, setImpStatus] = React.useState<"idle" | "importing" | "done" | "error">("idle");
  const [impMsg, setImpMsg] = React.useState<string | null>(null);
  const [viewOrdersHref, setViewOrdersHref] = React.useState<string | null>(null);

  const headerConnected = Boolean(statusResp?.ok && statusResp.connected);

  async function refreshStatus() {
    setStatusLoading(true);
    setStatusErr(null);
    try {
      const json = await apiGetJson<StatusResponse>(`/v1/integrations/${platform}/status`);
      setStatusResp(json);
      if (!json.ok) setStatusErr(json.message || "Status unavailable.");
    } catch (e: any) {
      setStatusResp(null);
      setStatusErr(e?.message || "Status unavailable.");
    } finally {
      setStatusLoading(false);
    }
  }

  async function handleTestAndSave() {
    if (!baseUrl || !username || !password) {
      setStatus("error");
      setStatusMsg("Base URL, username, and password are required.");
      return;
    }

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);

    try {
      setStatus("connecting");
      setStatusMsg(null);

      const test = await apiPostJson<TestConnectResponse>(
        "/v1/integrations/test-connect",
        { platform, baseUrl, username, password },
        { signal: ctrl.signal } as any
      );

      if (!test.ok) {
        setStatus("error");
        setStatusMsg(test.message || "Connection test failed.");
        return;
      }

      const saved = await apiPostJson<SaveConnectResponse>(
        "/v1/integrations/save-credentials",
        { platform, baseUrl, username, password },
        { signal: ctrl.signal } as any
      );

      if (!saved.ok) {
        setStatus("error");
        setStatusMsg(saved.message || "Test succeeded, but saving failed.");
        return;
      }

      setStatus("connected");
      setStatusMsg(saved.message || test.message || "Connected & saved.");
      setPassword("");

      await refreshStatus();
    } catch (e: any) {
      setStatus("error");
      setStatusMsg(
        e?.name === "AbortError"
          ? "Request timed out (20s). Check API reachability / WAF / whitelist."
          : e?.message || "Network error while connecting."
      );
    } finally {
      clearTimeout(t);
    }
  }

  async function handleImportOrders() {
  const from = impFrom.trim();
  const to = impTo.trim();

  if (!from || !to) {
    setImpStatus("error");
    setImpMsg("from/to are required (YYYY-MM-DD).");
    return;
  }

  // WOWBOOST = async job flow
  if (platform === "wowboost") {
    try {
      setImpStatus("importing");
      setImpMsg("Starting import…");
      setViewOrdersHref(null);

      const json = await apiPostJson<any>(
        "/v1/integrations/wowboost/import-orders-async",
        { from, to, filter: impFilter }
      );

      if (!json.ok || !json.job_id) {
        setImpStatus("error");
        setImpMsg(json.message || "Import failed to start.");
        return;
      }

      const jobId = String(json.job_id);

      setImpMsg(`Import started. Job ID: ${jobId}`);

      const poll = async () => {
        try {
          const statusJson = await apiGetJson<any>(
            `/v1/integrations/wowboost/import-status?job_id=${encodeURIComponent(jobId)}`
          );

          if (!statusJson.ok || !statusJson.job) {
            setImpStatus("error");
            setImpMsg(statusJson.message || "Import status unavailable.");
            return true; // stop polling
          }

          const job = statusJson.job;

          if (job.status === "queued" || job.status === "running") {
            setImpStatus("importing");
            setImpMsg(
              `Import ${job.status}… fetched ${job.fetched ?? 0} • upserted ${job.upserted ?? 0} • pages ${job.pages ?? 0}`
            );
            return false; // keep polling
          }

          if (job.status === "failed") {
            setImpStatus("error");
            setImpMsg(job.error || "Import failed.");
            return true; // stop polling
          }

          if (job.status === "completed") {
            setImpStatus("done");
            setImpMsg(
              `Imported ${job.upserted ?? 0} orders (fetched ${job.fetched ?? 0}) • pages ${job.pages ?? 0}`
            );

            setViewOrdersHref(
              buildOrdersUrl(
                "wowsuite:wowboost",
                from,
                to,
                impFilter === "all_sales" ? undefined : impFilter.toUpperCase()
              )
            );

            await refreshStatus();
            return true; // stop polling
          }

          return false;
        } catch (e: any) {
          setImpStatus("error");
          setImpMsg(e?.message || "Import status polling failed.");
          return true; // stop polling
        }
      };

      const done = await poll();
      if (done) return;

      const interval = window.setInterval(async () => {
        const stop = await poll();
        if (stop) window.clearInterval(interval);
      }, 4000);

      return;
    } catch (e: any) {
      setImpStatus("error");
      setImpMsg(e?.message || "Import failed to start.");
      return;
    }
  }

  // ALL OTHER INTEGRATIONS = existing sync flow
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60000);

  try {
    setImpStatus("importing");
    setImpMsg(null);
    setViewOrdersHref(null);

    const json = await apiPostJson<ImportOrdersResponse>(
      `/v1/integrations/${platform}/import-orders`,
      { from, to, filter: impFilter },
      { signal: ctrl.signal } as any
    );

    if (!json.ok) {
      setImpStatus("error");
      setImpMsg(json.message || "Import failed.");
      return;
    }

    setImpStatus("done");
    setImpMsg(
      json.message ||
        `Imported ${json.upserted ?? 0} orders (fetched ${json.fetched ?? 0}) • pages ${json.pages ?? 0}`
    );

    setViewOrdersHref(
      buildOrdersUrl(
        platform,
        from,
        to,
        impFilter === "all_sales" ? undefined : impFilter.toUpperCase()
      )
    );

    await refreshStatus();
  } catch (e: any) {
    setImpStatus("error");
    setImpMsg(
      e?.name === "AbortError"
        ? "Import timed out (60s). Try a smaller date range."
        : e?.message || "Import failed."
    );
  } finally {
    clearTimeout(t);
  }
}

  async function runNow() {
    setRunNowLoading(true);
    setRunNowMsg(null);
    try {
      // For now: server decides range OR you pass from/to if your endpoint requires it.
      // If your run-now requires from/to, uncomment and send them.
      const json = await apiPostJson<RunNowResponse>(`/v1/integrations/${platform}/run-now`, {
        // from: impFrom,
        // to: impTo,
        filter: "all_sales",
      });

      if (!json.ok) throw new Error(json.message || "Run failed.");
      setRunNowMsg(
        json.message ||
          `Imported ${json.upserted ?? 0} (fetched ${json.fetched ?? 0}) • pages ${json.pages ?? 0}`
      );

      await refreshStatus();
    } catch (e: any) {
      setRunNowMsg(e?.message || "Run failed.");
    } finally {
      setRunNowLoading(false);
    }
  }

  React.useEffect(() => {
    refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">{meta.label}</h2>
          <p className="text-sm text-slate-500">{meta.help}</p>
        </div>
        <Pill connected={headerConnected} />
      </div>

      {/* Connection Status Panel */}
      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Connection status</div>
            <div className="text-xs text-slate-500">Reads the saved credential (no password shown).</div>
          </div>
          <button
            type="button"
            onClick={refreshStatus}
            disabled={statusLoading}
            className="rounded-md border px-3 py-2 text-sm disabled:opacity-60"
          >
            {statusLoading ? "Refreshing…" : "Refresh status"}
          </button>
        </div>

        {statusErr ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="font-semibold">Status unavailable</div>
            <div className="font-mono text-xs opacity-80">{statusErr}</div>
          </div>
        ) : null}

        <div className="rounded-md border px-3 py-2 text-sm bg-slate-50 border-slate-200 text-slate-800">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <div>
              <span className="text-xs text-slate-500">Connected</span>
              <div className="font-medium">{String(Boolean(statusResp?.connected))}</div>
            </div>
            <div>
              <span className="text-xs text-slate-500">Base URL</span>
              <div className="font-mono text-xs">{statusResp?.baseUrl || "—"}</div>
            </div>
            <div>
              <span className="text-xs text-slate-500">Username</span>
              <div className="font-mono text-xs">{statusResp?.username || "—"}</div>
            </div>
            <div>
              <span className="text-xs text-slate-500">Updated</span>
              <div className="text-xs">{toLocalDateTimeLabel(statusResp?.updated_at)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Force update */}
      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Force update</div>
            <div className="text-xs text-slate-500">Runs an import immediately (server-side).</div>
          </div>
          <button
            type="button"
            onClick={runNow}
            disabled={runNowLoading}
            className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-60"
          >
            {runNowLoading ? "Running…" : "Force update"}
          </button>
        </div>

        {runNowMsg ? (
          <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-800">
            {runNowMsg}
          </div>
        ) : null}
      </div>

      {/* Connect form */}
      <div className="rounded-xl border p-4 space-y-3">
        {statusMsg ? (
          <div
            className={[
              "rounded-md border p-3 text-sm",
              status === "error"
                ? "border-rose-200 bg-rose-50 text-rose-900"
                : status === "connected"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-900",
            ].join(" ")}
          >
            {statusMsg}
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Base URL</label>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={meta.defaultBaseUrl}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Username</label>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="text-sm font-medium">Password</label>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="new-password"
            />
            <p className="text-xs text-slate-500">
              Password will be cleared from the form after a successful save.
            </p>
          </div>
        </div>

        <div className="pt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={handleTestAndSave}
            disabled={status === "connecting"}
            className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-60"
          >
            {status === "connecting" ? "Connecting…" : "Test & Save"}
          </button>

          <button
            type="button"
            className="rounded-md border px-3 py-2 text-sm"
            onClick={() => {
              setBaseUrl(meta.defaultBaseUrl);
              setUsername("");
              setPassword("");
              setStatus("idle");
              setStatusMsg(null);
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Import Orders */}
      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Import Orders</div>
            <div className="text-xs text-slate-500">
              Pulls transactions and upserts into <span className="font-mono">platform_orders</span>.
            </div>
          </div>
          <div className="text-xs text-slate-500">{impStatus === "importing" ? "importing…" : ""}</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div className="space-y-1">
            <label className="text-sm font-medium">From</label>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm font-mono"
              value={impFrom}
              onChange={(e) => setImpFrom(e.target.value)}
              placeholder="YYYY-MM-DD"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">To</label>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm font-mono"
              value={impTo}
              onChange={(e) => setImpTo(e.target.value)}
              placeholder="YYYY-MM-DD"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Filter</label>
            <select
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={impFilter}
              onChange={(e) => setImpFilter(e.target.value as any)}
            >
              {IMPORT_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleImportOrders}
            disabled={impStatus === "importing"}
            className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-60"
          >
            {impStatus === "importing" ? "Importing…" : "Import"}
          </button>
        </div>

        {impMsg ? (
          <div
            className={[
              "rounded-md border px-3 py-2 text-sm",
              impStatus === "error"
                ? "border-rose-200 bg-rose-50 text-rose-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-900",
            ].join(" ")}
          >
            {impMsg}
          </div>
        ) : null}

        {viewOrdersHref ? (
          <div className="text-sm">
            <a
              href={viewOrdersHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 underline underline-offset-2"
            >
              View imported orders →
            </a>
            <div className="text-xs text-slate-500 mt-1 font-mono">{viewOrdersHref}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function WowSuiteIntegrationPage() {
  const [tab, setTab] = React.useState<PlatformKey>("wowboost");

  return (
    <div className="p-6 space-y-6">
      {/* Umbrella Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">WowSuite</h1>
          <p className="text-sm text-slate-500">
            Manage <span className="font-medium">WowBoost</span> and <span className="font-medium">WowPay</span> under one umbrella.
          </p>
        </div>

        <div className="inline-flex rounded-lg border overflow-hidden">
          <button
            type="button"
            className={[
              "px-3 py-2 text-sm",
              tab === "wowboost" ? "bg-black text-white" : "bg-white text-slate-800",
            ].join(" ")}
            onClick={() => setTab("wowboost")}
          >
            WowBoost
          </button>
          <button
            type="button"
            className={[
              "px-3 py-2 text-sm",
              tab === "wowpay" ? "bg-black text-white" : "bg-white text-slate-800",
            ].join(" ")}
            onClick={() => setTab("wowpay")}
          >
            WowPay
          </button>
        </div>
      </div>

      {/* Active wizard */}
      <SubWizard platform={tab} />
    </div>
  );
}