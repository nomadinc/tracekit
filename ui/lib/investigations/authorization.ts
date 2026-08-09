import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";
import { AuthorizationDeniedError, requireOrganizationAccess, requirePermission } from "@/lib/identity/authorization-gateway";

export function authorizeInvestigationAccess(session: TraceKitSessionContext, organizationId: string) {
  requirePermission(session, "admin.manage_feature_access");
  const organization = requireOrganizationAccess(session, organizationId);
  if (session.assurance.impersonated) throw new AuthorizationDeniedError();
  return { actorUserId: session.user.id, accountId: organization.accountId, organizationId: organization.id, correlationId: session.correlationId };
}
