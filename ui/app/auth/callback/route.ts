import { handleAuth } from "@workos-inc/authkit-nextjs";
import { recordAuthenticationSuccess } from "@/lib/identity/application-session";
import { reconcileAcceptedWorkOSInvitations } from "@/lib/identity/workos-invitation-reconciliation";

export const GET = handleAuth({
  returnPathname: "/",
  onSuccess: async ({ user }) => {
    const tracekitUser = await recordAuthenticationSuccess({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, profilePictureUrl: user.profilePictureUrl });
    try {
      await reconcileAcceptedWorkOSInvitations({ tracekitUserId: tracekitUser.id, workosUserId: user.id, email: user.email });
    } catch (error) {
      console.error("[TraceKit invitation reconciliation] failed", { message: error instanceof Error ? error.message.slice(0, 200) : "unknown" });
    }
  },
  onError: () => new Response("Authentication could not be completed.", { status: 400 }),
});
