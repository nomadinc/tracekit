import { requirePersistedPlatformAccess } from "./platform-catalog-access";
import { AuthorizationDeniedError, requireResourceScope } from "./authorization-gateway";
import type { IdentityTenancyRepository } from "./persistent-repository";
import type { TraceKitSessionContext } from "./persistent-types";

type Repository = Pick<IdentityTenancyRepository, "membershipsForUser" | "accountById" | "permissionOverrides" | "allActiveOrganizations" | "activeBusinessContextsForOrganization">;

/** Expand only this invitation request after persisted platform authorization; never switch active context. */
export async function resolveInvitationTargetAccess(session: TraceKitSessionContext, repository: Repository, organizationId: string): Promise<TraceKitSessionContext> {
  const platformRole = ["platform-owner", "platform-admin", "support"].includes(session.membership.role);
  if (session.membership.organizationId || !platformRole) {
    requireResourceScope(session, organizationId, "users.invite");
    return session;
  }
  await requirePersistedPlatformAccess(session, repository, "admin.manage_tenants");
  await requirePersistedPlatformAccess(session, repository, "users.invite");
  const organization = (await repository.allActiveOrganizations()).find(candidate => candidate.id === organizationId);
  if (!organization || organization.status !== "active") throw new AuthorizationDeniedError();
  const account = await repository.accountById(organization.owningAccountId);
  if (!account || account.status !== "active" || account.accountType !== "client") throw new AuthorizationDeniedError();
  const contexts = (await repository.activeBusinessContextsForOrganization(organizationId))
    .filter(context => context.organizationId === organizationId);
  return { ...session, availableOrganizations: [{ id: organization.id, name: organization.name, mark: organization.name.slice(0, 2).toUpperCase(), accountId: organization.owningAccountId }], accessibleBusinessContexts: contexts };
}
