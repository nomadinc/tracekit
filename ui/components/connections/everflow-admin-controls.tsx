"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ConnectionExperience } from "@/lib/commerce/integration-experience";

export function EverflowNetworkSelector({ connections, selectedId }: { connections: ConnectionExperience[]; selectedId?: string }) {
  const everflow = connections.filter((connection) => connection.provider === "everflow");
  if (!everflow.length) return null;
  return <section className="mt-6 rounded-2xl border border-white/10 bg-white/[.035] p-5"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="tk-label">Everflow networks</p><h2 className="mt-2 text-sm font-semibold">{everflow.length} connected instance{everflow.length === 1 ? "" : "s"}</h2><p className="mt-2 text-xs text-slate-500">Select a network to view and operate only that connection.</p></div><div className="flex flex-wrap gap-2">{everflow.map((connection) => <Link key={connection.id} href={`/connections/commerce/${connection.id}`} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${connection.id === selectedId ? "border-cyan/40 bg-cyan/10 text-cyan-100" : "border-white/10 bg-white/[.03] text-slate-300 hover:border-white/20"}`}>{connection.displayName}{connection.providerAccountLabel ? ` · NID ${connection.providerAccountLabel}` : ""}</Link>)}</div></div></section>;
}

export function EverflowManualSync({ connection }: { connection: ConnectionExperience }) {
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState<string | null>(null); const router = useRouter();
  if (connection.provider !== "everflow" || !connection.canManage) return null;
  const label = `${connection.displayName}${connection.providerAccountLabel ? ` · NID ${connection.providerAccountLabel}` : ""}`;
  async function run() { setBusy(true); setNotice(null); try { const response = await fetch(`/api/commerce/connections/${connection.id}/sync-now`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); const result = await response.json().catch(() => ({})) as { message?: string; code?: string }; if (!response.ok) throw new Error(result.message || result.code || "Manual Everflow sync was not started."); setNotice(`Sync started for ${label}. Refreshing run state…`); router.refresh(); window.setTimeout(() => router.refresh(), 2500); } catch (error) { setNotice(error instanceof Error ? error.message : "Manual Everflow sync was not started."); } finally { setBusy(false); } }
  return <section className="mt-4 rounded-2xl border border-cyan-400/30 bg-[#0b111a] p-5 shadow-lg shadow-black/20"><div className="flex flex-wrap items-center justify-between gap-5"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-cyan-300">Manual synchronization</p><h2 className="mt-2 text-base font-semibold text-white">{label}</h2><p className="mt-2 text-xs leading-5 text-slate-400">Runs only this selected Everflow connection through the guarded server sync path.</p></div><button type="button" onClick={run} disabled={busy} className="min-w-32 rounded-lg border border-cyan-300/50 bg-cyan-300 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-md transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Starting…" : "Run Sync"}</button></div>{notice ? <p role="status" className="mt-4 rounded-lg border border-white/10 bg-white/[.04] px-3 py-2 text-xs text-slate-300">{notice}</p> : null}</section>;
}
