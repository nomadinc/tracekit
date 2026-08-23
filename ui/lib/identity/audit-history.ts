import type { Permission } from "./permissions";
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
  metadata: Record<string, unknown>;
};

export function auditHistoryScope(session: TraceKitSessionContext) {
  if (!session.effectivePermissions.includes("audit_logs.view" as Permission)) {
    throw new Error("audit_history_unavailable");
  }
  if (session.activeAccount.accountType === "platform") {
    return { accountId: session.activeAccount.id, organizationId: null, platformWide: true as const };
  }
  if (!session.activeOrganization?.id) throw new Error("audit_history_unavailable");
  return {
    accountId: session.activeAccount.id,
    organizationId: session.activeOrganization.id,
    platformWide: false as const,
  };
}

export function humanizeAuditAction(action: string, metadata: Record<string, unknown>) {
  if (action === "authentication.sign_in.succeeded") return "Signed in";
  if (action === "authentication.sign_out") return "Signed out";
  if (action === "user.access.denied") return "Access denied";
  if (action === "team.invitation.created") return "Invitation sent";
  if (action === "team.invitation.resent") return "Invitation resent";
  if (action === "team.invitation.revoked") return "Invitation revoked";
  if (action === "team.invitation.accepted") return "Invitation accepted";
  if (action === "team.membership.update_denied") return "Team change denied";
  if (action === "team.membership.updated") {
    const previousRole = typeof metadata.previous_role === "string" ? metadata.previous_role : null;
    const nextRole = typeof metadata.new_role === "string" ? metadata.new_role : null;
    const previousStatus = typeof metadata.previous_status === "string" ? metadata.previous_status : null;
    const nextStatus = typeof metadata.new_status === "string" ? metadata.new_status : null;
    if (previousRole && nextRole && previousRole !== nextRole) return `Role changed: ${previousRole} → ${nextRole}`;
    if (previousStatus && nextStatus && previousStatus !== nextStatus) return `Membership ${nextStatus}`;
    return "Team member updated";
  }
  return action.split(".").map((part) => part.replace(/_/g, " ")).join(" · ");
}
