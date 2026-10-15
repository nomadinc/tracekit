import { handleAuth } from "@workos-inc/authkit-nextjs";
import { recordAuthenticationSuccess } from "@/lib/identity/application-session";

import { authErrorDiagnostic } from "@/lib/identity/auth-error-diagnostic";

export const GET = handleAuth({
  returnPathname: "/",
  onSuccess: async ({ user }) => {
    try {
      await recordAuthenticationSuccess({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, profilePictureUrl: user.profilePictureUrl });
    } catch (error) {
      // WorkOS authentication succeeded. A persistence/audit outage must not
      // invalidate the provider session; application-session resolution owns
      // the downstream tenancy/storage availability boundary.
      console.error("authentication_success_persistence_failed", authErrorDiagnostic(error));
    }
  },
  onError: (...args: unknown[]) => {
    console.error("workos_auth_callback_failed", authErrorDiagnostic(args[0]));
    return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Sign-in needs to restart</title><main><h1>Sign-in needs to restart</h1><p>Your sign-in session could not be verified. Please start again.</p><a href="/">Start sign-in again</a></main></html>', { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
  },
});
