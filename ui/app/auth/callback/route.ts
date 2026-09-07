import { handleAuth } from "@workos-inc/authkit-nextjs";
import { recordAuthenticationSuccess } from "@/lib/identity/application-session";

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
  onSuccess: async ({ user }) => {
    await recordAuthenticationSuccess({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, profilePictureUrl: user.profilePictureUrl });
  },
  onError: (...args: unknown[]) => {
    console.error("workos_auth_callback_failed", authErrorDiagnostic(args[0]));
    return new Response("Authentication could not be completed.", { status: 400 });
  },
});
