import { requirePermission, requireOrganizationAccess } from "../identity/authorization-gateway";
import type { TraceKitSessionContext } from "../identity/persistent-types";

export function authorizedMissionControlContext(session: TraceKitSessionContext) {
  requirePermission(session, "organizations.view");
  const organization = session.activeOrganization;
  if (!organization) return null;
  requireOrganizationAccess(session, organization.id);
  const context = session.accessibleBusinessContexts.find((candidate) =>
    candidate.id === session.activeBusinessContextId && candidate.organizationId === organization.id,
  );
  return context ? { organization, context } : null;
}
