import type { TraceKitSessionContext } from "./persistent-types";
import { requirePermission } from "./authorization-gateway";
import type { Permission } from "./permissions";
import type { TeamInvitationRecord, TeamMemberRecord, TeamScope } from "./team-repository";

export function teamScopeFromSession(session: TraceKitSessionContext): TeamScope {
  if (session.activeAccount.accountType === "client") {
    if (!session.activeOrganization) throw new Error("team_scope_unavailable");
    return {
      accountId: session.activeAccount.id,
      organizationId: session.activeOrganization.id,
      accountType: "client",
    };
  }
  return {
    accountId: session.activeAccount.id,
    organizationId: null,
    accountType: session.activeAccount.accountType,
  };
}

export function requireTeamPermission(session: TraceKitSessionContext, permission: Permission) {
  requirePermission(session, permission);
  return teamScopeFromSession(session);
}

export function invitationMatchesScope(
  invitation: Pick<TeamInvitationRecord, "id"> & { targetAccountId: string | null; targetOrganizationId: string | null },
  scope: TeamScope,
) {
  return scope.organizationId
    ? invitation.targetOrganizationId === scope.organizationId && invitation.targetAccountId === null
    : invitation.targetAccountId === scope.accountId && invitation.targetOrganizationId === null;
}

export function membershipMatchesScope(
  membership: Pick<TeamMemberRecord, "membershipId"> & { accountId: string | null; organizationId: string | null },
  scope: TeamScope,
) {
  return scope.organizationId
    ? membership.organizationId === scope.organizationId && membership.accountId === null
    : membership.accountId === scope.accountId && membership.organizationId === null;
}

export function safeTeamErrorStatus(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (/invalid_email|invalid_role|invalid_transition/i.test(code)) return 400;
  if (/final_owner/i.test(code)) return 409;
  return 404;
}
