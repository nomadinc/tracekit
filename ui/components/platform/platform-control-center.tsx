"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, Search, ShieldCheck } from "lucide-react";

type OrganizationRow = { id: string; name: string; agencyId: string | null; accountId: string; connectionCount: number; connectionState: "healthy" | "attention" | "none"; latestConnectionSuccessAt: string | null; unresolvedFinancialEvents: number; attentionCount: number };

export function PlatformControlCenter({
  organizations,
  agencies,
  canEnterClientView,
}: {
  organizations: OrganizationRow[];
  agencies: Array<{ id: string; name: string }>;
  canEnterClientView: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [agencyScope, setAgencyScope] = React.useState("all");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const visible = organizations.filter((organization) => {
    const agencyMatch = agencyScope === "all" || (agencyScope === "direct" ? !organization.agencyId : organization.agencyId === agencyScope);
    return agencyMatch && organization.name.toLowerCase().includes(query.trim().toLowerCase());
  });
  const agencyName = new Map(agencies.map((agency) => [agency.id, agency.name]));
  const agencyClients = organizations.filter((organization) => organization.agencyId).length;
  const directClients = organizations.length - agencyClients;
  const attentionRows = organizations.filter((organization) => organization.attentionCount > 0 || organization.connectionState !== "healthy").sort((a, b) => b.attentionCount - a.attentionCount || a.name.localeCompare(b.name));
  const attentionClients = attentionRows.length;

  async function enter(organizationId: string) {
    if (!canEnterClientView || busy) return;
    setBusy(organizationId);
    setError(null);
    try {
      const response = await fetch("/api/session/admin-view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      if (!response.ok) throw new Error("Client view could not be authorized.");
      router.push("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Client view could not be authorized.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="border-b border-white/10 pb-6">
        <p className="tk-brand-eyebrow text-[10px] font-semibold uppercase tracking-[.16em]">TraceKit Platform</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Client Health Control Center</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          Start from the client portfolio, then enter an explicitly scoped advertiser view to investigate that client&apos;s Offers, Customers, Orders, Money, and Connections.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Active clients" value={organizations.length} detail="Canonical active Organizations" />
        <Metric label="Needs attention" value={attentionClients} detail="Connection or reconciliation evidence requires review" />
        <Metric label="Agency clients" value={agencyClients} detail="Organizations attached to an Agency" />
        <Metric label="Direct clients" value={directClients} detail="Organizations outside an Agency" />
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[.025]">
        <div className="border-b border-white/10 p-5">
          <h2 className="text-lg font-semibold">Needs Attention</h2>
          <p className="mt-1 text-xs text-slate-500">Explicit connection and financial-reconciliation evidence requiring operator review.</p>
        </div>
        {attentionRows.length ? <div className="divide-y divide-white/10">{attentionRows.slice(0, 8).map((organization) => (
          <div key={`attention:${organization.id}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-sm font-semibold">{organization.name}</p><p className="mt-1 text-xs text-slate-500">{[organization.connectionState !== "healthy" ? organization.connectionState === "none" ? "No active connections" : "Connection requires attention" : null, organization.unresolvedFinancialEvents ? `${organization.unresolvedFinancialEvents} unresolved financial event${organization.unresolvedFinancialEvents === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")}</p></div>
            <button type="button" disabled={!canEnterClientView || Boolean(busy)} onClick={() => enter(organization.id)} className="tk-brand-link inline-flex items-center gap-2 text-xs font-semibold disabled:opacity-40">Investigate client <ArrowRight className="h-3.5 w-3.5" /></button>
          </div>
        ))}</div> : <p className="p-5 text-sm text-slate-500">No current connection or reconciliation attention evidence.</p>}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[.025]">
        <div className="flex flex-col gap-3 border-b border-white/10 p-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Client / Brand portfolio</h2>
            <p className="mt-1 text-xs text-slate-500">Choose an Agency first when applicable, then select one of its Client / Brand Organizations to establish the global advertiser data scope.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row"><select value={agencyScope} onChange={(event) => setAgencyScope(event.target.value)} className="rounded-xl border border-white/10 bg-[#10131a] px-3 py-2 text-sm text-slate-100"><option value="all">All clients / brands</option><option value="direct">Direct clients / brands</option>{agencies.map((agency) => <option key={agency.id} value={agency.id}>{agency.name}</option>)}</select><label className="flex min-w-64 items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 py-2">
            <Search className="h-4 w-4 text-slate-500" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search clients" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label></div>
        </div>
        {error ? <p className="m-4 rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-xs text-rose-300">{error}</p> : null}
        <div className="divide-y divide-white/10">
          {visible.map((organization) => (
            <div key={organization.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.3fr)_8rem_9rem_10rem_7rem_12rem] lg:items-center">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-400/10 text-blue-100">
                  {organization.agencyId ? <ShieldCheck className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                </span>
                <div>
                  <h3 className="font-semibold">{organization.name}</h3>
                  <p className="mt-1 text-[11px] text-slate-500">{organization.agencyId ? "Agency client / brand" : "Direct client / brand"}</p>
                </div>
              </div>
              <span className="text-xs text-slate-500">{organization.agencyId ? agencyName.get(organization.agencyId) || "Agency" : "Direct"}</span>
              <span className={`text-xs font-semibold ${organization.connectionState === "healthy" ? "text-emerald-300" : organization.connectionState === "attention" ? "text-amber-200" : "text-slate-500"}`}>{organization.connectionState === "healthy" ? `${organization.connectionCount} connected` : organization.connectionState === "attention" ? "Connection attention" : "No connections"}</span>
              <span className="text-xs text-slate-500">{organization.latestConnectionSuccessAt ? `Last success ${new Date(organization.latestConnectionSuccessAt).toLocaleString()}` : "No successful connection activity"}</span>
              <span className={organization.unresolvedFinancialEvents ? "text-xs font-semibold text-amber-200" : "text-xs text-slate-500"}>{organization.unresolvedFinancialEvents} unresolved financial</span>
              <button
                type="button"
                disabled={!canEnterClientView || Boolean(busy)}
                onClick={() => enter(organization.id)}
                className="tk-primary-action inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === organization.id ? "Entering…" : canEnterClientView ? "View as client" : "Owner access required"}
                {busy !== organization.id && canEnterClientView ? <ArrowRight className="h-3.5 w-3.5" /> : null}
              </button>
            </div>
          ))}
          {!visible.length ? <p className="p-8 text-center text-sm text-slate-500">No clients match this search.</p> : null}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[.025] p-5">
        <h2 className="text-sm font-semibold">Health interpretation</h2>
        <p className="mt-2 text-xs leading-5 text-slate-500">This view does not calculate a synthetic client health score. Attention is derived only from explicit connection state/errors and unresolved refund or chargeback reconciliation evidence. Attribution coverage is intentionally omitted until TraceKit has a qualified cross-provider denominator.</p>
      </section>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <article className="rounded-2xl border border-white/10 bg-white/[.035] p-4"><p className="tk-label">{label}</p><p className="mt-2 text-2xl font-semibold">{value.toLocaleString()}</p><p className="mt-1 text-[11px] text-slate-500">{detail}</p></article>;
}
