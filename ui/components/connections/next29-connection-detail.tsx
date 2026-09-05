"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Database, RefreshCw, ShieldCheck } from "lucide-react";
import { NEXT29_CAPABILITIES, type ConnectionExperience } from "@/lib/commerce/integration-experience";
import { readCommerceActionResponse } from "@/lib/commerce/action-response";

export function Next29ConnectionDetail({ connection }: { connection: ConnectionExperience }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const capabilities = connection.capabilities.length ? connection.capabilities : NEXT29_CAPABILITIES;

  async function verify() {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/commerce/connections/${connection.id}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const result = await readCommerceActionResponse(response);
      if (!result.ok) throw new Error(result.message);
      setNotice("29Next read access verified successfully.");
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "29Next verification failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full bg-[#080a0f] text-slate-100">
      <div className="mx-auto max-w-[1360px] px-5 py-8 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="tk-brand-eyebrow text-[10px] font-semibold uppercase tracking-[.2em]">29Next · Commerce connection</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-.035em] sm:text-4xl">{connection.displayName}</h1>
            <p className="mt-3 text-sm text-slate-400">{connection.organizationName} · Read-only activation validation</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/connections/commerce" className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/[.04]">Back to Connections</Link>
            {connection.canManage ? <button onClick={verify} disabled={busy || connection.credential.status !== "active"} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-40"><RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />{busy ? "Verifying…" : "Verify Connection"}</button> : null}
          </div>
        </header>

        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          <Panel icon={<Database className="h-4 w-4" />} title="Store identity">
            <Rows rows={[["Provider", "29Next"], ["Environment", connection.environment], ["Store", connection.providerAccountLabel || "Pending"], ["Status", connection.status]]} />
          </Panel>
          <Panel icon={<ShieldCheck className="h-4 w-4" />} title="Credential health">
            <Rows rows={[["Credential", connection.credential.status], ["Version", connection.credential.version ? String(connection.credential.version) : "—"], ["Last verified", formatDate(connection.lastVerifiedAt)]]} />
            <p className="mt-4 text-xs leading-5 text-slate-500">The Admin API token is encrypted server-side and never returned to the browser.</p>
          </Panel>
          <Panel icon={<CheckCircle2 className="h-4 w-4" />} title="M12 activation state">
            <Rows rows={[["Orders", "Read-only"], ["Subscriptions", "Read-only"], ["Disputes", "Read-only"], ["Scheduled sync", "Disabled"]]} />
            <p className="mt-4 text-xs leading-5 text-amber-200">Live webhook registration and automatic production execution remain disabled until M12 validation is complete.</p>
          </Panel>
        </section>

        {notice ? <p role="status" className="mt-4 rounded-xl border border-white/10 bg-white/[.03] px-4 py-3 text-xs text-slate-300">{notice}</p> : null}

        <section className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[.03]">
          <div className="border-b border-white/10 px-5 py-4"><h2 className="font-semibold">29Next capabilities</h2><p className="mt-1 text-xs text-slate-500">Backend milestones M2–M12 exposed through the connection experience.</p></div>
          <div className="divide-y divide-white/10">
            {capabilities.map((capability) => <div key={capability.name} className="grid gap-3 px-5 py-4 sm:grid-cols-[220px_130px_1fr] sm:items-center"><strong className="text-sm">{capability.name}</strong><span className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.12em] ${capability.state === "supported" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "border-amber-400/25 bg-amber-400/10 text-amber-200"}`}>{capability.state.replaceAll("_", " ")}</span><p className="text-xs leading-5 text-slate-400">{capability.reason}</p></div>)}
          </div>
        </section>
      </div>
    </div>
  );
}

function Panel({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-white/10 bg-white/[.035] p-5"><div className="flex items-center gap-2"><span className="text-cyan-300">{icon}</span><h2 className="text-sm font-semibold">{title}</h2></div><div className="mt-4">{children}</div></section>;
}

function Rows({ rows }: { rows: Array<[string, string]> }) {
  return <dl className="space-y-3">{rows.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 text-xs"><dt className="text-slate-500">{label}</dt><dd className="text-right text-slate-200">{value}</dd></div>)}</dl>;
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not yet";
}
