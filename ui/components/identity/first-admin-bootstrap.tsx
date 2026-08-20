"use client";

import { FormEvent, useState } from "react";

export default function FirstAdminBootstrap() {
  const [organizationName, setOrganizationName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const response = await fetch("/api/identity/bootstrap", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ organizationName, accountName }),
    }).catch(() => null);
    if (!response?.ok) {
      setSubmitting(false);
      setError("TraceKit could not be initialized. The installation may already have been initialized.");
      return;
    }
    window.location.reload();
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 p-6">
      <section className="rounded-2xl border bg-white p-6 shadow-sm dark:border-white/10 dark:bg-ink">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">TraceKit identity</p>
        <h1 className="mt-2 text-2xl font-semibold">Initialize TraceKit</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">You are the first authenticated administrator. Create the initial workspace to continue.</p>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <label className="block text-sm font-medium">Organization name<input required maxLength={120} value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} className="mt-1 block w-full rounded-lg border px-3 py-2" /></label>
          <label className="block text-sm font-medium">Account/workspace name<input required maxLength={120} value={accountName} onChange={(event) => setAccountName(event.target.value)} className="mt-1 block w-full rounded-lg border px-3 py-2" /></label>
          {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
          <button type="submit" disabled={submitting} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{submitting ? "Initializing…" : "Initialize TraceKit"}</button>
        </form>
      </section>
    </main>
  );
}
