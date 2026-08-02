const PUBLIC_PATH_PREFIXES = ["/auth/", "/api/health"] as const;

export function isPublicAuthenticationPath(pathname: string) {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname === prefix.replace(/\/$/, "") || pathname.startsWith(prefix));
}

export function isStaticAssetPath(pathname: string) {
  return (
    pathname.startsWith("/_next/") ||
    ["/favicon.ico", "/robots.txt", "/sitemap.xml", "/manifest.webmanifest"].includes(pathname) ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|map|woff|woff2|ttf|otf|eot|txt|xml|json|webmanifest)$/i.test(pathname)
  );
}

export function isProtectedApplicationPath(pathname: string) {
  return !isPublicAuthenticationPath(pathname) && !isStaticAssetPath(pathname);
}

export function shouldBlockLegacyRealDataProxy(pathname: string, realDataEnabled: boolean) {
  return realDataEnabled && pathname.startsWith("/api/") && pathname !== "/api/health" && !pathname.startsWith("/api/session/");
}
