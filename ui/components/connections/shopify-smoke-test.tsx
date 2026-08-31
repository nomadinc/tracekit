"use client";

import { useState } from "react";

type SmokeResult = {
  ok: boolean;
  error?: string;
  shop?: { id: string; name: string; domain: string };
  counts?: { products: number; variants: number; customers: number; orders: number; lineItems: number; refunds: number };
  requestIdPresent?: boolean;
};

export function ShopifySmokeTest({ connectionId }: { connectionId: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SmokeResult | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/shopify/smoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      const payload = await response.json().catch(() => null) as SmokeResult | null;
      setResult(payload || { ok: false, error: "invalid_response" });
    } catch {
      setResult({ ok: false, error: "request_failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto mt-4 max-w-[1360px] px-5 sm:px-8 lg:px-10">
      <div className="rounded-2xl border border-white/10 bg-white/[.025] p-5 text-slate-100">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Shopify live smoke test</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Reads at most 5 products, 5 customers, and 5 orders. No scheduler, backfill, or Shopify mutation.</p>
          </div>
          <button type="button" onClick={run} disabled={busy} className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">
            {busy ? "Running…" : "Run Smoke Test"}
          </button>
        </div>
        {result?.ok && result.counts ? (
          <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4 text-xs text-emerald-200">
            <strong>PASS · {result.shop?.name || result.shop?.domain || "Shopify"}</strong>
            <p className="mt-2 text-slate-300">Products {result.counts.products} · Variants {result.counts.variants} · Customers {result.counts.customers} · Orders {result.counts.orders} · Line items {result.counts.lineItems} · Refunds {result.counts.refunds}</p>
          </div>
        ) : null}
        {result && !result.ok ? (
          <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-xs text-rose-300">Smoke test failed: {result.error || "unknown_error"}</div>
        ) : null}
      </div>
    </section>
  );
}
