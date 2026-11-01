import { authorize, effectivePermissions } from "./authorization";
import type { IdentitySession } from "./types";

export type ProfitReportContext = {
  key: string;
  authorized: boolean;
};

export function profitReportContext(
  session: IdentitySession
): ProfitReportContext {
  const organizationId = session.activeOrganizationId;
  const identity = session.identity;

  const financial = authorize(
    identity,
    "financials.view",
    organizationId
  ).allowed;

  const detailed = authorize(
    identity,
    "orders.view_financials",
    organizationId
  ).allowed;

  const authorized =
    session.authenticated &&
    Boolean(organizationId) &&
    financial &&
    detailed;

  const permissions = Array.from(effectivePermissions(identity)).sort();

  const key = JSON.stringify({
    identityId: identity.id,
    membershipId: identity.membership.id,
    organizationId,
    businessContextId: session.activeBusinessContextId,
    permissions,
    authenticated: session.authenticated,
    adminClientView: session.adminClientView === true,
  });

  return { key, authorized };
}
