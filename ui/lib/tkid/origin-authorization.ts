import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";
import { requirePermission } from "@/lib/identity/authorization-gateway";

export const TKID_ORIGIN_RESOURCE_TYPE = "tkid_origin_registry";

export function canManageTkidOrigins(session: TraceKitSessionContext) {
  const organizationId = session.activeOrganization?.id;
  if (!organizationId || !session.activeBusinessContextId) return false;
  if (!session.effectivePermissions.includes("connectors.manage")) return false;
  const privilegedRole = session.membership.role === "platform-owner" || session.membership.role === "platform-admin";
  const organizationOwner = session.membership.role === "organization-owner";
  const featureOverride = session.permissionOverrides.some((override) =>
    override.effect === "allow" &&
    override.capability === "admin.manage_feature_access" &&
    override.organizationId === organizationId &&
    override.resourceType === TKID_ORIGIN_RESOURCE_TYPE,
  );
  return privilegedRole || organizationOwner || (session.effectivePermissions.includes("admin.manage_feature_access") && featureOverride);
}

export function requireTkidOriginManagement(session: TraceKitSessionContext) {
  requirePermission(session, "connectors.manage");
  if (!canManageTkidOrigins(session)) throw new Error("The requested resource is unavailable.");
  return session;
}
