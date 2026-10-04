"use client";

import * as React from "react";
import { AccessBoundary } from "./access-control";
import type { AuditHistoryRecord } from "@/lib/identity/audit-history";
import { GovernedActionHistoryPanel } from "./governed-action-history";

export function AuditHistoryWorkspace() {
  return <AccessBoundary permission="audit_logs.view"><AuditHistoryContent /></AccessBoundary>;
}

function AuditHistoryContent() {
  const [events, setEvents] = React.useState<AuditHistoryRecord[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    void fetch("/api/audit-events?limit=50", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Audit history is unavailable.");
        setEvents(payload.events || []);
      }).catch((cause) => setError(cause instanceof Error ? cause.message : "Audit history is unavailable."));
  }, []);
  return <section className="space-y-4">
    <header><h1 className="text-2xl font-semibold">Audit History</h1><p className="text-sm text-slate-500">Persistent activity scoped to the active organization or explicit platform context.</p></header>
    {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    <div className="overflow-hidden rounded-xl border">
      {events.length ? events.map((event) => <div key={event.id} className="grid gap-2 border-b p-4 text-sm md:grid-cols-[180px_1fr_1fr_100px]">
        <time>{new Date(event.occurredAt).toLocaleString()}</time><span>{event.actorName || event.actorEmail || "System"}</span><span>{event.action}</span><span>{event.result}</span>
      </div>) : <p className="p-6 text-sm text-slate-500">No audit events are available.</p>}
    </div><GovernedActionHistoryPanel />
  </section>;
}
