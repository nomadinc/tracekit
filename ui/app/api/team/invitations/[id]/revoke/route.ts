import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { requirePermission } from "@/lib/identity/authorization-gateway";
import { invitationMatchesScope, teamScopeFromSession } from "@/lib/identity/team-api";
import { SupabaseTeamRepository } from "@/lib/identity/supabase-team-repository";
import { revokeWorkOSInvitation } from "@/lib/identity/workos-invitations";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated") return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });

  const repository = new SupabaseTeamRepository();
  let scope;
  const { id } = await context.params;
  try {
    scope = teamScopeFromSession(resolution.session);
    requirePermission(resolution.session, "users.invite");
    const invitation = await repository.invitationById(id);
    if (!invitation || !invitationMatchesScope(invitation, scope) || invitation.status !== "pending") throw new Error("invitation_unavailable");

    await repository.revokeInvitation(id);
    let workosRevoked = !invitation.workosInvitationId;
    if (invitation.workosInvitationId) {
      try {
        await revokeWorkOSInvitation(invitation.workosInvitationId);
        workosRevoked = true;
      } catch {
        workosRevoked = false;
      }
    }

    await repository.recordAuditEvent({ actorUserId: resolution.session.user.id, authenticatedIdentityId: resolution.session.externalWorkosUserId, scope, action: workosRevoked ? "team.invitation.revoked" : "team.invitation.revoked_delivery_cleanup_failed", targetType: "invitation", targetId: id, result: workosRevoked ? "success" : "failure", permissionEvaluated: "users.invite", correlationId: resolution.session.correlationId, metadata: { delivery: invitation.workosInvitationId ? "workos" : "none" } });
    return NextResponse.json({ ok: true, deliveryRevoked: workosRevoked }, { status: workosRevoked ? 200 : 502 });
  } catch (error) {
    if (scope) await repository.recordAuditEvent({ actorUserId: resolution.session.user.id, authenticatedIdentityId: resolution.session.externalWorkosUserId, scope, action: "team.invitation.revoke_denied", targetType: "invitation", targetId: id, result: "denied", permissionEvaluated: "users.invite", correlationId: resolution.session.correlationId, metadata: { reason: error instanceof Error ? error.message : "unknown" } }).catch(() => undefined);
    return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  }
}
