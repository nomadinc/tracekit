import { canonicalizeTkidOrigin } from "./tkid-origins.ts";

type TkidBrowserPreflightRoute = {
  allowedHeaders: readonly string[];
};

const TKID_BROWSER_PREFLIGHT_ROUTES: Readonly<Record<string, TkidBrowserPreflightRoute>> = {
  "/v1/tkid/bootstrap": {
    allowedHeaders: ["x-tracekit-bootstrap-key", "x-tracekit-source"],
  },
  "/v1/tkid/events": {
    allowedHeaders: ["content-type", "x-tracekit-source"],
  },
  // The managed SDK exposes handoff methods. Keep their existing browser surface
  // CORS-compatible without changing handoff authorization or enabling relay.
  "/v1/tkid/handoff": {
    allowedHeaders: ["content-type", "x-tracekit-source"],
  },
};

export function tkidBrowserPreflightRoute(pathname: string) {
  return TKID_BROWSER_PREFLIGHT_ROUTES[pathname] || null;
}

export function tkidPreflightRequestAllowed(
  route: TkidBrowserPreflightRoute,
  requestedMethod: string | null,
  requestedHeaders: string | null,
) {
  if ((requestedMethod || "").toUpperCase() !== "POST") return false;
  const allowed = new Set(route.allowedHeaders);
  const requested = (requestedHeaders || "")
    .split(",")
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);
  return requested.length > 0 && requested.every((header) => allowed.has(header));
}

export function tkidCorsHeaders(canonicalOrigin: string) {
  return {
    "access-control-allow-origin": canonicalOrigin,
    vary: "Origin",
  };
}

export function tkidPreflightResponseHeaders(
  route: TkidBrowserPreflightRoute,
  canonicalOrigin: string | null,
) {
  return {
    ...(canonicalOrigin ? tkidCorsHeaders(canonicalOrigin) : {}),
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": route.allowedHeaders.join(", "),
    vary: "Origin",
  };
}

/**
 * Authorize only the Origin for browser preflight. The result deliberately
 * carries no tenant/source identity: if several eligible sources share an
 * origin, eligibility is true when at least one exact managed origin is
 * eligible. The POST request must still bind its supplied public source ID to
 * the exact origin through resolveActiveTkidOrigin.
 */
export async function resolveEligibleTkidPreflightOrigin(db: any, requestOrigin: string | null) {
  let canonicalOrigin: string;
  try {
    canonicalOrigin = canonicalizeTkidOrigin(requestOrigin || "");
  } catch {
    return null;
  }

  const { data: origins, error: originsError } = await db
    .from("tkid_source_origins")
    .select("organization_id,source_id")
    .eq("canonical_origin", canonicalOrigin)
    .eq("lifecycle_status", "active")
    .eq("verification_state", "verified")
    .eq("role", "frontend");
  if (originsError || !Array.isArray(origins) || origins.length === 0) return null;

  const sourceIds = [...new Set(origins.map((origin: any) => origin.source_id).filter(Boolean))];
  if (sourceIds.length === 0) return null;
  const { data: sources, error: sourcesError } = await db
    .from("tkid_sources")
    .select("id,organization_id")
    .in("id", sourceIds)
    .in("status", ["shadow", "active"]);
  if (sourcesError || !Array.isArray(sources)) return null;

  const eligible = origins.some((origin: any) =>
    sources.some((source: any) =>
      source.id === origin.source_id && source.organization_id === origin.organization_id,
    ),
  );
  return eligible ? canonicalOrigin : null;
}
