"use client";

import { LockKeyhole } from "lucide-react";
import { authorize, authorizeShellVariant } from "@/lib/identity/authorization";
import type { Permission } from "@/lib/identity/permissions";
import { useIdentity } from "./identity-provider";
import type { ShellVariant } from "@/lib/identity/types";

export function AccessBoundary({ permission, variants, children }: { permission: Permission | readonly Permission[]; variants?: readonly ShellVariant[]; children: React.ReactNode }) {
  const { session } = useIdentity();
  const shellDecision = variants ? authorizeShellVariant(session.identity, variants) : { allowed: true as const, reason: null };
  const decision = authorize(session.identity, permission, session.activeOrganizationId);
  if (shellDecision.allowed && decision.allowed) return <>{children}</>;
  return <AccessDenied reason={shellDecision.reason || decision.reason} />;
}

export function AccessDenied({ reason = "You do not have permission to enter this destination." }: { reason?: string | null }) {
  return <div className="mx-auto max-w-2xl rounded-2xl border border-slate-300 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-ink"><LockKeyhole className="mx-auto h-8 w-8" /><div className="mt-4 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">Access Denied</div><h2 className="mt-2 text-xl font-semibold">This destination is outside your allowed scope.</h2><p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{reason}</p><p className="mt-4 text-xs text-slate-500">Development identity state demonstrates policy only. Server-side enforcement is required before tenant data is enabled.</p></div>;
}
