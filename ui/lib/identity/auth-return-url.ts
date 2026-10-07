/** Server-owned destinations only; forwarded headers never authorize an origin. */
export function signedOutReturnUrl(requestUrl: string, env: NodeJS.ProcessEnv = process.env): string {
  const request = new URL(requestUrl);
  const configured = env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ? new URL(env.NEXT_PUBLIC_WORKOS_REDIRECT_URI) : null;
  const trusted = new Set<string>();
  if (configured && configured.protocol === "https:" && !configured.username && !configured.password) trusted.add(configured.origin);
  for (const host of [env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL]) {
    if (host && /^[a-z0-9.-]+\.vercel\.app$/i.test(host)) trusted.add(`https://${host}`);
  }
  trusted.add("https://app.trace-kit.io");
  const local = env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(request.hostname) && ["http:", "https:"].includes(request.protocol);
  if (request.username || request.password || (!trusted.has(request.origin) && !local)) throw new Error("Untrusted authentication return origin");
  // WorkOS registers the production signed-out page and the existing preview root.
  const pathname = request.origin === "https://app.trace-kit.io" || local ? "/auth/signed-out" : "/";
  return new URL(pathname, request.origin).toString();
}
