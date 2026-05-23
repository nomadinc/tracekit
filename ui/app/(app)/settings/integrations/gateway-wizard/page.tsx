// ui/app/(app)/settings/integrations/gateway-wizard/page.tsx
"use client";

import * as React from "react";
import { apiPostJson } from "@/lib/api";

type SaveResponse = {
  ok: boolean;
  platform?: string;
  message?: string;
  error?: string;
};

type ImportResponse = {
  ok: boolean;
  platform?: string;
  connector?: string;
  from?: string;
  to?: string;
  fetched?: number;
  upserted?: number;
  page?: number;
  pageSize?: number;
  hasMore?: boolean;
  nextPage?: number | null;
  message?: string;
  error?: string;
};

const PRESETS = [
  {
    label: "NMI Classic Query API",
    platformPrefix: "nmi:",
    baseUrl: "https://secure.networkmerchants.com",
    username: "api_key",
  },
  {
    label: "PayDiverse Classic Query API",
    platformPrefix: "paydiverse",
    baseUrl: "https://paydiverse.transactiongateway.com",
    username: "api_key",
  },
] as const;

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoYmd(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function normalizePlatformKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

export default function GatewayWizardPage() {
  const [preset, setPreset] = React.useState<(typeof PRESETS)[number]>(PRESETS[0]);
  const [displayName, setDisplayName] = React.useState("LifeHeater14090");
  const [platformKey, setPlatformKey] = React.useState("nmi:lifeheater14090");
  const [baseUrl, setBaseUrl] = React.useState(PRESETS[0].baseUrl);
  const [username, setUsername] = React.useState("api_key");
  const [securityKey, setSecurityKey] = React.useState("");

  const [from, setFrom] = React.useState(daysAgoYmd(30));
  const [to, setTo] = React.useState(todayYmd());
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(1000);

  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [lastResult, setLastResult] = React.useState<ImportResponse | null>(null);

  function applyPreset(nextLabel: string) {
    const next = PRESETS.find((p) => p.label === nextLabel) || PRESETS[0];
    setPreset(next);
    setBaseUrl(next.baseUrl);
    setUsername(next.username);

    if (next.platformPrefix === "paydiverse") {
      setPlatformKey("paydiverse");
    } else {
      const slug = normalizePlatformKey(displayName || "new-account");
      setPlatformKey(`${next.platformPrefix}${slug}`);
    }
  }

  function updateDisplayName(value: string) {
    setDisplayName(value);
    if (preset.platformPrefix !== "paydiverse") {
      setPlatformKey(`${preset.platformPrefix}${normalizePlatformKey(value || "new-account")}`);
    }
  }

  async function saveCredentials() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await apiPostJson<SaveResponse>("/v1/integrations/save-credentials", {
        platform: platformKey,
        baseUrl,
        username,
        password: securityKey,
      });
      if (!res.ok) throw new Error(res.message || res.error || "Save failed");
      setMessage(`Saved credentials for ${platformKey}.`);
    } catch (e: any) {
      setMessage(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function runTestImport() {
    setTesting(true);
    setMessage(null);
    setLastResult(null);
    try {
      const res = await apiPostJson<ImportResponse>("/v1/integrations/gateway-classic/import-one-page", {
        platform: platformKey,
        from,
        to,
        page: 0,
        pageSize: 10,
      });
      setLastResult(res);
      if (!res.ok) throw new Error(res.message || res.error || "Test import failed");
      setMessage(`Test import worked. Fetched ${res.fetched ?? 0}, upserted ${res.upserted ?? 0}.`);
    } catch (e: any) {
      setMessage(e?.message || String(e));
    } finally {
      setTesting(false);
    }
  }

  async function runImportPage(nextPage?: number) {
    setImporting(true);
    setMessage(null);
    try {
      const effectivePage = typeof nextPage === "number" ? nextPage : page;
      const res = await apiPostJson<ImportResponse>("/v1/integrations/gateway-classic/import-one-page", {
        platform: platformKey,
        from,
        to,
        page: effectivePage,
        pageSize,
      });
      setLastResult(res);
      if (!res.ok) throw new Error(res.message || res.error || "Import failed");
      setPage(res.nextPage ?? effectivePage);
      setMessage(`Page ${res.page} complete. Fetched ${res.fetched ?? 0}, upserted ${res.upserted ?? 0}.`);
    } catch (e: any) {
      setMessage(e?.message || String(e));
    } finally {
      setImporting(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gateway Account Wizard</h1>
        <p className="mt-2 text-sm text-gray-600">
          Add NMI Classic or PayDiverse gateway accounts without hard-coding new routes.
        </p>
      </div>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-medium">1. Account setup</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium">Connector type</span>
            <select
              className="w-full rounded-lg border px-3 py-2"
              value={preset.label}
              onChange={(e) => applyPreset(e.target.value)}
            >
              {PRESETS.map((p) => (
                <option key={p.label} value={p.label}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Display name</span>
            <input
              className="w-full rounded-lg border px-3 py-2"
              value={displayName}
              onChange={(e) => updateDisplayName(e.target.value)}
              placeholder="LifeHeater14090"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Platform key</span>
            <input
              className="w-full rounded-lg border px-3 py-2 font-mono text-sm"
              value={platformKey}
              onChange={(e) => setPlatformKey(normalizePlatformKey(e.target.value))}
              placeholder="nmi:lifeheater14090"
            />
            <span className="text-xs text-gray-500">
              Examples: nmi:lifeheater14090, nmi:mid2, paydiverse
            </span>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Base URL</span>
            <input
              className="w-full rounded-lg border px-3 py-2 font-mono text-sm"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://secure.networkmerchants.com"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Username</span>
            <input
              className="w-full rounded-lg border px-3 py-2"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="api_key"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Private security key</span>
            <input
              className="w-full rounded-lg border px-3 py-2"
              type="password"
              value={securityKey}
              onChange={(e) => setSecurityKey(e.target.value)}
              placeholder="Paste security key"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={saving || !platformKey || !baseUrl || !securityKey}
            onClick={saveCredentials}
          >
            {saving ? "Saving..." : "Save credentials"}
          </button>

          <button
            className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
            disabled={testing || !platformKey}
            onClick={runTestImport}
          >
            {testing ? "Testing..." : "Run 10-row test"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-medium">2. Import transactions</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <label className="space-y-1">
            <span className="text-sm font-medium">From</span>
            <input className="w-full rounded-lg border px-3 py-2" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">To</span>
            <input className="w-full rounded-lg border px-3 py-2" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Page</span>
            <input
              className="w-full rounded-lg border px-3 py-2"
              type="number"
              min={0}
              value={page}
              onChange={(e) => setPage(Math.max(0, Number(e.target.value || 0)))}
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Page size</span>
            <input
              className="w-full rounded-lg border px-3 py-2"
              type="number"
              min={1}
              max={1000}
              value={pageSize}
              onChange={(e) => setPageSize(Math.max(1, Math.min(1000, Number(e.target.value || 1000))))}
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={importing || !platformKey}
            onClick={() => runImportPage()}
          >
            {importing ? "Importing..." : "Import current page"}
          </button>

          {lastResult?.hasMore && typeof lastResult.nextPage === "number" && (
            <button
              className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
              disabled={importing}
              onClick={() => runImportPage(lastResult.nextPage!)}
            >
              Import next page ({lastResult.nextPage})
            </button>
          )}
        </div>
      </section>

      {message && (
        <div className="rounded-xl border bg-gray-50 p-4 text-sm">
          {message}
        </div>
      )}

      {lastResult && (
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-medium">Last result</h2>
          <pre className="mt-3 overflow-auto rounded-xl bg-gray-950 p-4 text-xs text-gray-100">
            {JSON.stringify(lastResult, null, 2)}
          </pre>
        </section>
      )}
    </main>
  );
}
