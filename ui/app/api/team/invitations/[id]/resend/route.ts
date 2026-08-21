import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { requirePermission } from "@/lib/identity/authorization-gateway";
import { invitationMatchesScope, teamScopeFromSession } from "@/lib/identity/team-api";
import { SupabaseTeamRepository } from "@/lib/identity/supabase-team-repository";
import { createWorkOSInvitation, resendWorkOSInvitation, revokeWorkOSInvitation } from "@/lib/identity/workos-invitations";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated") return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  const repository = new SupabaseTeamRepository();
  const { id } = await context.params;
  let scope;
  let newLocalInvitationId: string | null = null;
  let newWorkOSInvitationId: string | null = null;

  try {
    scope = teamScopeFromSession(resolution.session);
    requirePermission(resolution.session, "users.invite");
    const invitation = await repository.invitationById(id);
    if (!invitation || !invitationMatchesScope(invitation, scope) || !["pending", "expired"].includes(invitation.status)) throw new Error("invitation_unavailable");

    const expired = invitation.status === "expired" || !Number.isFinite(Date.parse(invitation.expiresAt)) || Date.parse(invitation.expiresAt) <= Date.now();
    if (!expired && invitation.workosInvitationId) {
      const delivery = await resendWorkOSInvitation(invitation.workosInvitationId);
      await repository.setInvitationDelivery({ invitationId: invitation.id, workosInvitationId: delivery.id, expiresAt: delivery.expiresAt });
      await repository.recordAuditEvent({ actorUserId: resolution.session.user.id, authenticatedIdentityId: resolution.session.externalWorkosUserId, scope, action: "team.invitation.resent", targetType: "invitation", targetId: invitation.id, result: "success", permissionEvaluated: "users.invite", correlationId: resolution.session.correlationId, metadata: { delivery: "workos", replacement: false } });
      return NextResponse.json({ invitation: await repository.invitationById(invitation.id) });
    }

    if (invitation.status === "pending") await repository.markInvitationExpired(invitation.id);
    const replacement = await repository.createInvitation({ inviterUserId: resolution.session.user.id, intendedEmail: invitation.intendedEmail, scope, role: invitation.role, expiresAt: new Date(Date.now() + INVITATION_TTL_MS).toISOString() });
    newLocalInvitationId = replacement.id;
    const workosOrganizationId = await repository.workosOrganizationIdForScope(scope);
    const delivery = await createWorkOSInvitation({ email: invitation.intendedEmail, inviterUserId: resolution.session.externalWorkosUserId, organizationId: workosOrganizationId, expiresInDays: 7 });
    newWorkOSInvitationId = delivery.id;
    await repository.setInvitationDelivery({ invitationId: replacement.id, workosInvitationId: delivery.id, expiresAt: delivery.expiresAt });
    await repository.recordAuditEvent({ actorUserId: resolution.session.user.id, authenticatedIdentityId: resolution.session.externalWorkosUserId, scope, action: "team.invitation.resent", targetType: "invitation", targetId: replacement.id, result: "success", permissionEvaluated: "users.invite", correlationId: resolution.session.correlationId, metadata: { delivery: "workos", replacement: true, prior_invitation_id: invitation.id } });
    return NextResponse.json({ invitation: await repository.invitationById(replacement.id), replacedInvitationId: invitation.id }, { status: 201 });
  } catch (error) {
    if (newLocalInvitationId) await repository.revokeInvitation(newLocalInvitationId).catch(() => undefined);
    if (newWorkOSInvitationId) await revokeWorkOSInvitation(newWorkOSInvitationId).catch(() => undefined);
    if (scope) await repository.recordAuditEvent({ actorUserId: resolution.session.user.id, authenticatedIdentityId: resolution.session.externalWorkosUserId, scope, action: "team.invitation.resend_failed", targetType: "invitation", targetId: newLocalInvitationId || id, result: "failure", permissionEvaluated: "users.invite", correlationId: resolution.session.correlationId, metadata: { reason: error instanceof Error ? error.message : "unknown" } }).catch(() => undefined);
    return NextResponse.json({ error: "The invitation could not be resent." }, { status: 502 });
  }
}
