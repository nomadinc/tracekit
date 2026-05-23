// ui/app/(app)/settings/integrations/wowboost/page.tsx
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

type SettingsGetResponse = {
  ok: boolean;
  platform?: string;
  auto_import_enabled?: boolean;
  auto_import_interval_minutes?: number;
  auto_import_lookback_hours?: number;
  last_run_at?: string | null;
  last_success_at?: string | null;
  last_error?: string | null;
  message?: string;
};

type SettingsSaveResponse = {
  ok: boolean;
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

type AsyncImportStartResponse = {
  ok: boolean;
  job_id?: string;
  status?: string;
  platform?: string;
  module?: string;
  from?: string;
  to?: string;
  filter?: string;
  message?: string;
  error?: string;

  fetched?: number;
  upserted?: number;
  pages?: number;
};

const DEFAULT_BASE_URL = "https://public-api.tryemanagecrm.com";

// Import filters (match API)
const IMPORT_FILTERS = [
  { value: "all_sales", label: "All Sales" },
  { value: "completed", label: "Completed" },
  { value: "pending", label: "Pending" },
  { value: "partial", label: "Partial" },
  { value: "declined", label: "Declined" },
  { value: "refunded", label: "Refunded" },
  { value: "cancelled", label: "Cancelled" },
] as const;

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

/** ===== Last import (MVP: localStorage) ===== */
const LAST_IMPORT_KEY = "tracekit:lastImport:wowboost";

type LastImportState = {
  platform: "wowboost";
  from: string;
  to: string;
  filter: string;
  fetched: number;
  upserted: number;
  pages: number;
  importedAt: string; // ISO
};

function safeLoadLastImport(): LastImportState | null {
  try {
    const raw = localStorage.getItem(LAST_IMPORT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || v.platform !== "wowboost" || !v.from || !v.to || !v.importedAt) return null;
    return {
      platform: "wowboost",
      from: String(v.from),
      to: String(v.to),
      filter: String(v.filter ?? "all_sales"),
      fetched: Number(v.fetched ?? 0),
      upserted: Number(v.upserted ?? 0),
      pages: Number(v.pages ?? 0),
      importedAt: String(v.importedAt),
    };
  } catch {
    return null;
  }
}

function safeSaveLastImport(v: LastImportState) {
  try {
    localStorage.setItem(LAST_IMPORT_KEY, JSON.stringify(v));
  } catch {
    // ignore
  }
}

function toLocalDateTimeLabel(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString();
}

// best-effort ymd from lookback hours
function isoYmdLocal(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function WowBoostIntegrationPage() {
  // Connection fields
  const [baseUrl, setBaseUrl] = React.useState(DEFAULT_BASE_URL);
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");

  // Connect status
  const [status, setStatus] = React.useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [statusMsg, setStatusMsg] = React.useState<string | null>(null);

  // Status panel
  const [statusLoading, setStatusLoading] = React.useState(false);
  const [statusResp, setStatusResp] = React.useState<StatusResponse | null>(null);
  const [statusErr, setStatusErr] = React.useState<string | null>(null);

  // Auto-import settings
  const [settingsLoading, setSettingsLoading] = React.useState(false);
  const [settingsSaving, setSettingsSaving] = React.useState(false);
  const [settingsMsg, setSettingsMsg] = React.useState<string | null>(null);
  const [autoEnabled, setAutoEnabled] = React.useState<boolean>(false);
  const [intervalMinutes, setIntervalMinutes] = React.useState<number>(60);
  const [lookbackHours, setLookbackHours] = React.useState<number>(2);
  const [lastRunAt, setLastRunAt] = React.useState<string | null>(null);
  const [lastSuccessAt, setLastSuccessAt] = React.useState<string | null>(null);
  const [lastError, setLastError] = React.useState<string | null>(null);

  // Force run
  const [runNowLoading, setRunNowLoading] = React.useState(false);
  const [runNowMsg, setRunNowMsg] = React.useState<string | null>(null);

  // Import fields/status
  const [impFrom, setImpFrom] = React.useState("2024-01-01");
  const [impTo, setImpTo] = React.useState("2024-01-02");
  const [impFilter, setImpFilter] = React.useState<(typeof IMPORT_FILTERS)[number]["value"]>("all_sales");
  const [impStatus, setImpStatus] = React.useState<"idle" | "importing" | "done" | "error">("idle");
  const [impMsg, setImpMsg] = React.useState<string | null>(null);
  const [viewOrdersHref, setViewOrdersHref] = React.useState<string | null>(null);

  // Last import panel state
  const [lastImport, setLastImport] = React.useState<LastImportState | null>(null);

  // Hydration guard
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Restore last import once mounted
  React.useEffect(() => {
    if (!mounted) return;

    const li = safeLoadLastImport();
    if (!li) return;

    setLastImport(li);
    setImpFrom(li.from);
    setImpTo(li.to);
    setImpFilter((li.filter as any) || "all_sales");
    setViewOrdersHref(buildOrdersUrl("wowboost", li.from, li.to));
    setImpStatus("done");
    setImpMsg(
      `Last import: ${li.upserted} orders (fetched ${li.fetched}) • pages ${li.pages} • ${new Date(
        li.importedAt
      ).toLocaleString()}`
    );
  }, [mounted]);

  async function refreshStatus() {
    setStatusLoading(true);
    setStatusErr(null);
    try {
      const json = await apiGetJson<StatusResponse>("/v1/integrations/wowboost/status");
      setStatusResp(json);
      if (!json.ok) {
        setStatusErr(json.message || "Status unavailable.");
      }
    } catch (e: any) {
      setStatusResp(null);
      setStatusErr(e?.message || "Status unavailable.");
    } finally {
      setStatusLoading(false);
    }
  }

  async function loadSettings() {
    setSettingsLoading(true);
    setSettingsMsg(null);
    try {
      const json = await apiGetJson<SettingsGetResponse>("/v1/integrations/wowboost/settings");
      if (!json.ok) throw new Error(json.message || "Settings unavailable.");

      setAutoEnabled(Boolean(json.auto_import_enabled));
      setIntervalMinutes(Number(json.auto_import_interval_minutes ?? 60) || 60);
      setLookbackHours(Number(json.auto_import_lookback_hours ?? 2) || 2);
      setLastRunAt(json.last_run_at ?? null);
      setLastSuccessAt(json.last_success_at ?? null);
      setLastError(json.last_error ?? null);
    } catch (e: any) {
      setSettingsMsg(e?.message || "Settings unavailable.");
    } finally {
      setSettingsLoading(false);
    }
  }

  async function saveSettings() {
    setSettingsSaving(true);
    setSettingsMsg(null);
    try {
      const json = await apiPostJson<SettingsSaveResponse>(
        "/v1/integrations/wowboost/settings",
        {
          auto_import_enabled: Boolean(autoEnabled),
          auto_import_interval_minutes: Math.max(15, Math.min(1440, Number(intervalMinutes) || 60)),
          auto_import_lookback_hours: Math.max(1, Math.min(168, Number(lookbackHours) || 2)),
        }
      );

      if (!json.ok) throw new Error(json.message || "Failed to save settings.");
      setSettingsMsg(json.message || "Saved.");
      await loadSettings();
    } catch (e: any) {
      setSettingsMsg(e?.message || "Failed to save settings.");
    } finally {
      setSettingsSaving(false);
    }
  }

  async function runNow() {
  setRunNowLoading(true);
  setRunNowMsg(null);

  try {
    // Use the "Import Orders" date inputs as the run-now range
    // (matches the user's expectation + avoids guessing)
    const from = impFrom.trim();
    const to = impTo.trim();

    if (!from || !to) {
      throw new Error("from/to are required (YYYY-MM-DD). Set Import Orders range first.");
    }

    const json = await apiPostJson<RunNowResponse>("/v1/integrations/wowboost/run-now", {
      from,
      to,
      filter: impFilter || "all_sales",
      lookback_hours: Math.max(1, Math.min(168, Number(lookbackHours) || 2)),
    });

    if (!json.ok) throw new Error(json.message || "Run failed.");

    setRunNowMsg(
      json.message ||
        `Imported ${json.upserted ?? 0} (fetched ${json.fetched ?? 0}) • pages ${json.pages ?? 0}`
    );

    // Refresh settings so “last_success_at / last_error” updates
    await loadSettings();
  } catch (e: any) {
    setRunNowMsg(e?.message || "Run failed.");
  } finally {
    setRunNowLoading(false);
  }
}

  // Initial: refresh status + load settings after mount
  React.useEffect(() => {
    if (!mounted) return;
    refreshStatus();
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

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

      // 1) TEST
      const test = await apiPostJson<TestConnectResponse>(
        "/v1/integrations/test-connect",
        {
          platform: "wowboost",
          baseUrl,
          username,
          password,
        },
        { signal: ctrl.signal } as any
      );

      if (!test.ok) {
        setStatus("error");
        setStatusMsg(test.message || "Connection test failed.");
        return;
      }

      // 2) SAVE
      const saved = await apiPostJson<SaveConnectResponse>(
        "/v1/integrations/save-credentials",
        {
          platform: "wowboost",
          baseUrl,
          username,
          password,
        },
        { signal: ctrl.signal } as any
      );

      if (!saved.ok) {
        setStatus("error");
        setStatusMsg(saved.message || "Test succeeded, but saving failed.");
        return;
      }

      setStatus("connected");
      setStatusMsg(saved.message || test.message || "Connected & saved.");

      // clear sensitive value from UI state after successful save
      setPassword("");

      // refresh status/settings so UI reflects truth
      refreshStatus();
      loadSettings();
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

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 60000);

    try {
      setImpStatus("importing");
      setImpMsg(null);
      setViewOrdersHref(null);

      const json = await apiPostJson<AsyncImportStartResponse>(
	  "/v1/integrations/wowboost/import-orders-async",
	  { from, to, filter: impFilter }
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

      // Show a view-orders link for exactly the imported range
      const href = buildOrdersUrl("wowboost", from, to, impFilter === "all_sales" ? undefined : impFilter.toUpperCase());
      setViewOrdersHref(href);

      // Persist and show "last import" (MVP: localStorage)
      const li: LastImportState = {
        platform: "wowboost",
        from,
        to,
        filter: impFilter,
        fetched: json.fetched ?? 0,
        upserted: json.upserted ?? 0,
        pages: json.pages ?? 0,
        importedAt: new Date().toISOString(),
      };

      if (mounted) safeSaveLastImport(li);
      setLastImport(li);

      // refresh status/settings freshness markers
      refreshStatus();
      loadSettings();
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

  const headerConnected = Boolean(statusResp?.ok && statusResp.connected);

	const badge =
	  headerConnected
	    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
	    : status === "connecting"
	    ? "bg-amber-50 text-amber-800 border-amber-200"
	    : status === "error"
	    ? "bg-rose-50 text-rose-700 border-rose-200"
	    : "bg-gray-50 text-gray-700 border-gray-200";


  const connectedPill =
    statusResp?.ok && statusResp.connected
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : "border-slate-200 bg-slate-50 text-slate-800";
  
  
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">wowboost</h1>
          <p className="text-sm text-slate-500">
            Connect using Base URL + Username + Password.
          </p>
        </div>

        <span
		  className={[
		    "rounded-full border px-3 py-1 text-xs",
		    headerConnected
		      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
		      : status === "connecting"
		      ? "bg-amber-50 text-amber-800 border-amber-200"
		      : status === "error"
		      ? "bg-rose-50 text-rose-700 border-rose-200"
		      : "bg-gray-50 text-gray-700 border-gray-200",
		  ].join(" ")}
		>
		  {headerConnected ? "Connected" : status === "idle" ? "Not connected" : status}
		</span>

      </div>

      {/* Connection Status Panel */}
      <div className="rounded-xl border p-4 space-y-3 max-w-2xl">
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

        <div className={["rounded-md border px-3 py-2 text-sm", connectedPill].join(" ")}>
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

      {/* Auto-import settings */}
      <div className="rounded-xl border p-4 space-y-3 max-w-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Auto-import</div>
            <div className="text-xs text-slate-500">Runs hourly (MVP) and pulls the last N hours.</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadSettings}
              disabled={settingsLoading}
              className="rounded-md border px-3 py-2 text-sm disabled:opacity-60"
            >
              {settingsLoading ? "Loading…" : "Reload"}
            </button>

            <button
              type="button"
              onClick={runNow}
              disabled={runNowLoading}
              className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-60"
              title="Runs an import immediately (server-side)."
            >
              {runNowLoading ? "Running…" : "Force update"}
            </button>
          </div>
        </div>

        {settingsMsg ? (
          <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-800">
            {settingsMsg}
          </div>
        ) : null}

        {runNowMsg ? (
          <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-800">
            {runNowMsg}
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <label className="text-sm">
            <div className="mb-1 text-xs text-slate-500">Enabled</div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoEnabled}
                onChange={(e) => setAutoEnabled(e.target.checked)}
              />
              <span className="text-sm">Auto-import hourly</span>
            </div>
          </label>

          <label className="text-sm">
            <div className="mb-1 text-xs text-slate-500">Interval (minutes)</div>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm font-mono"
              value={String(intervalMinutes)}
              onChange={(e) => setIntervalMinutes(Number(e.target.value) || 60)}
              placeholder="60"
            />
          </label>

          <label className="text-sm">
            <div className="mb-1 text-xs text-slate-500">Lookback (hours)</div>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm font-mono"
              value={String(lookbackHours)}
              onChange={(e) => setLookbackHours(Number(e.target.value) || 2)}
              placeholder="2"
            />
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={saveSettings}
            disabled={settingsSaving}
            className="rounded-md border px-3 py-2 text-sm disabled:opacity-60"
          >
            {settingsSaving ? "Saving…" : "Save settings"}
          </button>

          <div className="text-xs text-slate-500">
            Last run: <span className="font-mono">{toLocalDateTimeLabel(lastRunAt)}</span> • Last success:{" "}
            <span className="font-mono">{toLocalDateTimeLabel(lastSuccessAt)}</span>
          </div>
        </div>

        {lastError ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
            <div className="font-semibold">Last error</div>
            <div className="font-mono text-xs opacity-80">{lastError}</div>
          </div>
        ) : null}
      </div>

      {/* Status message from connect */}
      {statusMsg ? (
        <div
          className={[
            "rounded-xl border p-3 text-sm max-w-2xl",
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

      {/* Connect form */}
      <div className="rounded-xl border p-4 space-y-3 max-w-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Base URL</label>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={DEFAULT_BASE_URL}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <p className="text-xs text-slate-500">
              Prefilled: <span className="font-mono">{DEFAULT_BASE_URL}</span>
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Username</label>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="spybulb_orders"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="text-sm font-medium">Password</label>

            {mounted ? (
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="new-password"
                suppressHydrationWarning
              />
            ) : (
              <div className="w-full rounded-md border px-3 py-2 text-sm text-slate-400">
                ••••••••
              </div>
            )}

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
              setBaseUrl(DEFAULT_BASE_URL);
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
      <div className="rounded-xl border p-4 space-y-3 max-w-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Import Orders</div>
            <div className="text-xs text-slate-500">
              Pulls transactions from wowboost and upserts into{" "}
              <span className="font-mono">platform_orders</span>.
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
              placeholder="2024-01-01"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">To</label>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm font-mono"
              value={impTo}
              onChange={(e) => setImpTo(e.target.value)}
              placeholder="2024-01-02"
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

        {/* Last import panel */}
        {mounted && lastImport ? (
          <div className="rounded-md border bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <div className="font-medium">Last import</div>
            <div className="mt-1 space-y-0.5">
              <div>
                Range: <span className="font-mono">{lastImport.from}</span> →{" "}
                <span className="font-mono">{lastImport.to}</span>
              </div>
              <div>
                Filter: <span className="font-mono">{lastImport.filter}</span>
              </div>
              <div>
                Orders: {lastImport.upserted} (fetched {lastImport.fetched}) • pages {lastImport.pages}
              </div>
              <div>Imported at: {new Date(lastImport.importedAt).toLocaleString()}</div>
            </div>
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

        {/* helpful quick view for “last N hours” */}
        {mounted ? (
          <div className="text-xs text-slate-500">
            Tip: for “last {lookbackHours} hours” manual import, try{" "}
            <span className="font-mono">
              {buildOrdersUrl(
                "wowboost",
                isoYmdLocal(new Date(Date.now() - lookbackHours * 60 * 60 * 1000)),
                isoYmdLocal(new Date())
              )}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
