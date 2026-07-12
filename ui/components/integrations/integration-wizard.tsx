"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  apiGetJson,
  apiPostJson,
  getApiBaseUrl,
} from "@/lib/api";
import type {
  IntegrationBackfillFilter,
  IntegrationDefinition,
  IntegrationTestEvent,
} from "@/lib/integrations/types";

type ConnectStatus = "idle" | "connecting" | "connected" | "error";
type TestEventStatus = "idle" | "sending" | "success" | "error";
type ImportStatus = "idle" | "importing" | "done" | "error";

type ApiResponse = {
  ok: boolean;
  message?: string;
  [key: string]: unknown;
};

type StatusResponse = ApiResponse & {
  connected?: boolean;
  platform?: string;
  baseUrl?: string | null;
  apiVersion?: string | null;
  username?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type SettingsResponse = ApiResponse & {
  auto_import_enabled?: boolean;
  auto_import_interval_minutes?: number;
  auto_import_lookback_hours?: number;
  last_run_at?: string | null;
  last_success_at?: string | null;
  last_error?: string | null;
};

type ImportResponse = ApiResponse & {
  from?: string;
  to?: string;
  filter?: string;
  fetched?: number;
  upserted?: number;
  pages?: number;
  job_id?: string;
  status?: string;
  job?: ImportJob;
};

type ImportJob = {
  status?: string;
  fetched?: number;
  upserted?: number;
  pages?: number;
  error?: string | null;
};

type LastImportState = {
  platform: string;
  from: string;
  to: string;
  filter: string;
  fetched: number;
  upserted: number;
  pages: number;
  importedAt: string;
};

const defaultFilter: IntegrationBackfillFilter = {
  value: "all_sales",
  label: "All Sales",
};

export function IntegrationWizard({
  integration,
}: {
  integration: IntegrationDefinition;
}) {
  const apiPlatform = integration.apiPlatform ?? integration.id;
  const apiBase = getApiBaseUrl();

  const initialCredentials = useMemo(() => {
    return Object.fromEntries(
      integration.credentialFields.map((field) => [
        field.key,
        field.defaultValue ?? "",
      ])
    );
  }, [integration.credentialFields]);

  const filters = integration.backfillFilters?.length
    ? integration.backfillFilters
    : [defaultFilter];
  const initialFilter = filters[0]?.value ?? defaultFilter.value;

  const [mounted, setMounted] = useState(false);
  const [credentials, setCredentials] =
    useState<Record<string, string>>(initialCredentials);

  const [connectStatus, setConnectStatus] =
    useState<ConnectStatus>("idle");
  const [connectMessage, setConnectMessage] = useState<string | null>(null);

  const [eventStatus, setEventStatus] =
    useState<TestEventStatus>("idle");
  const [eventMessage, setEventMessage] = useState<string | null>(null);

  const [statusLoading, setStatusLoading] = useState(false);
  const [statusResponse, setStatusResponse] =
    useState<StatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [intervalMinutes, setIntervalMinutes] = useState(
    integration.defaultAutoImportIntervalMinutes ?? 60
  );
  const [lookbackHours, setLookbackHours] = useState(
    integration.defaultAutoImportLookbackHours ?? 2
  );
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [lastSuccessAt, setLastSuccessAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const [runNowLoading, setRunNowLoading] = useState(false);
  const [runNowMessage, setRunNowMessage] = useState<string | null>(null);

  const [importFrom, setImportFrom] = useState(
    integration.defaultBackfillFrom ?? isoYmdLocal(new Date(Date.now() - 86400000))
  );
  const [importTo, setImportTo] = useState(
    integration.defaultBackfillTo ?? isoYmdLocal(new Date())
  );
  const [importFilter, setImportFilter] = useState(initialFilter);
  const [importStatus, setImportStatus] =
    useState<ImportStatus>("idle");
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [viewOrdersHref, setViewOrdersHref] = useState<string | null>(null);
  const [lastImport, setLastImport] = useState<LastImportState | null>(null);

  const postbackUrl = useMemo(() => {
    if (!integration.postbackPath) return null;
    return `${apiBase}${integration.postbackPath}`;
  }, [apiBase, integration.postbackPath]);

  const lastImportKey = `tracekit:lastImport:${apiPlatform}`;

  const refreshStatus = useCallback(async () => {
    if (!integration.statusPath) return;

    setStatusLoading(true);
    setStatusError(null);

    try {
      const json = await apiGetJson<StatusResponse>(integration.statusPath);
      setStatusResponse(json);

      if (!json.ok) {
        setStatusError(json.message || "Status unavailable.");
      }
    } catch (error) {
      setStatusResponse(null);
      setStatusError(
        error instanceof Error ? error.message : "Status unavailable."
      );
    } finally {
      setStatusLoading(false);
    }
  }, [integration.statusPath]);

  const loadSettings = useCallback(async () => {
    if (!integration.settingsPath) return;

    setSettingsLoading(true);
    setSettingsMessage(null);

    try {
      const json = await apiGetJson<SettingsResponse>(integration.settingsPath);
      if (!json.ok) throw new Error(json.message || "Settings unavailable.");

      setAutoEnabled(Boolean(json.auto_import_enabled));
      setIntervalMinutes(
        Number(
          json.auto_import_interval_minutes ??
            integration.defaultAutoImportIntervalMinutes ??
            60
        ) || 60
      );
      setLookbackHours(
        Number(
          json.auto_import_lookback_hours ??
            integration.defaultAutoImportLookbackHours ??
            2
        ) || 2
      );
      setLastRunAt(json.last_run_at ?? null);
      setLastSuccessAt(json.last_success_at ?? null);
      setLastError(json.last_error ?? null);
    } catch (error) {
      setSettingsMessage(
        error instanceof Error ? error.message : "Settings unavailable."
      );
    } finally {
      setSettingsLoading(false);
    }
  }, [
    integration.defaultAutoImportIntervalMinutes,
    integration.defaultAutoImportLookbackHours,
    integration.settingsPath,
  ]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    void refreshStatus();
    void loadSettings();
  }, [loadSettings, mounted, refreshStatus]);

  useEffect(() => {
    if (!mounted || !integration.backfillPath) return;

    const saved = loadLastImport(lastImportKey, apiPlatform);
    if (!saved) return;

    setLastImport(saved);
    setImportFrom(saved.from);
    setImportTo(saved.to);
    setImportFilter(saved.filter || initialFilter);
    setImportStatus("done");
    setImportMessage(
      `Last import: ${saved.upserted} orders (fetched ${saved.fetched}) - pages ${saved.pages} - ${toLocalDateTimeLabel(
        saved.importedAt
      )}`
    );
    setViewOrdersHref(buildOrdersUrl(apiPlatform, saved.from, saved.to));
  }, [
    apiPlatform,
    initialFilter,
    integration.backfillPath,
    lastImportKey,
    mounted,
  ]);

  function updateCredential(key: string, value: string) {
    setCredentials((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function resetCredentials() {
    setCredentials(initialCredentials);
    setConnectStatus("idle");
    setConnectMessage(null);
  }

  async function connect() {
    const missingField = integration.credentialFields.find(
      (field) => field.required && !credentials[field.key]?.trim()
    );

    if (missingField) {
      setConnectStatus("error");
      setConnectMessage(`${missingField.label} is required.`);
      return;
    }

    const ctrl = new AbortController();
    const timeout = window.setTimeout(() => ctrl.abort(), 20000);

    try {
      setConnectStatus("connecting");
      setConnectMessage(null);

      if (integration.testConnectionPath && integration.saveCredentialsPath) {
        const body = {
          platform: apiPlatform,
          ...credentials,
        };

        const test = await apiPostJson<ApiResponse>(
          integration.testConnectionPath,
          body,
          { signal: ctrl.signal }
        );

        if (!test.ok) {
          setConnectStatus("error");
          setConnectMessage(test.message || "Connection test failed.");
          return;
        }

        const saved = await apiPostJson<ApiResponse>(
          integration.saveCredentialsPath,
          body,
          { signal: ctrl.signal }
        );

        if (!saved.ok) {
          setConnectStatus("error");
          setConnectMessage(
            saved.message || "Test succeeded, but saving failed."
          );
          return;
        }

        setConnectStatus("connected");
        setConnectMessage(saved.message || test.message || "Connected & saved.");
        clearSecretFields();
        void refreshStatus();
        void loadSettings();
        return;
      }

      if (!integration.connectPath) {
        setConnectStatus("error");
        setConnectMessage("No connection endpoint is configured.");
        return;
      }

      const json = await apiPostJson<ApiResponse>(
        integration.connectPath,
        credentials,
        { signal: ctrl.signal }
      );

      if (!json.ok) {
        throw new Error(json.message || "Connection failed.");
      }

      setConnectStatus("connected");
      setConnectMessage(`${integration.name} connected successfully.`);
      clearSecretFields();
      void refreshStatus();
      void loadSettings();
    } catch (error) {
      setConnectStatus("error");
      setConnectMessage(
        isAbortError(error)
          ? "Request timed out (20s). Check API reachability / WAF / whitelist."
          : error instanceof Error
            ? error.message
            : "Network error while connecting."
      );
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function clearSecretFields() {
    const secretKeys = integration.credentialFields
      .filter((field) => field.type === "password")
      .map((field) => field.key);

    if (!secretKeys.length) return;

    setCredentials((current) => {
      const next = { ...current };
      for (const key of secretKeys) next[key] = "";
      return next;
    });
  }

  async function saveSettings() {
    if (!integration.settingsPath) return;

    setSettingsSaving(true);
    setSettingsMessage(null);

    try {
      const json = await apiPostJson<ApiResponse>(integration.settingsPath, {
        auto_import_enabled: Boolean(autoEnabled),
        auto_import_interval_minutes: clampNumber(intervalMinutes, 15, 1440, 60),
        auto_import_lookback_hours: clampNumber(lookbackHours, 1, 168, 2),
      });

      if (!json.ok) throw new Error(json.message || "Failed to save settings.");

      setSettingsMessage(json.message || "Saved.");
      await loadSettings();
    } catch (error) {
      setSettingsMessage(
        error instanceof Error ? error.message : "Failed to save settings."
      );
    } finally {
      setSettingsSaving(false);
    }
  }

  async function runNow() {
    if (!integration.runNowPath) return;

    const from = importFrom.trim();
    const to = importTo.trim();

    if (!from || !to) {
      setRunNowMessage(
        "from/to are required (YYYY-MM-DD). Set Import Orders range first."
      );
      return;
    }

    setRunNowLoading(true);
    setRunNowMessage(null);

    try {
      const json = await apiPostJson<ImportResponse>(integration.runNowPath, {
        from,
        to,
        filter: importFilter || "all_sales",
        lookback_hours: clampNumber(lookbackHours, 1, 168, 2),
      });

      if (!json.ok) throw new Error(json.message || "Run failed.");

      setRunNowMessage(formatImportMessage(json, "Imported"));
      await loadSettings();
      void refreshStatus();
    } catch (error) {
      setRunNowMessage(error instanceof Error ? error.message : "Run failed.");
    } finally {
      setRunNowLoading(false);
    }
  }

  async function importOrders() {
    if (!integration.backfillPath) return;

    const from = importFrom.trim();
    const to = importTo.trim();

    if (!from || !to) {
      setImportStatus("error");
      setImportMessage("from/to are required (YYYY-MM-DD).");
      return;
    }

    if (
      integration.backfillMode === "async_job" &&
      integration.backfillJobStatusPath
    ) {
      await importOrdersWithJobPolling(from, to);
      return;
    }

    const ctrl = new AbortController();
    const timeout = window.setTimeout(
      () => ctrl.abort(),
      integration.backfillTimeoutMs ?? 60000
    );

    try {
      setImportStatus("importing");
      setImportMessage(null);
      setViewOrdersHref(null);

      const json = await apiPostJson<ImportResponse>(
        integration.backfillPath,
        { from, to, filter: importFilter },
        { signal: ctrl.signal }
      );

      if (!json.ok) {
        setImportStatus("error");
        setImportMessage(json.message || "Import failed.");
        return;
      }

      finishImport(from, to, importFilter, json);
      void refreshStatus();
      void loadSettings();
    } catch (error) {
      setImportStatus("error");
      setImportMessage(
        isAbortError(error)
          ? "Import timed out (60s). Try a smaller date range."
          : error instanceof Error
            ? error.message
            : "Import failed."
      );
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function importOrdersWithJobPolling(from: string, to: string) {
    if (!integration.backfillPath || !integration.backfillJobStatusPath) return;

    try {
      setImportStatus("importing");
      setImportMessage("Starting background import...");
      setViewOrdersHref(null);

      const start = await apiPostJson<ImportResponse>(integration.backfillPath, {
        from,
        to,
        filter: importFilter,
      });

      if (!start.ok) {
        setImportStatus("error");
        setImportMessage(start.message || "Import failed to start.");
        return;
      }

      const jobId = start.job_id ? String(start.job_id) : "";

      if (!jobId) {
        finishImport(from, to, importFilter, start);
        return;
      }

      let lastJob = start.job ?? null;
      setImportMessage(`Import queued. Job ID: ${jobId}`);

      for (;;) {
        await sleep(2000);

        const status = await apiGetJson<ImportResponse>(
          `${integration.backfillJobStatusPath}?job_id=${encodeURIComponent(
            jobId
          )}`
        );

        if (!status.ok) {
          setImportStatus("error");
          setImportMessage(status.message || "Could not check import status.");
          return;
        }

        const job = status.job ?? null;
        lastJob = job;
        const jobStatus = String(job?.status ?? status.status ?? "running");

        setImportMessage(
          `Import ${jobStatus}... fetched ${job?.fetched ?? 0} - upserted ${
            job?.upserted ?? 0
          } - pages ${job?.pages ?? 0}`
        );

        if (jobStatus === "completed") break;

        if (jobStatus === "failed" || jobStatus === "cancelled") {
          setImportStatus("error");
          setImportMessage(job?.error || `Import ${jobStatus}.`);
          return;
        }
      }

      finishImport(from, to, importFilter, {
        ok: true,
        fetched: lastJob?.fetched,
        upserted: lastJob?.upserted,
        pages: lastJob?.pages,
      });
      void refreshStatus();
      void loadSettings();
    } catch (error) {
      setImportStatus("error");
      setImportMessage(error instanceof Error ? error.message : "Import failed.");
    }
  }

  function finishImport(
    from: string,
    to: string,
    filter: string,
    response: ImportResponse
  ) {
    setImportStatus("done");
    setImportMessage(formatImportMessage(response, "Imported"));

    const href = buildOrdersUrl(
      apiPlatform,
      from,
      to,
      filter === "all_sales" ? undefined : filter.toUpperCase()
    );
    setViewOrdersHref(href);

    const saved: LastImportState = {
      platform: apiPlatform,
      from,
      to,
      filter,
      fetched: Number(response.fetched ?? 0),
      upserted: Number(response.upserted ?? 0),
      pages: Number(response.pages ?? 0),
      importedAt: new Date().toISOString(),
    };

    saveLastImport(lastImportKey, saved);
    setLastImport(saved);
  }

  async function sendTestEvent(type: IntegrationTestEvent) {
    if (!integration.postbackPath) return;

    const amount =
      type === "sale"
        ? 100
        : type === "chargeback_fee"
          ? 15
          : type === "bank_fee"
            ? 3.5
            : 25;

    try {
      setEventStatus("sending");
      setEventMessage(null);

      const timestamp = Date.now();
      const json = await apiPostJson<ApiResponse>(integration.postbackPath, {
        type,
        status: type,
        order_id: `TEST-${timestamp}`,
        transaction_id: `${type.toUpperCase()}-${timestamp}`,
        amount,
        currency: "USD",
        event_source: "manual",
		ingestion_method: "manual_postback",
		connector_id: "manual_postback_default",
        platform: integration.id,
        reason: `${integration.name} wizard test`,
      });

      if (!json.ok) {
        throw new Error(json.message || "Test event failed.");
      }

      const ledger = json.ledger as { amount?: unknown } | undefined;

      setEventStatus("success");
      setEventMessage(
        `${type.replaceAll("_", " ")} inserted successfully. Ledger amount: ${
          ledger?.amount ?? "n/a"
        }`
      );
    } catch (error) {
      setEventStatus("error");
      setEventMessage(
        error instanceof Error ? error.message : "Test event failed."
      );
    }
  }

  const connected = Boolean(statusResponse?.ok && statusResponse.connected);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-white p-5 dark:bg-ink/60">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">{integration.name}</h1>
            <p className="mt-1 max-w-3xl text-sm text-gray-600 dark:text-gray-300">
              {integration.description}
            </p>
          </div>

          {integration.statusPath ? (
            <StatusPill
              connected={connected}
              pending={connectStatus === "connecting"}
              errored={connectStatus === "error"}
            />
          ) : null}
        </div>
      </section>

      {integration.statusPath ? (
        <section className="rounded-lg border bg-white p-5 dark:bg-ink/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Connection status</h2>
              <p className="mt-1 text-xs text-gray-500">
                Reads saved credentials without showing secrets.
              </p>
            </div>
            <button
              type="button"
              onClick={refreshStatus}
              disabled={statusLoading}
              className="rounded-md border px-3 py-2 text-sm disabled:opacity-60"
            >
              {statusLoading ? "Refreshing..." : "Refresh status"}
            </button>
          </div>

          {statusError ? (
            <Message tone="warning" title="Status unavailable">
              {statusError}
            </Message>
          ) : null}

          <div className="mt-4 rounded-md border bg-gray-50 px-3 py-2 text-sm dark:bg-slate2/30">
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Stat label="Connected" value={String(connected)} />
              <Stat label="Base URL" value={statusResponse?.baseUrl || "-"} mono />
              {statusResponse?.apiVersion ? (
                <Stat label="API Version" value={statusResponse.apiVersion} mono />
              ) : null}
              {statusResponse?.username ? (
                <Stat label="Username" value={statusResponse.username} mono />
              ) : null}
              <Stat
                label="Updated"
                value={toLocalDateTimeLabel(statusResponse?.updated_at)}
              />
            </div>
          </div>
        </section>
      ) : null}

      {integration.settingsPath ? (
        <section className="rounded-lg border bg-white p-5 dark:bg-ink/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Auto-import</h2>
              <p className="mt-1 text-xs text-gray-500">
                Runs on the saved import schedule and pulls the last N hours.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={loadSettings}
                disabled={settingsLoading}
                className="rounded-md border px-3 py-2 text-sm disabled:opacity-60"
              >
                {settingsLoading ? "Loading..." : "Reload"}
              </button>
              {integration.runNowPath ? (
                <button
                  type="button"
                  onClick={runNow}
                  disabled={runNowLoading}
                  className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-60 dark:bg-white dark:text-black"
                >
                  {runNowLoading ? "Running..." : "Force update"}
                </button>
              ) : null}
            </div>
          </div>

          {settingsMessage ? <Message>{settingsMessage}</Message> : null}
          {runNowMessage ? <Message>{runNowMessage}</Message> : null}

          <div className="mt-4 grid grid-cols-1 items-end gap-3 md:grid-cols-3">
            <label className="text-sm">
              <div className="mb-1 text-xs text-gray-500">Enabled</div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoEnabled}
                  onChange={(event) => setAutoEnabled(event.target.checked)}
                />
                <span>Auto-import hourly</span>
              </div>
            </label>

            <label className="text-sm">
              <div className="mb-1 text-xs text-gray-500">
                Interval (minutes)
              </div>
              <input
                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm font-mono"
                value={String(intervalMinutes)}
                onChange={(event) =>
                  setIntervalMinutes(Number(event.target.value) || 60)
                }
                placeholder="60"
              />
            </label>

            <label className="text-sm">
              <div className="mb-1 text-xs text-gray-500">Lookback (hours)</div>
              <input
                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm font-mono"
                value={String(lookbackHours)}
                onChange={(event) =>
                  setLookbackHours(Number(event.target.value) || 2)
                }
                placeholder="2"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={saveSettings}
              disabled={settingsSaving}
              className="rounded-md border px-3 py-2 text-sm disabled:opacity-60"
            >
              {settingsSaving ? "Saving..." : "Save settings"}
            </button>
            <div className="text-xs text-gray-500">
              Last run:{" "}
              <span className="font-mono">{toLocalDateTimeLabel(lastRunAt)}</span>{" "}
              - Last success:{" "}
              <span className="font-mono">
                {toLocalDateTimeLabel(lastSuccessAt)}
              </span>
            </div>
          </div>

          {lastError ? (
            <Message tone="error" title="Last error">
              {lastError}
            </Message>
          ) : null}
        </section>
      ) : null}

      {integration.credentialFields.length > 0 ? (
        <section className="rounded-lg border bg-white p-5 dark:bg-ink/60">
          <h2 className="font-semibold">Connect</h2>

          {integration.documentation?.credentialInstructions ? (
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-gray-600 dark:text-gray-300">
              {integration.documentation.credentialInstructions.map(
                (instruction) => (
                  <li key={instruction}>{instruction}</li>
                )
              )}
            </ol>
          ) : null}

          {connectMessage ? (
            <Message tone={connectStatus === "error" ? "error" : "success"}>
              {connectMessage}
            </Message>
          ) : null}

          <div className="mt-4 grid max-w-2xl gap-3 md:grid-cols-2">
            {integration.credentialFields.map((field) => (
              <label
                key={field.key}
                className={field.type === "password" ? "md:col-span-2" : ""}
              >
                <div className="mb-1 text-sm font-medium">{field.label}</div>
                <input
                  type={
                    field.type === "password"
                      ? "password"
                      : field.type === "url"
                        ? "url"
                        : "text"
                  }
                  value={credentials[field.key] ?? ""}
                  placeholder={field.placeholder}
                  autoComplete={field.autoComplete}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(event) =>
                    updateCredential(field.key, event.target.value)
                  }
                  className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                />

                {field.helpText ? (
                  <div className="mt-1 text-xs text-gray-500">
                    {field.helpText}
                  </div>
                ) : null}
              </label>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {integration.supportsTestConnection ||
            integration.connectPath ||
            integration.testConnectionPath ? (
              <button
                type="button"
                onClick={connect}
                disabled={connectStatus === "connecting"}
                className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-60 dark:bg-white dark:text-black"
              >
                {connectStatus === "connecting"
                  ? "Connecting..."
                  : integration.testConnectionPath
                    ? "Test & Save"
                    : `Connect ${integration.name}`}
              </button>
            ) : null}

            <button
              type="button"
              onClick={resetCredentials}
              className="rounded-md border px-3 py-2 text-sm"
            >
              Reset
            </button>
          </div>
        </section>
      ) : null}

      {postbackUrl ? (
        <section className="rounded-lg border bg-white p-5 dark:bg-ink/60">
          <h2 className="font-semibold">Webhook / Postback</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Send JSON events to this endpoint.
          </p>

          <CopyField label="Postback URL" value={postbackUrl} />

          {integration.documentation?.installInstructions ? (
            <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-gray-600 dark:text-gray-300">
              {integration.documentation.installInstructions.map(
                (instruction) => (
                  <li key={instruction}>{instruction}</li>
                )
              )}
            </ol>
          ) : null}
        </section>
      ) : null}

      {integration.supportsBackfill && integration.backfillPath ? (
        <section className="rounded-lg border bg-white p-5 dark:bg-ink/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Import Orders</h2>
              <p className="mt-1 text-xs text-gray-500">
                Pulls transactions and upserts into{" "}
                <span className="font-mono">platform_orders</span>.
              </p>
            </div>
            <div className="text-xs text-gray-500">
              {importStatus === "importing" ? "importing..." : ""}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 items-end gap-3 md:grid-cols-4">
            <label className="text-sm">
              <div className="mb-1 font-medium">From</div>
              <input
                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm font-mono"
                value={importFrom}
                onChange={(event) => setImportFrom(event.target.value)}
                placeholder="YYYY-MM-DD"
              />
            </label>

            <label className="text-sm">
              <div className="mb-1 font-medium">To</div>
              <input
                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm font-mono"
                value={importTo}
                onChange={(event) => setImportTo(event.target.value)}
                placeholder="YYYY-MM-DD"
              />
            </label>

            <label className="text-sm">
              <div className="mb-1 font-medium">Filter</div>
              <select
                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                value={importFilter}
                onChange={(event) => setImportFilter(event.target.value)}
              >
                {filters.map((filter) => (
                  <option key={filter.value} value={filter.value}>
                    {filter.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={importOrders}
              disabled={importStatus === "importing"}
              className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-60 dark:bg-white dark:text-black"
            >
              {importStatus === "importing" ? "Importing..." : "Import"}
            </button>
          </div>

          {importMessage ? (
            <Message tone={importStatus === "error" ? "error" : "success"}>
              {importMessage}
            </Message>
          ) : null}

          {mounted && lastImport ? (
            <div className="mt-4 rounded-md border bg-gray-50 px-3 py-2 text-xs text-gray-700 dark:bg-slate2/30 dark:text-gray-300">
              <div className="font-medium">Last import</div>
              <div className="mt-1 space-y-0.5">
                <div>
                  Range: <span className="font-mono">{lastImport.from}</span>{" "}
                  - <span className="font-mono">{lastImport.to}</span>
                </div>
                <div>
                  Filter: <span className="font-mono">{lastImport.filter}</span>
                </div>
                <div>
                  Orders: {lastImport.upserted} (fetched {lastImport.fetched})
                  {" "} - pages {lastImport.pages}
                </div>
                <div>Imported at: {toLocalDateTimeLabel(lastImport.importedAt)}</div>
              </div>
            </div>
          ) : null}

          {viewOrdersHref ? (
            <div className="mt-4 text-sm">
              <Link
                href={viewOrdersHref}
                className="inline-flex items-center gap-2 underline underline-offset-2"
              >
                View imported orders
              </Link>
              <div className="mt-1 font-mono text-xs text-gray-500">
                {viewOrdersHref}
              </div>
            </div>
          ) : null}

          {mounted ? (
            <div className="mt-4 text-xs text-gray-500">
              Tip: for last {lookbackHours} hours, try{" "}
              <span className="font-mono">
                {buildOrdersUrl(
                  apiPlatform,
                  isoYmdLocal(new Date(Date.now() - lookbackHours * 3600000)),
                  isoYmdLocal(new Date())
                )}
              </span>
            </div>
          ) : null}
        </section>
      ) : null}

      {integration.supportsTestEvents && integration.testEvents ? (
        <section className="rounded-lg border bg-white p-5 dark:bg-ink/60">
          <h2 className="font-semibold">Verify</h2>

          <div className="mt-3 flex flex-wrap gap-2">
            {integration.testEvents.map((eventType) => (
              <button
                key={eventType}
                type="button"
                onClick={() => sendTestEvent(eventType)}
                disabled={eventStatus === "sending"}
                className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
              >
                Send test {eventType.replaceAll("_", " ")}
              </button>
            ))}
          </div>

          {eventMessage ? (
            <Message tone={eventStatus === "error" ? "error" : "success"}>
              {eventMessage}
            </Message>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function StatusPill({
  connected,
  pending,
  errored,
}: {
  connected: boolean;
  pending: boolean;
  errored: boolean;
}) {
  const cls = connected
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : pending
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : errored
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-gray-200 bg-gray-50 text-gray-700";

  return (
    <span className={["rounded-full border px-3 py-1 text-xs", cls].join(" ")}>
      {connected ? "Connected" : pending ? "Connecting" : "Not connected"}
    </span>
  );
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <span className="text-xs text-gray-500">{label}</span>
      <div className={mono ? "font-mono text-xs" : "text-xs"}>{value}</div>
    </div>
  );
}

function Message({
  children,
  title,
  tone = "neutral",
}: {
  children: string;
  title?: string;
  tone?: "neutral" | "success" | "warning" | "error";
}) {
  const cls =
    tone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-900"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-gray-200 bg-gray-50 text-gray-800";

  return (
    <div className={["mt-4 rounded-md border px-3 py-2 text-sm", cls].join(" ")}>
      {title ? <div className="font-semibold">{title}</div> : null}
      <div className={title ? "mt-1 font-mono text-xs" : ""}>{children}</div>
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-4">
      <div className="mb-1 text-xs text-gray-500">{label}</div>
      <div className="flex">
        <input
          readOnly
          value={value}
          className="w-full rounded-l-md border bg-transparent px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(value)}
          className="rounded-r-md border border-l-0 px-3 py-2 text-sm"
        >
          Copy
        </button>
      </div>
    </div>
  );
}

function buildOrdersUrl(
  platform: string,
  from: string,
  to: string,
  status?: string
) {
  const params = new URLSearchParams({
    platform,
    from,
    to,
    limit: "200",
  });

  if (status) params.set("status", status);

  return `/orders?${params.toString()}`;
}

function toLocalDateTimeLabel(iso?: string | null) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleString();
}

function isoYmdLocal(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function clampNumber(
  value: number,
  min: number,
  max: number,
  fallback: number
) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function formatImportMessage(response: ImportResponse, fallbackVerb: string) {
  return (
    response.message ||
    `${fallbackVerb} ${Number(response.upserted ?? 0)} orders (fetched ${Number(
      response.fetched ?? 0
    )}) - pages ${Number(response.pages ?? 0)}`
  );
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function loadLastImport(key: string, platform: string): LastImportState | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<LastImportState> | null;
    if (!parsed || parsed.platform !== platform || !parsed.from || !parsed.to) {
      return null;
    }

    return {
      platform,
      from: String(parsed.from),
      to: String(parsed.to),
      filter: String(parsed.filter ?? "all_sales"),
      fetched: Number(parsed.fetched ?? 0),
      upserted: Number(parsed.upserted ?? 0),
      pages: Number(parsed.pages ?? 0),
      importedAt: String(parsed.importedAt ?? new Date().toISOString()),
    };
  } catch {
    return null;
  }
}

function saveLastImport(key: string, value: LastImportState) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local storage is a convenience cache only.
  }
}
