"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, X } from "lucide-react";
import { useIdentity } from "@/components/identity/identity-provider";

export function AdminClientViewBanner() {
  const router = useRouter();
  const { session, organizations } = useIdentity();
  const [busy, setBusy] = React.useState(false);
  if (!session.adminClientView) return null;
  const organization = organizations.find((candidate) => candidate.id === session.activeOrganizationId) || organizations[0] || null;

  async function exit() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/session/admin-view", { method: "DELETE" });
      router.push("/platform");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-400/20 bg-blue-400/10 px-4 py-2 text-xs text-blue-50 lg:px-6">
      <span className="inline-flex items-center gap-2 font-semibold">
        <ShieldCheck className="h-4 w-4" />
        Platform Admin viewing {organization?.name || "selected client"} · all advertiser data is scoped to this Client Organization
      </span>
      <button type="button" onClick={exit} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300/30 bg-blue-300/10 px-3 py-1.5 font-semibold hover:bg-blue-300/20 disabled:opacity-50">
        <X className="h-3.5 w-3.5" />
        {busy ? "Exiting…" : "Exit client view"}
      </button>
    </div>
  );
}
