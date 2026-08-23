"use client";

import { useEffect, useState } from "react";
import { Building2, RefreshCw } from "lucide-react";
import { AccessBoundary } from "@/components/identity/access-control";

 type AgencyClient = { organizationId: string; name: string; mark: string; accountId: string; active: boolean };

export function AgencyClientsWorkspace() {
  const [clients, setClients] = useState<AgencyClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/agency/clients", { cache: "no-store" });
      if (!response.ok) throw new Error("unavailable");
      const body = await response.json() as { clients: AgencyClient[] };
      setClients(body.clients || []);
    } catch { setError("Agency clients could not be loaded."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  return <AccessBoundary permission="organizations.view" variants={["agency"]}>
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 border-b pb-5 dark:border-white/10">
        <div><div className="text-[11px] font-semibold uppercase tracking-[.14em] text-slate-500">Agency</div><h1 className="mt-1 text-2xl font-semibold">Clients</h1><p className="mt-1 text-sm text-slate-500">Client Organizations assigned to this Agency Account. Client access remains separate from client administration.</p></div>
        <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold dark:border-white/10"><RefreshCw className="h-4 w-4"/>Refresh</button>
      </div>
      <div className="grid gap-4 md:grid-cols-3"><div className="rounded-2xl border p-5 dark:border-white/10"><div className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">Assigned clients</div><div className="mt-3 text-3xl font-semibold">{clients.length}</div></div><div className="rounded-2xl border p-5 dark:border-white/10 md:col-span-2"><div className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">Access model</div><div className="mt-3 text-sm text-slate-600 dark:text-slate-300">Agency assignment grants workspace visibility only. It does not create a Client Organization membership or grant client Team administration.</div></div></div>
      {error ? <div className="rounded-xl border border-red-200 p-4 text-sm text-red-700 dark:border-red-900/50 dark:text-red-300">{error}</div> : null}
      <div className="overflow-hidden rounded-2xl border dark:border-white/10"><div className="border-b px-5 py-4 dark:border-white/10"><div className="font-semibold">Assigned Client Organizations</div></div>{loading ? <div className="p-8 text-sm text-slate-500">Loading clients…</div> : clients.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No Client Organizations are currently assigned to this agency.</div> : <div className="divide-y dark:divide-white/10">{clients.map((client) => <div key={client.organizationId} className="flex items-center gap-4 px-5 py-4"><div className="flex h-10 w-10 items-center justify-center rounded-xl border dark:border-white/10"><Building2 className="h-4 w-4"/></div><div className="min-w-0 flex-1"><div className="font-semibold">{client.name}</div><div className="text-xs text-slate-500">Client Organization</div></div><span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-semibold uppercase text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">Assigned</span></div>)}</div>}</div>
    </div>
  </AccessBoundary>;
}
