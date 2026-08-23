import type { TraceKitSessionContext } from "./persistent-types";
import { requirePermission } from "./authorization-gateway";

export type AgencyClientRecord = {
  organizationId: string;
  name: string;
  mark: string;
  accountId: string;
  active: boolean;
};

export function agencyClientScope(session: TraceKitSessionContext) {
  requirePermission(session, "organizations.view");
  if (session.activeAccount.accountType !== "agency" || !session.activeAgency) {
    throw new Error("agency_client_scope_unavailable");
  }
  return { accountId: session.activeAccount.id, agencyId: session.activeAgency.id };
}

export function agencyClientsFromSession(session: TraceKitSessionContext): AgencyClientRecord[] {
  agencyClientScope(session);
  return session.availableOrganizations.map((organization) => ({
    organizationId: organization.id,
    name: organization.name,
    mark: organization.mark,
    accountId: organization.accountId,
    active: true,
  }));
}
