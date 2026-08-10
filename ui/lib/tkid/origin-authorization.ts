import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";
import { requirePermission } from "@/lib/identity/authorization-gateway";

export const TKID_ORIGIN_RESOURCE_TYPE = "tkid_origin_registry";

export function canManageTkidOrigins(session: TraceKitSessionContext) {
  const organizationId = session.activeOrganization?.id;
  if (!organizationId || !session.activeBusinessContextId) return false;
  if (!session.effectivePermissions.includes("connectors.manage") || !session.effectivePermissions.includes("admin.manage_feature_access")) return false;
  return session.membership.role === "platform-admin" || session.permissionOverrides.some((override) =>
    override.effect === "allow" &&
    override.capability === "admin.manage_feature_access" &&
    override.organizationId === organizationId &&
    override.resourceType === TKID_ORIGIN_RESOURCE_TYPE,
  );
}

export function requireTkidOriginManagement(session: TraceKitSessionContext) {
  requirePermission(session, "connectors.manage");
  requirePermission(session, "admin.manage_feature_access");
  if (!canManageTkidOrigins(session)) throw new Error("The requested resource is unavailable.");
  return session;
}
