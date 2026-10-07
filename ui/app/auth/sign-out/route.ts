import { signedOutReturnUrl } from "@/lib/identity/auth-return-url";
import { signOut } from "@workos-inc/authkit-nextjs";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { SupabaseIdentityTenancyRepository } from "@/lib/identity/supabase-identity-repository";

export async function GET(request: Request) {
  const returnTo = signedOutReturnUrl(request.url);
  const resolution = await resolveApplicationSession();
  if (resolution.kind === "authenticated") {
    await new SupabaseIdentityTenancyRepository().recordAuditEvent({ actorUserId: resolution.session.user.id, authenticatedIdentityId: resolution.session.externalWorkosUserId, accountId: resolution.session.activeAccount.id, organizationId: resolution.session.activeOrganization?.id || null, action: "authentication.sign_out", result: "success", correlationId: resolution.session.correlationId });
  }
  await signOut({ returnTo });
  return new Response(null, { status: 204 });
}
