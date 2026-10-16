import { ACTIVE_ACCOUNT_COOKIE, sealActiveAccount } from "@/lib/identity/active-account-cookie";
import { completeInvitationDelivery } from "@/lib/identity/invitation-email-delivery";
import { sendWorkOSInvitation } from "@/lib/identity/workos-invitation-delivery";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ACTIVE_ORGANIZATION_COOKIE, sealActiveOrganization } from "@/lib/identity/active-organization-cookie";
import { ACTIVE_BUSINESS_CONTEXT_COOKIE } from "@/lib/identity/active-business-context-cookie";
import { resolveApplicationSession, resolveAuthenticatedPersistentIdentity } from "@/lib/identity/application-session";
import { authorizeCustomerInvitation } from "@/lib/identity/customer-invitation-policy";
import { resolveInvitationTargetAccess, resolveAgencyInvitationTargetAccess } from "@/lib/identity/invitation-target-access";
import { AuthorizationDeniedError, requireResourceScope } from "@/lib/identity/authorization-gateway";
import { SupabaseIdentityTenancyRepository } from "@/lib/identity/supabase-identity-repository";

const unavailable = () => NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Request verification failed." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return unavailable();
  const allowed = new Set(["operation", "invitationId", "organizationId", "accountId", "role", "intendedEmail", "businessContextIds"]);
  if (Object.keys(body).some(key => !allowed.has(key))) return unavailable();
  try {
    const repository = new SupabaseIdentityTenancyRepository();
    if (body.operation === "accept") {
      if (Object.keys(body).some(key => !["operation", "invitationId"].includes(key)) || typeof body.invitationId !== "string") return unavailable();
      const identity = await resolveAuthenticatedPersistentIdentity();
      if (!identity || identity.user.status !== "active") return unavailable();
      const result = await repository.customerInvitation({ p_operation: "accept", p_actor_id: identity.user.id, p_identity_id: identity.externalWorkosUserId, p_correlation_id: randomUUID(), p_invitation_id: body.invitationId, p_email_verified: identity.emailVerified });
      if (!result.ok) return unavailable();
      const response = NextResponse.json({ ok: true, organizationId: result.organizationId });
      if (result.accountId) {
        const maxAge = 60 * 60 * 24 * 30;
        response.cookies.set(ACTIVE_ACCOUNT_COOKIE, sealActiveAccount({ userId: identity.user.id, accountId: result.accountId, expiresAt: Date.now() + maxAge * 1000 }), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge });
        response.cookies.set(ACTIVE_ORGANIZATION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
        response.cookies.set(ACTIVE_BUSINESS_CONTEXT_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
      } else if (result.organizationId) {
        response.cookies.set(ACTIVE_ACCOUNT_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
        const maxAge = 60 * 60 * 24 * 30;
        response.cookies.set(ACTIVE_ORGANIZATION_COOKIE, sealActiveOrganization({ userId: identity.user.id, organizationId: result.organizationId, expiresAt: Date.now() + maxAge * 1000 }), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge });
        response.cookies.set(ACTIVE_BUSINESS_CONTEXT_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
      }
      return response;
    }
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated") return unavailable();
    const session = resolution.session;
    const base = { p_actor_id: session.user.id, p_identity_id: session.externalWorkosUserId, p_correlation_id: session.correlationId, p_membership_id: session.membership.id };
    if (body.accountId !== undefined) {
      if (typeof body.accountId !== "string" || body.organizationId !== undefined) return unavailable();
      const contexts = await resolveAgencyInvitationTargetAccess(session, repository, body.accountId);
      const target = { p_account_id: body.accountId };
      if (body.operation === "issue") {
        if (body.role !== "agency-read-only" || typeof body.intendedEmail !== "string" || body.intendedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.intendedEmail.trim()) || !Array.isArray(body.businessContextIds) || !body.businessContextIds.length || body.businessContextIds.some((id: unknown) => typeof id !== "string" || !contexts.some(context => context.id === id))) return unavailable();
        const claim = await repository.invitationDelivery({ ...base, ...target, p_operation: "issue", p_invitation_id: randomUUID(), p_email: body.intendedEmail.trim().toLowerCase(), p_context_ids: Array.from(new Set(body.businessContextIds)) });
        if (!claim.ok) return unavailable();
        const delivery = await completeInvitationDelivery(claim, sendWorkOSInvitation, parameters => repository.invitationDelivery({ ...base, ...target, ...parameters }));
        return NextResponse.json({ ok: true, invitationId: claim.id, acceptancePath: `/invitations/${claim.id}`, role: "agency-read-only", delivery }, { status: delivery.sendAccepted ? 201 : 202 });
      }
      if (typeof body.invitationId !== "string") return unavailable();
      if (["deliver", "delivery-status"].includes(body.operation)) {
        const claim = await repository.invitationDelivery({ ...base, ...target, p_operation: body.operation === "deliver" ? "claim" : "status", p_invitation_id: body.invitationId });
        if (!claim.ok) return unavailable();
        const delivery = await completeInvitationDelivery(claim, sendWorkOSInvitation, parameters => repository.invitationDelivery({ ...base, ...target, ...parameters }));
        return NextResponse.json({ ok: true, delivery });
      }
      if (body.operation === "revoke") {
        const result = await repository.customerInvitation({ ...base, ...target, p_operation: "revoke", p_invitation_id: body.invitationId });
        return result.ok ? NextResponse.json({ ok: true }) : unavailable();
      }
      return unavailable();
    }
    if (body.operation === "issue") {
      if (typeof body.organizationId !== "string" || typeof body.role !== "string" || typeof body.intendedEmail !== "string" || !Array.isArray(body.businessContextIds) || body.businessContextIds.some((id: unknown) => typeof id !== "string")) return unavailable();
      let input;
      try { input = authorizeCustomerInvitation(await resolveInvitationTargetAccess(session, repository, body.organizationId), body); }
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
      requireResourceScope(await resolveInvitationTargetAccess(session, repository, body.organizationId), body.organizationId, "users.invite");
      const claim = await repository.invitationDelivery({ ...base, p_operation: body.operation === "deliver" ? "claim" : "status", p_invitation_id: body.invitationId, p_organization_id: body.organizationId });
      if (!claim.ok) return unavailable();
      const delivery = await completeInvitationDelivery(claim, sendWorkOSInvitation, parameters => repository.invitationDelivery({ ...base, p_organization_id: body.organizationId, ...parameters }));
      return NextResponse.json({ ok: true, delivery }, { status: delivery.sendAccepted ? 200 : 202 });
    }
    if (body.operation === "revoke" && typeof body.invitationId === "string" && typeof body.organizationId === "string") {
      requireResourceScope(await resolveInvitationTargetAccess(session, repository, body.organizationId), body.organizationId, "users.invite");
      const result = await repository.customerInvitation({ ...base, p_operation: "revoke", p_invitation_id: body.invitationId, p_organization_id: body.organizationId });
      return result.ok ? NextResponse.json({ ok: true }) : unavailable();
    }
    return unavailable();
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) return unavailable();
    return NextResponse.json({ error: "Invitation processing is unavailable." }, { status: 503 });
  }
}
