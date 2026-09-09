"use client";

import { useEffect, useState } from "react";

export function ShopifyWebhookSecret({ connectionId }: { connectionId: string }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [webhooksReady, setWebhooksReady] = useState<boolean | null>(null);
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/shopify/webhook-secret?connectionId=${encodeURIComponent(connectionId)}`, { cache: "no-store" }).then((response) => response.json()),
      fetch(`/api/shopify/webhook-subscriptions?connectionId=${encodeURIComponent(connectionId)}`, { cache: "no-store" }).then((response) => response.json()),
    ])
      .then(([secretResult, webhookResult]) => {
        if (cancelled) return;
        setConfigured(Boolean(secretResult?.ok && secretResult?.configured));
        setWebhooksReady(Boolean(webhookResult?.ok && webhookResult?.ready));
      })
      .catch(() => {
        if (!cancelled) {
          setConfigured(false);
          setWebhooksReady(false);
        }
      });
    return () => { cancelled = true; };
  }, [connectionId]);

  async function activateWebhooks() {
    setActivating(true);
    setMessage(null);
    try {
      const response = await fetch("/api/shopify/webhook-subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok || !result?.ready) throw new Error(result?.message || "Unable to activate Shopify webhooks.");
      setWebhooksReady(true);
      const created = Array.isArray(result?.createdTopics) ? result.createdTopics.length : 0;
      setMessage(created ? `Shopify webhooks activated (${created} subscription${created === 1 ? "" : "s"} created).` : "Shopify webhooks are active.");
      return true;
    } catch (error) {
      setWebhooksReady(false);
      setMessage(error instanceof Error ? error.message : "Unable to activate Shopify webhooks.");
      return false;
    } finally {
      setActivating(false);
    }
  }

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
      setMessage("Shopify app secret saved securely. Activating webhooks…");
      await activateWebhooks();
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
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-white">Webhook signing secret</h2>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${configured ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}>
              {configured ? "Secret configured" : configured === null ? "Checking" : "Secret required"}
            </span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${webhooksReady ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}>
              {webhooksReady ? "2/2 webhooks active" : webhooksReady === null ? "Checking webhooks" : "Webhooks inactive"}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            TraceKit verifies Shopify HMAC signatures and manages the orders/create and refunds/create subscriptions automatically. The app secret remains encrypted and is never displayed after saving.
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
            disabled={saving || activating || !secret.trim()}
            onClick={save}
            className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : configured ? "Replace secret" : "Save secret"}
          </button>
          {configured && !webhooksReady ? (
            <button
              type="button"
              disabled={saving || activating}
              onClick={activateWebhooks}
              className="rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {activating ? "Activating…" : "Activate webhooks"}
            </button>
          ) : null}
        </div>
      </div>
      {message ? <p className="mt-3 text-sm text-slate-300">{message}</p> : null}
    </section>
  );
}
