import { completeInvitationDelivery } from "@/lib/identity/invitation-email-delivery";
import { sendWorkOSInvitation } from "@/lib/identity/workos-invitation-delivery";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession, resolveAuthenticatedPersistentIdentity } from "@/lib/identity/application-session";
import { authorizeCustomerInvitation } from "@/lib/identity/customer-invitation-policy";
import { requireResourceScope } from "@/lib/identity/authorization-gateway";
import { SupabaseIdentityTenancyRepository } from "@/lib/identity/supabase-identity-repository";

const unavailable = () => NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Request verification failed." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return unavailable();
  const allowed = new Set(["operation", "invitationId", "organizationId", "role", "intendedEmail", "businessContextIds"]);
  if (Object.keys(body).some(key => !allowed.has(key))) return unavailable();
  try {
    const repository = new SupabaseIdentityTenancyRepository();
    if (body.operation === "accept") {
      if (Object.keys(body).some(key => !["operation", "invitationId"].includes(key)) || typeof body.invitationId !== "string") return unavailable();
      const identity = await resolveAuthenticatedPersistentIdentity();
      if (!identity || identity.user.status !== "active") return unavailable();
      const result = await repository.customerInvitation({ p_operation: "accept", p_actor_id: identity.user.id, p_identity_id: identity.externalWorkosUserId, p_correlation_id: randomUUID(), p_invitation_id: body.invitationId, p_email_verified: identity.emailVerified });
      return result.ok ? NextResponse.json({ ok: true, organizationId: result.organizationId }) : unavailable();
    }
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated") return unavailable();
    const session = resolution.session;
    const base = { p_actor_id: session.user.id, p_identity_id: session.externalWorkosUserId, p_correlation_id: session.correlationId, p_membership_id: session.membership.id };
    if (body.operation === "issue") {
      if (typeof body.organizationId !== "string" || typeof body.role !== "string" || typeof body.intendedEmail !== "string" || !Array.isArray(body.businessContextIds) || body.businessContextIds.some((id: unknown) => typeof id !== "string")) return unavailable();
      let input;
      try { input = authorizeCustomerInvitation(session, body); }
      catch {
        await repository.recordAuditEvent({ actorUserId: session.user.id, authenticatedIdentityId: session.externalWorkosUserId, accountId: session.activeAccount.id, organizationId: session.activeOrganization?.id || null, action: "invitation.issue", result: "denied", permissionEvaluated: "users.invite", correlationId: session.correlationId, metadata: { reason: "unavailable" } });
        return unavailable();
      }
      const claim = await repository.invitationDelivery({ ...base, p_operation: "issue", p_invitation_id: randomUUID(), p_organization_id: input.organizationId, p_email: input.intendedEmail, p_context_ids: input.businessContextIds });
      if (!claim.ok) return unavailable();
      const delivery = await completeInvitationDelivery(claim, sendWorkOSInvitation, parameters => repository.invitationDelivery({ ...base, p_organization_id: input.organizationId, ...parameters }));
      return NextResponse.json({ ok: true, invitationId: claim.id, acceptancePath: `/invitations/${claim.id}`, role: input.role, delivery }, { status: delivery.sendAccepted ? 201 : 202 });
    }
    if (["deliver", "delivery-status"].includes(body.operation) && typeof body.invitationId === "string" && typeof body.organizationId === "string") {
      requireResourceScope(session, body.organizationId, "users.invite");
      const claim = await repository.invitationDelivery({ ...base, p_operation: body.operation === "deliver" ? "claim" : "status", p_invitation_id: body.invitationId, p_organization_id: body.organizationId });
      if (!claim.ok) return unavailable();
      const delivery = await completeInvitationDelivery(claim, sendWorkOSInvitation, parameters => repository.invitationDelivery({ ...base, p_organization_id: body.organizationId, ...parameters }));
      return NextResponse.json({ ok: true, delivery }, { status: delivery.sendAccepted ? 200 : 202 });
    }
    if (body.operation === "revoke" && typeof body.invitationId === "string" && typeof body.organizationId === "string") {
      requireResourceScope(session, body.organizationId, "users.invite");
      const result = await repository.customerInvitation({ ...base, p_operation: "revoke", p_invitation_id: body.invitationId, p_organization_id: body.organizationId });
      return result.ok ? NextResponse.json({ ok: true }) : unavailable();
    }
    return unavailable();
  } catch {
    return NextResponse.json({ error: "Invitation processing is unavailable." }, { status: 503 });
  }
}
