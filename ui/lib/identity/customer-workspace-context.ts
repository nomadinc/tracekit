import { authorize, effectivePermissions } from "./authorization";
import type { IdentitySession } from "./types";

export function customerWorkspaceContext(session: IdentitySession) {
  const identity = session.identity;
  const organizationId = session.activeOrganizationId;

  const authorized =
    session.authenticated &&
    Boolean(organizationId) &&
    authorize(identity, "customers.view", organizationId).allowed &&
    ["client", "agency"].includes(identity.membership.accountType);

  const key = JSON.stringify({
    identityId: identity.id,
    membershipId: identity.membership.id,
    organizationId,
    businessContextId: session.activeBusinessContextId,
    authenticated: session.authenticated,
    accountType: identity.membership.accountType,
    role: identity.membership.role,
    permissions: Array.from(effectivePermissions(identity)).sort(),
    allowedOrganizations: [...identity.membership.organizationIds].sort(),
    adminClientView: session.adminClientView === true,
  });

  return { key, authorized };
}
