import { handleAuth, getWorkOS } from "@workos-inc/authkit-nextjs";
import { recordAuthenticationSuccess } from "@/lib/identity/application-session";
import { randomUUID } from "node:crypto";
import { SupabaseIdentityTenancyRepository } from "@/lib/identity/supabase-identity-repository";
import { canCompleteInvitation, providerIdFromState } from "@/lib/identity/invitation-onboarding";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ACTIVE_ORGANIZATION_COOKIE, sealActiveOrganization } from "@/lib/identity/active-organization-cookie";

function authErrorDiagnostic(value: unknown) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      code: typeof (value as Error & { code?: unknown }).code === "string" ? (value as Error & { code?: string }).code : null,
    };
  }
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return {
      name: typeof source.name === "string" ? source.name : null,
      message: typeof source.message === "string" ? source.message : null,
      code: typeof source.code === "string" ? source.code : null,
      status: typeof source.status === "number" ? source.status : null,
    };
  }
  return { name: null, message: typeof value === "string" ? value : null, code: null };
}

export const GET = handleAuth({
  returnPathname: "/",
  onSuccess: async ({ user, state, impersonator }) => {
    try {
      await recordAuthenticationSuccess({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, profilePictureUrl: user.profilePictureUrl });
    } catch (error) {
      // WorkOS authentication succeeded. A persistence/audit outage must not
      // invalidate the provider session; application-session resolution owns
      // the downstream tenancy/storage availability boundary.
      console.error("authentication_success_persistence_failed", authErrorDiagnostic(error));
    }
    const providerId = providerIdFromState(state);
    if (providerId && !impersonator) {
      try {
        const provider = await getWorkOS().userManagement.getInvitation(providerId);
        if (!canCompleteInvitation(provider, user)) return;
        const repository = new SupabaseIdentityTenancyRepository();
        const identity = await repository.userByWorkOSId(user.id);
        if (!identity) return;
        const invitationId = await repository.invitationIdForProvider(providerId, user.email);
        if (!invitationId) return;
        const result = await repository.customerInvitation({ p_operation: "accept", p_actor_id: identity.id, p_identity_id: user.id, p_correlation_id: randomUUID(), p_invitation_id: invitationId, p_email_verified: true });
        if (!result.ok) console.error("customer_invitation_completion_failed", { reason: "acceptance_denied" });
        else if (result.organizationId) {
          const maxAge = 60 * 60 * 24 * 30;
          (await cookies()).set(ACTIVE_ORGANIZATION_COOKIE, sealActiveOrganization({ userId: identity.id, organizationId: result.organizationId, expiresAt: Date.now() + maxAge * 1000 }), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge });
        }
      } catch { console.error("customer_invitation_completion_failed", { reason: "processing_unavailable" }); }
    }
  },
  onError: ({ error, request }) => {
    console.error("workos_auth_callback_failed", authErrorDiagnostic(error));
    if (authErrorDiagnostic(error).code === "missing_pkce_cookie" && !request.cookies.has("tk-auth-recovery")) {
      // Start a new SDK-verified flow once; never exchange the rejected code.
      const response = NextResponse.redirect(new URL("/auth/sign-in?returnTo=%2Finvitations", request.url));
      response.cookies.set("tk-auth-recovery", "1", { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "lax", path: "/auth", maxAge: 600 });
      return response;
    }
    return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Restart sign-in — TraceKit</title><main><h1>Let’s restart your sign-in</h1><p>Your sign-in session could not be verified. Your pending invitation is preserved.</p><a href="/auth/sign-in?returnTo=%2Finvitations">Continue to TraceKit</a></main></html>', { status: 400, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'" } });
  },
});
