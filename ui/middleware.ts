import { authkitMiddleware } from "@workos-inc/authkit-nextjs";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { shouldBlockLegacyRealDataProxy } from "@/lib/identity/route-security";
import { developmentIdentityById } from "@/lib/identity/development-state";

export const DEVELOPMENT_REVIEW_HEADER = "x-tracekit-development-review";

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  // WS-030: fixed denial before session resolution, environment-based gates, or dispatch.
  if (/^\/api\/(?:edge\/intelligence-v1|admin\/edge-tenant-bindings|internal\/edge-intelligence-v1-staging-proof)(?:\/|$)/.test(request.nextUrl.pathname)) {
    return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const localDevelopment = process.env.NODE_ENV !== "production" && process.env.TRACEKIT_IDENTITY_MODE === "development" && process.env.TRACEKIT_ENABLE_DEV_IDENTITIES === "true";
  const hasWorkOSSession = request.cookies.has(process.env.WORKOS_COOKIE_NAME || "wos-session");
  const requestedDevelopmentIdentity = request.nextUrl.searchParams.get("dev_identity");
  const explicitDevelopmentReview = Boolean(
    localDevelopment &&
      !hasWorkOSSession &&
      requestedDevelopmentIdentity &&
      developmentIdentityById(requestedDevelopmentIdentity),
  );
  if (shouldBlockLegacyRealDataProxy(request.nextUrl.pathname, process.env.TRACEKIT_REAL_DATA_ENABLED === "true")) {
    return NextResponse.json({ error: "Real-data proxy access remains blocked pending tenant-scoped repository authorization." }, { status: 503 });
  }
  if (explicitDevelopmentReview) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(DEVELOPMENT_REVIEW_HEADER, requestedDevelopmentIdentity!);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }
  if (
    localDevelopment &&
    !hasWorkOSSession &&
    request.nextUrl.pathname.startsWith("/concepts/")
  )
    return NextResponse.next();

  const redirectUri = new URL("/auth/callback", request.nextUrl.origin).toString();
  return authkitMiddleware({
    redirectUri,
    middlewareAuth: {
      enabled: true,
      unauthenticatedPaths: ["/auth/:path*", "/api/health", "/api/cron/:path*", "/api/webhooks/shopify", "/api/next29/webhook/:path*", "/api/internal/next29-credential-repair", "/api/mcp", "/.well-known/oauth-protected-resource"],
    },
  })(request, event);
}

export const config = {
  matcher: [
    "/((?!_next/|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|map|woff|woff2|ttf|otf|eot|txt|xml|json|webmanifest)$).*)",
  ],
};
