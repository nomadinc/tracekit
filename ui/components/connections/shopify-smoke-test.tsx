"use client";

import { useState } from "react";

type SmokeResult = {
  ok: boolean;
  error?: string;
  shop?: { id: string; name: string; domain: string };
  counts?: { products: number; variants: number; customers: number; orders: number; lineItems: number; refunds: number };
};
type IngestResult = { ok: boolean; error?: string; syncRunId?: string; products?: number; firstPass?: { evidenceCreated: number; evidenceReused: number; productsCreated: number; productsReused: number }; secondPass?: { evidenceCreated: number; evidenceReused: number; productsCreated: number; productsReused: number }; idempotent?: boolean };

export function ShopifySmokeTest({ connectionId }: { connectionId: string }) {
  const [busy, setBusy] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [result, setResult] = useState<SmokeResult | null>(null);
  const [ingestResult, setIngestResult] = useState<IngestResult | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true); setResult(null);
    try {
      const response = await fetch("/api/shopify/smoke", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ connectionId }) });
      const payload = await response.json().catch(() => null) as SmokeResult | null;
      setResult(payload || { ok: false, error: "invalid_response" });
    } catch { setResult({ ok: false, error: "request_failed" }); } finally { setBusy(false); }
  }

  async function ingest() {
    if (ingesting) return;
    setIngesting(true); setIngestResult(null);
    try {
      const response = await fetch("/api/shopify/ingest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ connectionId }) });
      const payload = await response.json().catch(() => null) as IngestResult | null;
      setIngestResult(payload || { ok: false, error: "invalid_response" });
    } catch { setIngestResult({ ok: false, error: "request_failed" }); } finally { setIngesting(false); }
  }

  return (
    <section className="mx-auto mt-4 max-w-[1360px] px-5 sm:px-8 lg:px-10">
      <div className="rounded-2xl border border-white/10 bg-white/[.025] p-5 text-slate-100">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm font-semibold">Shopify live smoke test</p><p className="mt-1 text-xs leading-5 text-slate-500">Reads at most 5 products, 5 customers, and 5 orders. No scheduler, backfill, or Shopify mutation.</p></div>
          <button type="button" onClick={run} disabled={busy} className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">{busy ? "Running…" : "Run Smoke Test"}</button>
        </div>
        {result?.ok && result.counts ? <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4 text-xs text-emerald-200"><strong>PASS · {result.shop?.name || result.shop?.domain || "Shopify"}</strong><p className="mt-2 text-slate-300">Products {result.counts.products} · Variants {result.counts.variants} · Customers {result.counts.customers} · Orders {result.counts.orders} · Line items {result.counts.lineItems} · Refunds {result.counts.refunds}</p></div> : null}
        {result && !result.ok ? <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-xs text-rose-300">Smoke test failed: {result.error || "unknown_error"}</div> : null}

        <div className="mt-5 flex flex-col gap-4 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm font-semibold">Bounded product ingestion</p><p className="mt-1 text-xs leading-5 text-slate-500">Ingests at most 3 products and their variants, then repeats the same write to verify idempotency. No scheduler or historical backfill.</p></div>
          <button type="button" onClick={ingest} disabled={ingesting} className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">{ingesting ? "Ingesting…" : "Run Bounded Ingestion"}</button>
        </div>
        {ingestResult?.ok ? <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4 text-xs text-emerald-200"><strong>{ingestResult.idempotent ? "PASS" : "CHECK"} · Shopify ingestion</strong><p className="mt-2 text-slate-300">Products {ingestResult.products ?? 0} · First pass created {ingestResult.firstPass?.productsCreated ?? 0} products / {ingestResult.firstPass?.evidenceCreated ?? 0} evidence · Second pass reused {ingestResult.secondPass?.productsReused ?? 0} products / {ingestResult.secondPass?.evidenceReused ?? 0} evidence · Idempotent {ingestResult.idempotent ? "yes" : "no"}</p></div> : null}
        {ingestResult && !ingestResult.ok ? <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-xs text-rose-300">Ingestion failed: {ingestResult.error || "unknown_error"}</div> : null}
      </div>
    </section>
  );
}
