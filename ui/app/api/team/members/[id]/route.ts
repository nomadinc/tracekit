import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { requirePermission } from "@/lib/identity/authorization-gateway";
import { membershipMatchesScope, safeTeamErrorStatus, teamScopeFromSession } from "@/lib/identity/team-api";
import { OWNER_ROLE_BY_ACCOUNT_TYPE, assertMembershipStatusTransition, assertOwnerMutationAllowed, requireRoleForAccountType, type TeamMembershipStatus } from "@/lib/identity/team-management";
import { SupabaseTeamRepository } from "@/lib/identity/supabase-team-repository";

const MEMBERSHIP_STATUSES = new Set<TeamMembershipStatus>(["invited", "active", "suspended", "removed"]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated") return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });

  const repository = new SupabaseTeamRepository();
  let scope;
  try {
    scope = teamScopeFromSession(resolution.session);
    const { id } = await context.params;
    const body = await request.json().catch(() => null) as { role?: unknown; status?: unknown } | null;
    if (!body || (body.role === undefined && body.status === undefined)) throw new Error("invalid_transition");

    const role = body.role === undefined ? undefined : requireRoleForAccountType(scope.accountType, body.role);
    let status: TeamMembershipStatus | undefined;
    if (body.status !== undefined) {
      if (typeof body.status !== "string" || !MEMBERSHIP_STATUSES.has(body.status as TeamMembershipStatus)) throw new Error("invalid_transition");
      status = body.status as TeamMembershipStatus;
    }

    const permissionEvaluated = status === "removed" ? "users.remove" as const : "users.manage_permissions" as const;
    requirePermission(resolution.session, permissionEvaluated);
    if (role !== undefined) requirePermission(resolution.session, "users.manage_permissions");

    const member = await repository.membershipById(id);
    if (!member || !membershipMatchesScope(member, scope)) throw new Error("membership_unavailable");
    if (status !== undefined) assertMembershipStatusTransition(member.status, status);

    const ownerRole = OWNER_ROLE_BY_ACCOUNT_TYPE[scope.accountType];
    const activeOwnerCount = member.role === ownerRole ? await repository.countActiveOwners(scope, ownerRole) : 0;
    assertOwnerMutationAllowed({ accountType: scope.accountType, currentRole: member.role, nextRole: role, nextStatus: status, activeOwnerCount });

    const updated = await repository.updateMembership({
      membershipId: id,
      role,
      status,
      actorUserId: resolution.session.user.id,
      authenticatedIdentityId: resolution.session.externalWorkosUserId,
      permissionEvaluated,
      correlationId: resolution.session.correlationId,
    });
    return NextResponse.json({ member: updated });
  } catch (error) {
    const status = safeTeamErrorStatus(error);
    if (scope) {
      const { id } = await context.params;
      await repository.recordAuditEvent({
        actorUserId: resolution.session.user.id,
        authenticatedIdentityId: resolution.session.externalWorkosUserId,
        scope,
        action: "team.membership.update_denied",
        targetType: "membership",
        targetId: id,
        result: "denied",
        permissionEvaluated: "users.manage_permissions",
        correlationId: resolution.session.correlationId,
        metadata: { reason: error instanceof Error ? error.message : "unknown" },
      }).catch(() => undefined);
    }
    return NextResponse.json({ error: status === 409 ? "The final owner cannot be removed, suspended, or demoted." : status === 400 ? "The membership update is invalid." : "The requested resource is unavailable." }, { status });
  }
}
