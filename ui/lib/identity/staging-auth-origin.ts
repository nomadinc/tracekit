// Opt-in WS-026 guard: run before AuthKit can issue PKCE cookies or sync identity.
export const WS026_AUTH_ORIGIN = "https://tracekit-staging-git-workstream-ws-026-product-8e47b1-tracekit.vercel.app";
export function stagingAuthOriginDecision(requestUrl: string, env: NodeJS.ProcessEnv = process.env):
  | { kind: "continue" } | { kind: "unavailable" } | { kind: "reject-callback" } | { kind: "redirect"; url: string } {
  if (!env.TRACEKIT_STAGING_AUTH_ORIGIN) return { kind: "continue" };
  if (env.TRACEKIT_STAGING_AUTH_ORIGIN !== WS026_AUTH_ORIGIN || env.VERCEL_ENV !== "preview" ||
      env.VERCEL_GIT_COMMIT_REF !== "workstream/ws-026-product-recovery" ||
      env.WORKOS_CLIENT_ID !== "client_01KZ1RW7ZH5X45Y1A8M3YAYDP5" ||
      env.NEXT_PUBLIC_SUPABASE_URL !== "https://joahiwgidfbzwzyslrbq.supabase.co" ||
      env.WORKOS_REDIRECT_URI !== `${WS026_AUTH_ORIGIN}/auth/callback` ||
      env.NEXT_PUBLIC_WORKOS_REDIRECT_URI !== `${WS026_AUTH_ORIGIN}/auth/callback` ||
      env.WORKOS_COOKIE_DOMAIN) return { kind: "unavailable" };
  const request = new URL(requestUrl);
  if (request.origin === WS026_AUTH_ORIGIN) return { kind: "continue" };
  // Never move OAuth code/state or cookies between hosts. Start a new flow instead.
  if (request.pathname === "/auth/callback") return { kind: "reject-callback" };
  const target = new URL(WS026_AUTH_ORIGIN);
  target.pathname = request.pathname;
  return { kind: "redirect", url: target.toString() };
}
