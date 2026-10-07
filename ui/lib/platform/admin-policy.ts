import type { TraceKitSessionContext } from "../identity/persistent-types";
import type { Permission } from "../identity/permissions";
import {
  AuthorizationDeniedError,
  requirePermission,
} from "../identity/authorization-gateway";

export function requirePlatformAdmin(
  session: TraceKitSessionContext,
  permission: Permission = "admin.manage_tenants",
) {
  requirePermission(session, "admin.manage_tenants");
  requirePermission(session, permission);
  if (
    !session.membership.accountId ||
    session.membership.organizationId ||
    !["platform-owner", "platform-admin", "support"].includes(session.role)
  )
    throw new AuthorizationDeniedError();
  if (
    session.activeAccount.accountType !== "platform" &&
    !session.assurance.impersonated
  )
    throw new AuthorizationDeniedError();
  return session;
}

export function canReadPlatformCatalog(session: TraceKitSessionContext) {
  try {
    requirePlatformAdmin(session);
    return true;
  } catch {
    return false;
  }
}

export function requireSameOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new AuthorizationDeniedError();
}

export function validateClientInput(input: {
  name?: unknown;
  accountType?: unknown;
}) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (
    !name ||
    name.length > 120 ||
    !["client", "agency"].includes(String(input.accountType))
  )
    throw new Error("Enter a name and choose Advertiser or Agency.");
  return { name, accountType: input.accountType as "client" | "agency" };
}

export function platformMembershipWindowIsActive(row: { effective_from?: unknown; effective_until?: unknown }, now = Date.now()) {
  return typeof row.effective_from === "string" && Date.parse(row.effective_from) <= now &&
    (row.effective_until === null || (typeof row.effective_until === "string" && Date.parse(row.effective_until) > now));
}
