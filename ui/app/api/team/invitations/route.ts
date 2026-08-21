import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { teamScopeFromSession } from "@/lib/identity/team-api";
import { requirePermission } from "@/lib/identity/authorization-gateway";
import { normalizeInvitationEmail, requireRoleForAccountType } from "@/lib/identity/team-management";
import { SupabaseTeamRepository } from "@/lib/identity/supabase-team-repository";
import type { TeamScope } from "@/lib/identity/team-repository";
import { createWorkOSInvitation, revokeWorkOSInvitation } from "@/lib/identity/workos-invitations";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET() {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated") return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  try {
    requirePermission(resolution.session, "users.view");
    const scope = teamScopeFromSession(resolution.session);
    return NextResponse.json({ invitations: await new SupabaseTeamRepository().listInvitations(scope) });
  } catch {
    return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  }
}

export async function POST(request: Request) {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated") return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  const repository = new SupabaseTeamRepository();
  let scope: TeamScope | null = null;
  let localInvitationId: string | null = null;
  let workosInvitationId: string | null = null;
  try {
    scope = teamScopeFromSession(resolution.session);
    requirePermission(resolution.session, "users.invite");
    const body = await request.json().catch(() => null) as { email?: unknown; role?: unknown } | null;
    const intendedEmail = normalizeInvitationEmail(body?.email);
    const role = requireRoleForAccountType(scope.accountType, body?.role);
    if (!await repository.roleExistsForAccountType(role, scope.accountType)) throw new Error("invalid_role");

    const [members, invitations] = await Promise.all([repository.listMembers(scope), repository.listInvitations(scope)]);
    if (members.some((member) => member.status !== "removed" && member.primaryEmail.trim().toLowerCase() === intendedEmail)) throw new Error("member_exists");
    const now = Date.now();
    if (invitations.some((invitation) => invitation.status === "pending" && Date.parse(invitation.expiresAt) > now && invitation.intendedEmail.trim().toLowerCase() === intendedEmail)) throw new Error("invitation_exists");

    const invitation = await repository.createInvitation({ inviterUserId: resolution.session.user.id, intendedEmail, scope, role, expiresAt: new Date(now + INVITATION_TTL_MS).toISOString() });
    localInvitationId = invitation.id;
    const workosOrganizationId = await repository.workosOrganizationIdForScope(scope);
    const delivery = await createWorkOSInvitation({ email: intendedEmail, inviterUserId: resolution.session.externalWorkosUserId, organizationId: workosOrganizationId, expiresInDays: 7 });
    workosInvitationId = delivery.id;
    await repository.setInvitationDelivery({ invitationId: invitation.id, workosInvitationId: delivery.id, expiresAt: delivery.expiresAt });
    const deliveredInvitation = await repository.invitationById(invitation.id);
    if (!deliveredInvitation) throw new Error("invitation_unavailable");

    await repository.recordAuditEvent({ actorUserId: resolution.session.user.id, authenticatedIdentityId: resolution.session.externalWorkosUserId, scope, action: "team.invitation.created", targetType: "invitation", targetId: invitation.id, result: "success", permissionEvaluated: "users.invite", correlationId: resolution.session.correlationId, metadata: { role, delivery: "workos", workos_organization_bound: Boolean(workosOrganizationId) } });
    return NextResponse.json({ invitation: deliveredInvitation }, { status: 201 });
  } catch (error) {
    if (localInvitationId) await repository.revokeInvitation(localInvitationId).catch(() => undefined);
    if (workosInvitationId) await revokeWorkOSInvitation(workosInvitationId).catch(() => undefined);
    if (scope) {
      await repository.recordAuditEvent({ actorUserId: resolution.session.user.id, authenticatedIdentityId: resolution.session.externalWorkosUserId, scope, action: localInvitationId ? "team.invitation.delivery_failed" : "team.invitation.create_denied", targetType: "invitation", targetId: localInvitationId || "new", result: localInvitationId ? "failure" : "denied", permissionEvaluated: "users.invite", correlationId: resolution.session.correlationId, metadata: { reason: error instanceof Error ? error.message : "unknown" } }).catch(() => undefined);
    }
    const message = error instanceof Error ? error.message : "";
    const status = /member_exists|invitation_exists/.test(message) ? 409 : /invalid_email|invalid_role/.test(message) ? 400 : /WorkOS invitation/.test(message) ? 502 : 404;
    const responseMessage = status === 409 ? "That user already has a membership or pending invitation." : status === 400 ? "The invitation details are invalid." : status === 502 ? "The invitation could not be delivered." : "The requested resource is unavailable.";
    return NextResponse.json({ error: responseMessage }, { status });
  }
}
