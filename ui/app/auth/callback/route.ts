import { handleAuth } from "@workos-inc/authkit-nextjs";
import { recordAuthenticationSuccess } from "@/lib/identity/application-session";

export const GET = handleAuth({
  returnPathname: "/",
  onSuccess: async ({ user }) => {
    await recordAuthenticationSuccess({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, profilePictureUrl: user.profilePictureUrl });
  },
  onError: () => new Response("Authentication could not be completed.", { status: 400 }),
});
