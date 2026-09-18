"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";

type MetaAccount = {
  id: string;
  connectionId: string;
  externalId: string;
  label: string | null;
  currency: string | null;
  timezoneName: string | null;
  status: string;
  selectedForSync: boolean;
  metadata: Record<string, unknown>;
};

type MetaConnection = {
  connectionId: string;
  displayName: string;
  status: string;
  reauthorizationRequired: boolean;
  providerIdentityId: string | null;
  connected: boolean;
  accountCount: number;
  selectedAccountCount: number;
  accounts: MetaAccount[];
};

type StatusResponse = {
  ok: boolean;
  connections?: MetaConnection[];
  message?: string;
};

function statusLabel(connection: MetaConnection) {
  if (connection.reauthorizationRequired) return "Reauthorization required";
  if (connection.status === "degraded") return "Needs attention";
  if (connection.connected) return "Connected";
  return connection.status || "Not connected";
}

export function MetaIntegrationPanel() {
  const [connections, setConnections] = useState<MetaConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingConnectionId, setSavingConnectionId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/v1/integrations/meta/status", { cache: "no-store", credentials: "same-origin" });
      const body = await response.json().catch(() => ({})) as StatusResponse;
      if (!response.ok || !body.ok) throw new Error(body.message || "TraceKit could not load Meta connection status.");
      const rows = body.connections || [];
      setConnections(rows);
      setSelected(Object.fromEntries(rows.map((connection) => [
        connection.connectionId,
        new Set(connection.accounts.filter((account) => account.selectedForSync).map((account) => account.id)),
      ])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "TraceKit could not load Meta connection status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("meta");
    if (result === "connected") setNotice(`Meta connected. ${params.get("accounts") || "0"} advertising account(s) discovered.`);
    else if (result === "permission") setError("Meta did not grant the required ads_read permission.");
    else if (result === "cancelled") setNotice("Meta authorization was cancelled. No connection changes were made.");
    else if (result === "state") setError("Meta authorization could not be verified. Start the connection again.");
    else if (result === "failed") setError("TraceKit could not complete the Meta connection.");
  }, []);

  const totalSelected = useMemo(
    () => Object.values(selected).reduce((sum, ids) => sum + ids.size, 0),
    [selected],
  );

  function toggle(connectionId: string, accountId: string) {
    setSelected((current) => {
      const next = new Set(current[connectionId] || []);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return { ...current, [connectionId]: next };
    });
  }

  function selectAll(connection: MetaConnection, checked: boolean) {
    setSelected((current) => ({
      ...current,
      [connection.connectionId]: checked ? new Set(connection.accounts.filter((account) => account.status !== "disabled").map((account) => account.id)) : new Set(),
    }));
  }

  async function save(connection: MetaConnection) {
    setSavingConnectionId(connection.connectionId);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/v1/integrations/meta/accounts", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: connection.connectionId, accountIds: Array.from(selected[connection.connectionId] || []) }),
      });
      const body = await response.json().catch(() => ({})) as { ok?: boolean; message?: string; selectedAccountCount?: number; schedulesActivated?: boolean };
      if (!response.ok || !body.ok) throw new Error(body.message || "TraceKit could not save Meta advertising accounts.");
      setNotice(`${body.selectedAccountCount || 0} Meta advertising account(s) selected. Syncing remains off until the next ingestion milestone.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "TraceKit could not save Meta advertising accounts.");
    } finally {
      setSavingConnectionId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card
        title="Meta Ads"
        right={(
          <a
            href="/v1/integrations/meta/oauth/start"
            className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
          >
            Connect Meta
          </a>
        )}
      >
        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
          <p>Connect one or more Meta authorizations, then choose which advertising accounts TraceKit should use.</p>
          <p className="text-xs">Read-only access only. TraceKit does not create or edit campaigns, ads, budgets, targeting, Pixels, or CAPI in this milestone.</p>
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Account selection does not start syncing yet. Campaign hierarchy and Insights ingestion are separate upcoming milestones.</p>
        </div>
      </Card>

      {notice ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{notice}</div> : null}
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{error}</div> : null}

      {loading ? <Card title="Connections"><p className="text-sm text-gray-600 dark:text-gray-300">Loading Meta connections…</p></Card> : null}

      {!loading && connections.length === 0 ? (
        <Card title="Connections">
          <p className="text-sm text-gray-600 dark:text-gray-300">No Meta authorization is connected yet. Use Connect Meta to discover the advertising accounts available to your Meta user.</p>
        </Card>
      ) : null}

      {connections.map((connection) => {
        const selectedIds = selected[connection.connectionId] || new Set<string>();
        const selectableIds = connection.accounts.filter((account) => account.status !== "disabled").map((account) => account.id);
        const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));
        return (
          <Card
            key={connection.connectionId}
            title={connection.displayName}
            right={<span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-white/10 dark:text-gray-200">{statusLabel(connection)}</span>}
          >
            <div className="space-y-4">
              <div className="grid gap-2 text-xs text-gray-600 dark:text-gray-300 sm:grid-cols-3">
                <div><span className="font-medium text-gray-900 dark:text-white">Discovered:</span> {connection.accountCount}</div>
                <div><span className="font-medium text-gray-900 dark:text-white">Selected:</span> {selectedIds.size}</div>
                <div><span className="font-medium text-gray-900 dark:text-white">Sync:</span> Off</div>
              </div>

              {connection.accounts.length ? (
                <div className="overflow-hidden rounded-lg border">
                  <div className="flex items-center justify-between border-b bg-gray-50 px-3 py-2 dark:bg-white/5">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input type="checkbox" checked={allSelected} onChange={(event) => selectAll(connection, event.target.checked)} />
                      Select all available accounts
                    </label>
                    <span className="text-xs text-gray-500">{connection.accounts.length} account(s)</span>
                  </div>
                  <div className="divide-y">
                    {connection.accounts.map((account) => (
                      <label key={account.id} className="flex cursor-pointer items-start gap-3 px-3 py-3 hover:bg-gray-50 dark:hover:bg-white/5">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selectedIds.has(account.id)}
                          disabled={account.status === "disabled"}
                          onChange={() => toggle(connection.connectionId, account.id)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{account.label || `Meta Ad Account ${account.externalId}`}</span>
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-white/10 dark:text-gray-300">{account.status}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                            <span>ID: {account.externalId}</span>
                            <span>Currency: {account.currency || "Unknown"}</span>
                            <span>Timezone: {account.timezoneName || "Unknown"}</span>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-300">This authorization did not expose any advertising accounts.</p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-gray-500">Selected accounts will be eligible for future hierarchy and Insights sync. No schedules are activated here.</p>
                <button
                  type="button"
                  onClick={() => void save(connection)}
                  disabled={savingConnectionId === connection.connectionId}
                  className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-white/5"
                >
                  {savingConnectionId === connection.connectionId ? "Saving…" : "Save account selection"}
                </button>
              </div>
            </div>
          </Card>
        );
      })}

      {!loading && connections.length > 0 ? (
        <div className="text-xs text-gray-500">{totalSelected} Meta advertising account(s) currently selected across {connections.length} authorization(s).</div>
      ) : null}
    </div>
  );
}
