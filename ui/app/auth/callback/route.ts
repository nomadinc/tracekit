import { handleAuth } from "@workos-inc/authkit-nextjs";
import { synchronizeWorkOSUser } from "@/lib/identity/application-session";
import { recordScopedAuthenticationSuccess } from "@/lib/identity/authentication-audit";
import { reconcileAcceptedWorkOSInvitations } from "@/lib/identity/workos-invitation-reconciliation";

export const GET = handleAuth({
  returnPathname: "/",
  onSuccess: async ({ user }) => {
    const tracekitUser = await synchronizeWorkOSUser({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profilePictureUrl: user.profilePictureUrl,
    });
    try {
      await reconcileAcceptedWorkOSInvitations({
        tracekitUserId: tracekitUser.id,
        workosUserId: user.id,
        email: user.email,
      });
    } catch (error) {
      console.error("[TraceKit invitation reconciliation] failed", {
        message: error instanceof Error ? error.message.slice(0, 200) : "unknown",
      });
    }
    await recordScopedAuthenticationSuccess({
      user: tracekitUser,
      authenticatedIdentityId: user.id,
    });
  },
  onError: () => new Response("Authentication could not be completed.", { status: 400 }),
});
