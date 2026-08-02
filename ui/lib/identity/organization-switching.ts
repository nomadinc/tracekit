import type { TraceKitSessionContext } from "./persistent-types";
import { requireOrganizationAccess } from "./authorization-gateway";
import type { IdentityTenancyRepository } from "./persistent-repository";

export async function authorizeOrganizationSwitch(session: TraceKitSessionContext, targetOrganizationId: string, repository: IdentityTenancyRepository) {
  const organization = requireOrganizationAccess(session, targetOrganizationId);
  await repository.recordAuditEvent({ actorUserId: session.user.id, authenticatedIdentityId: session.externalWorkosUserId, accountId: session.activeAccount.id, organizationId: organization.id, action: "organization.switched", targetType: "organization", targetId: organization.id, result: "success", correlationId: session.correlationId });
  return { organization, activeBusinessContextId: null, clearInvestigationState: true as const };
}
