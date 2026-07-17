export const IDENTITY_RESOLVE_PATH = "/v1/identity/resolve";
export const IDENTITY_REVIEW_PATH = "/v1/identity/review";

export type IdentityRouteMatch =
  | {
      kind: "identity_resolve";
      method: "POST";
      path: typeof IDENTITY_RESOLVE_PATH;
      allowed_methods: ["POST"];
    }
  | {
      kind: "identity_review";
      method: "GET";
      path: typeof IDENTITY_REVIEW_PATH;
      allowed_methods: ["GET"];
    }
  | {
      kind: "method_not_allowed";
      route: "identity_resolve" | "identity_review";
      method: string;
      path: typeof IDENTITY_RESOLVE_PATH | typeof IDENTITY_REVIEW_PATH;
      allowed_methods: ["POST"] | ["GET"];
    };

export function normalizeApiPathname(pathname: unknown) {
  let path = String(pathname || "").trim();
  if (!path) return "/";
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  return path || "/";
}

export function matchIdentityRoute(method: unknown, pathname: unknown): IdentityRouteMatch | null {
  const verb = String(method || "").trim().toUpperCase();
  const path = normalizeApiPathname(pathname);

  if (path === IDENTITY_RESOLVE_PATH) {
    if (verb === "POST") {
      return {
        kind: "identity_resolve",
        method: "POST",
        path,
        allowed_methods: ["POST"],
      };
    }
    return {
      kind: "method_not_allowed",
      route: "identity_resolve",
      method: verb,
      path,
      allowed_methods: ["POST"],
    };
  }

  if (path === IDENTITY_REVIEW_PATH) {
    if (verb === "GET") {
      return {
        kind: "identity_review",
        method: "GET",
        path,
        allowed_methods: ["GET"],
      };
    }
    return {
      kind: "method_not_allowed",
      route: "identity_review",
      method: verb,
      path,
      allowed_methods: ["GET"],
    };
  }

  return null;
}
