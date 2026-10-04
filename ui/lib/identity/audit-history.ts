import type { TraceKitSessionContext } from "./persistent-types";

export type AuditHistoryRecord = {
  id: string;
  occurredAt: string;
  action: string;
  result: "success" | "denied" | "failure";
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  targetType: string | null;
  targetId: string | null;
  permissionEvaluated: string | null;
  correlationId: string;
  metadata: Record<string, unknown>;
};

export function auditHistoryScope(session: TraceKitSessionContext) {
  if (!session.effectivePermissions.includes("audit_logs.view")) throw new Error("audit_history_unavailable");
  // Admin Client View is always tenant-scoped. Platform-wide scope is allowed
  // only after the operator has explicitly returned to platform context.
  if (session.activeOrganization) {
    return { accountId: session.activeAccount.id, organizationId: session.activeOrganization.id, platformWide: false as const };
  }
  if (session.activeAccount.accountType !== "platform") throw new Error("audit_history_unavailable");
  return { accountId: session.activeAccount.id, organizationId: null, platformWide: true as const };
}

export function auditHistoryPagination(input: URLSearchParams) {
  const parsedLimit = Number.parseInt(input.get("limit") || "50", 10);
  const parsedCursor = Number.parseInt(input.get("cursor") || "0", 10);
  return {
    limit: Number.isFinite(parsedLimit) ? Math.max(1, Math.min(parsedLimit, 100)) : 50,
    cursor: Number.isFinite(parsedCursor) ? Math.max(0, Math.min(parsedCursor, 1_000_000)) : 0,
  };
}
