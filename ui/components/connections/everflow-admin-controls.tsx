"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ConnectionExperience } from "@/lib/commerce/integration-experience";

export function EverflowNetworkSelector({ connections, selectedId }: { connections: ConnectionExperience[]; selectedId?: string }) {
  const everflow = connections.filter((connection) => connection.provider === "everflow");
  if (!everflow.length) return null;
  return <section className="mt-6 rounded-2xl border border-white/10 bg-white/[.035] p-5">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="tk-label">Everflow networks</p>
        <h2 className="mt-2 text-sm font-semibold">{everflow.length} connected instance{everflow.length === 1 ? "" : "s"}</h2>
        <p className="mt-2 text-xs text-slate-500">Select a network to view and operate only that connection.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {everflow.map((connection) => <Link key={connection.id} href={`/connections/commerce/${connection.id}`} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${connection.id === selectedId ? "border-cyan/40 bg-cyan/10 text-cyan-100" : "border-white/10 bg-white/[.03] text-slate-300 hover:border-white/20"}`}>
          {connection.displayName}{connection.providerAccountLabel ? ` · NID ${connection.providerAccountLabel}` : ""}
        </Link>)}
      </div>
    </div>
  </section>;
}

export function EverflowManualSync({ connection }: { connection: ConnectionExperience }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const router = useRouter();
  if (connection.provider !== "everflow" || !connection.canManage) return null;

  async function run() {
    setBusy(true); setNotice(null);
    try {
      const response = await fetch(`/api/commerce/connections/${connection.id}/sync-now`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const result = await response.json().catch(() => ({})) as { message?: string; code?: string };
      if (!response.ok) throw new Error(result.message || result.code || "Manual Everflow sync was not started.");
      setNotice(`Sync started for ${connection.displayName}${connection.providerAccountLabel ? ` (NID ${connection.providerAccountLabel})` : ""}.`);
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Manual Everflow sync was not started.");
    } finally { setBusy(false); }
  }

  return <section className="mt-4 rounded-2xl border border-white/10 bg-white/[.035] p-5">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><p className="tk-label">Manual synchronization</p><h2 className="mt-2 text-sm font-semibold">{connection.displayName}{connection.providerAccountLabel ? ` · NID ${connection.providerAccountLabel}` : ""}</h2><p className="mt-2 text-xs text-slate-500">Runs only this selected Everflow connection through the guarded server sync path.</p></div>
      <button type="button" onClick={run} disabled={busy} className="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50">{busy ? "Starting…" : "Run Sync"}</button>
    </div>
    {notice ? <p role="status" className="mt-3 text-xs text-slate-400">{notice}</p> : null}
  </section>;
}
