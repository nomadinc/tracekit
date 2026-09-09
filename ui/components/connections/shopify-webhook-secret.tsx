"use client";

import { useEffect, useState } from "react";

export function ShopifyWebhookSecret({ connectionId }: { connectionId: string }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/shopify/webhook-secret?connectionId=${encodeURIComponent(connectionId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((result) => { if (!cancelled) setConfigured(Boolean(result?.ok && result?.configured)); })
      .catch(() => { if (!cancelled) setConfigured(false); });
    return () => { cancelled = true; };
  }, [connectionId]);

  async function save() {
    if (secret.trim().length < 8) {
      setMessage("Enter a valid Shopify app secret.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/shopify/webhook-secret", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connectionId, appSecret: secret }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.message || "Unable to save Shopify app secret.");
      setSecret("");
      setConfigured(true);
      setMessage("Shopify app secret saved securely.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save Shopify app secret.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Shopify webhooks</div>
          <div className="mt-2 flex items-center gap-3">
            <h2 className="text-xl font-semibold text-white">Webhook signing secret</h2>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${configured ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}>
              {configured ? "Configured" : configured === null ? "Checking" : "Required for M9"}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Enter the Shopify app client secret used to verify webhook HMAC signatures. It is encrypted with the existing commerce credential and is never displayed after saving.
          </p>
        </div>
        <div className="flex w-full max-w-xl flex-col gap-3 sm:flex-row">
          <input
            type="password"
            autoComplete="new-password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            placeholder={configured ? "Replace app secret" : "Shopify app secret"}
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-400/50"
          />
          <button
            type="button"
            disabled={saving || !secret.trim()}
            onClick={save}
            className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : configured ? "Replace secret" : "Save secret"}
          </button>
        </div>
      </div>
      {message ? <p className="mt-3 text-sm text-slate-300">{message}</p> : null}
    </section>
  );
}
