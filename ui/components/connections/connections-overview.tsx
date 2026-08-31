"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowRight, Plug, X } from "lucide-react";
import {
  COMMAS_CAPABILITIES,
  EVERFLOW_CAPABILITIES,
  SHOPIFY_CAPABILITIES,
  PROVIDER_CATALOG,
  type ConnectionExperience,
  type SafeCapability,
} from "@/lib/commerce/integration-experience";
import { readCommerceActionResponse } from "@/lib/commerce/action-response";

type ConnectProvider = "commas" | "everflow" | "shopify";

const pill: Record<string, string> = {
  connected: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  unavailable: "border-slate-400/20 bg-slate-400/10 text-slate-300",
  degraded: "border-amber-400/25 bg-amber-400/10 text-amber-200",
  missing: "border-rose-400/25 bg-rose-400/10 text-rose-200",
};

function ProviderStatus({ value, label }: { value: string; label?: string }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.12em] ${pill[value] || pill.unavailable}`}>{label || value.replaceAll("_", " ")}</span>;
}

function capabilitiesFor(connection: ConnectionExperience): SafeCapability[] {
  if (connection.capabilities.length) return connection.capabilities;
  if (connection.provider === "everflow") return EVERFLOW_CAPABILITIES;
  if (connection.provider === "commas") return COMMAS_CAPABILITIES;
  if (connection.provider === "shopify") return SHOPIFY_CAPABILITIES;
  return [];
}

export function ConnectionsOverview({ connections }: { connections: ConnectionExperience[] }) {
  const [connectProvider, setConnectProvider] = useState<ConnectProvider | null>(null);
  const connected = connections.filter((connection) => connection.status === "connected").length;
  const healthy = connections.filter((connection) => connection.status === "connected" && connection.credential.status === "active").length;
  const available = PROVIDER_CATALOG.filter((provider) => provider.availability === "available").length;
  const lastVerified = connections.map((connection) => connection.lastVerifiedAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;

  return (
    <div className="min-h-full bg-[#080a0f] text-slate-100">
      <div className="mx-auto max-w-[1360px] px-5 py-8 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-6 border-b border-white/10 pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="tk-brand-eyebrow text-[10px] font-semibold uppercase tracking-[.2em]">Data infrastructure</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-.035em] sm:text-4xl">Connections</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Verified, Organization-bound systems that feed TraceKit&apos;s evidence and attribution layers.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <nav aria-label="Connection views" className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[.03] p-1">
              <Link href="/connections/commerce" className="tk-workspace-tab-active rounded-lg px-3 py-2 text-xs font-medium">Connections</Link>
              <Link href="/connections/sync-runs" className="tk-workspace-tab-inactive rounded-lg px-3 py-2 text-xs font-medium">Sync Runs</Link>
              <Link href="/connections/readiness" className="tk-workspace-tab-inactive rounded-lg px-3 py-2 text-xs font-medium">Readiness</Link>
            </nav>
            <Link href="/settings" className="tk-brand-link rounded-lg px-3 py-2 text-xs">Workspace settings</Link>
          </div>
        </header>

        <section aria-label="Connection summary" className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[["Connected", String(connected), `${healthy} healthy`], ["Available", String(available), `${PROVIDER_CATALOG.length} providers in catalog`], ["Provider catalog", String(PROVIDER_CATALOG.length), "Commerce + performance marketing"], ["Last verification", lastVerified ? formatDate(lastVerified) : "Not available", "Stored server state"]].map(([label, value, detail]) => (
            <div key={label} className="rounded-xl border border-white/10 bg-white/[.025] p-4"><p className="tk-label">{label}</p><p className="mt-2 text-xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-[11px] text-slate-500">{detail}</p></div>
          ))}
        </section>

        <section className="mt-8">
          <div className="mb-4"><h2 className="text-lg font-semibold">Data Connections</h2><p className="mt-1 text-xs text-slate-500">Secure provider credentials, verified account identity, capabilities, and operational health.</p></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {PROVIDER_CATALOG.map((provider) => {
              const providerConnections = connections.filter((item) => item.provider === provider.provider);
              const first = providerConnections[0];
              const connectable = provider.provider === "commas" || provider.provider === "everflow" || provider.provider === "shopify";
              return (
                <article key={provider.provider} className="group flex min-h-64 flex-col rounded-2xl border border-white/10 bg-gradient-to-b from-white/[.055] to-white/[.025] p-5 shadow-2xl shadow-black/20 transition hover:border-white/20">
                  <div className="flex items-start justify-between"><div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[.06]"><Plug className="h-5 w-5" /></div>{first ? <ProviderStatus value={first.status} /> : <ProviderStatus value="unavailable" label={provider.availability === "available" ? "Not Connected" : "Coming Soon"} />}</div>
                  <h3 className="mt-5 text-lg font-semibold">{provider.name}</h3>
                  {first ? (
                    <>
                      <p className="mt-1 text-xs text-slate-400">{first.displayName} · {first.organizationName}</p>
                      {first.providerAccountLabel ? <p className="mt-1 text-[11px] text-slate-500">Account / Store · {first.providerAccountLabel}</p> : null}
                      {first.lastVerifiedAt ? <p className="mt-1 text-[11px] text-slate-600">Verified · {formatDate(first.lastVerifiedAt)}</p> : null}
                      {providerConnections.length > 1 ? <p className="mt-1 text-[11px] text-cyan-300">{providerConnections.length} {provider.name} connections</p> : null}
                      <div className="mt-4 flex flex-wrap gap-1.5">{capabilitiesFor(first).slice(0, 4).map((capability) => <span key={capability.name} className="rounded-md bg-white/[.055] px-2 py-1 text-[10px] text-slate-300">{capability.name}</span>)}</div>
                      <div className="mt-auto flex flex-wrap items-center gap-4 pt-5">
                        <Link href={`/connections/commerce/${first.id}`} className="tk-brand-link inline-flex items-center gap-2 rounded-md text-xs font-semibold">View Connection <ArrowRight className="h-3.5 w-3.5" /></Link>
                        {provider.provider === "everflow" ? <button type="button" onClick={() => setConnectProvider("everflow")} className="text-xs font-semibold text-slate-400 hover:text-slate-200">Add Network</button> : null}
                        {provider.provider === "shopify" ? <button type="button" onClick={() => setConnectProvider("shopify")} className="text-xs font-semibold text-slate-400 hover:text-slate-200">Reconnect / Add Store</button> : null}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="mt-2 text-xs leading-5 text-slate-500">{provider.availability === "available" ? "Securely connect a provider account to begin verification." : "Provider adapter planned; no connection is active."}</p>
                      {connectable ? <button type="button" onClick={() => setConnectProvider(provider.provider as ConnectProvider)} className="tk-brand-link mt-auto inline-flex items-center gap-2 rounded-md pt-5 text-left text-xs font-semibold">Connect {provider.name} <ArrowRight className="h-3.5 w-3.5" /></button> : <span className="mt-auto pt-5 text-[10px] uppercase tracking-widest text-slate-600">Not available</span>}
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </div>
      {connectProvider ? <ConnectDialog provider={connectProvider} close={() => setConnectProvider(null)} /> : null}
    </div>
  );
}

function ConnectDialog({ provider, close }: { provider: ConnectProvider; close: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const setupRequestId = useRef<string | null>(null);
  const isEverflow = provider === "everflow";
  const isShopify = provider === "shopify";
  const providerName = isEverflow ? "Everflow" : isShopify ? "Shopify" : "Commas";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const target = event.currentTarget;
    const form = new FormData(target);

    try {
      if (isShopify) {
        const shop = String(form.get("shopDomain") || "").trim();
        const displayName = String(form.get("displayName") || "Shopify Store").trim();
        const params = new URLSearchParams({ shop, displayName });
        window.location.assign(`/api/shopify/oauth/start?${params.toString()}`);
        return;
      }

      setupRequestId.current ||= crypto.randomUUID();
      if (isEverflow) {
        const response = await fetch("/v1/integrations/everflow/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": setupRequestId.current },
          body: JSON.stringify({ displayName: form.get("displayName"), apiKey: form.get("apiKey"), networkId: form.get("networkId") }),
        });
        const result = await response.json().catch(() => null) as { ok?: boolean; message?: string; connectionId?: string } | null;
        if (!response.ok || !result?.ok || !result.connectionId) { setMessage(result?.message || "TraceKit could not verify the Everflow connection."); return; }
        target.reset(); setupRequestId.current = null; router.push(`/connections/commerce/${result.connectionId}`); router.refresh(); return;
      }

      const response = await fetch("/api/commerce/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": setupRequestId.current },
        body: JSON.stringify({ provider: "commas", displayName: form.get("displayName"), environment: form.get("environment"), apiKey: form.get("apiKey") }),
      });
      const result = await readCommerceActionResponse(response);
      if (!result.ok || !result.connectionId) { setMessage(result.ok ? "TraceKit returned an incomplete response." : result.message); return; }
      target.reset(); setupRequestId.current = null; router.push(`/connections/commerce/${result.connectionId}`); router.refresh();
    } catch {
      setMessage(`TraceKit could not reach the ${providerName} connection service. Please try again.`);
    } finally { setBusy(false); }
  }

  return (
    <Dialog title={`Connect ${providerName}`} close={close}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Display name"><input required name="displayName" autoComplete="off" className="input" placeholder={isEverflow ? "Accufy Everflow" : isShopify ? "Main Shopify Store" : "Push Button Systems"} /></Field>
        {!isEverflow && !isShopify ? <Field label="Environment"><select name="environment" className="input"><option value="production">Production</option><option value="sandbox">Sandbox</option></select></Field> : null}
        {isEverflow ? <Field label="Network ID (optional)"><input name="networkId" inputMode="numeric" pattern="[0-9]*" autoComplete="off" className="input" placeholder="Leave blank to discover from Everflow" /></Field> : null}
        {isShopify ? <Field label="Shop domain"><input required name="shopDomain" autoComplete="off" className="input" placeholder="your-store.myshopify.com" /></Field> : null}
        {!isShopify ? <Field label="API key"><input required minLength={8} name="apiKey" type="password" autoComplete="new-password" className="input" placeholder="Stored encrypted; never shown again" /></Field> : null}
        <p className="text-[11px] leading-5 text-slate-500">Organization scope is derived from your authenticated TraceKit session. {isShopify ? "You will be redirected to Shopify to authorize TraceKit. Shopify returns a store-specific Admin API token directly to TraceKit; you never paste that token into this form." : "The API key is sent only to the authorized server operation and is never returned to the browser."}</p>
        {isShopify ? <p className="rounded-xl border border-white/10 bg-white/[.03] px-3 py-2 text-[11px] leading-5 text-slate-400">TraceKit requests read access for products, customers, orders, and historical orders. M4 remains bounded and read-only; scheduled or broad historical synchronization is not enabled by this step.</p> : null}
        {busy ? <div aria-live="polite" className="rounded-xl border border-cyan/20 bg-cyan/5 px-3 py-3 text-xs text-cyan-100"><strong>{isShopify ? "Opening Shopify…" : `Connecting ${providerName}…`}</strong><div className="mt-1 text-[11px] text-slate-400">{isShopify ? "Authorize the store in Shopify to continue" : "Securing credential · Verifying account identity"}</div></div> : null}
        {message ? <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/5 px-3 py-2 text-xs text-rose-300">{message}</p> : null}
        <button disabled={busy} className="w-full rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">{busy ? (isShopify ? "Opening Shopify…" : "Connecting…") : (isShopify ? "Continue to Shopify" : "Create Connection")}</button>
      </form>
    </Dialog>
  );
}

function Dialog({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return <div role="dialog" aria-modal="true" aria-labelledby="connections-dialog-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#10131a] p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h2 id="connections-dialog-title" className="text-lg font-semibold">{title}</h2><button type="button" onClick={close} aria-label="Close dialog" className="rounded-lg p-2 text-slate-400 hover:bg-white/10"><X className="h-4 w-4" /></button></div>{children}</div></div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-medium text-slate-300"><span className="mb-2 block">{label}</span>{children}</label>; }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not available"; }
