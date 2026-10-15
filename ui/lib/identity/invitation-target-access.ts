import { tenantInvitationsEnabled } from "./tenant-invitation-feature";
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

/** Agency invitations never expand into unassigned client organizations. */
export async function resolveAgencyInvitationTargetAccess(
  session: TraceKitSessionContext,
  repository: Repository & Pick<IdentityTenancyRepository, "agencyByAccountId" | "organizationsForMembership" | "businessContexts">,
  accountId: string,
) {
  if (!tenantInvitationsEnabled()) throw new AuthorizationDeniedError();
  const platform = ["platform-owner", "platform-admin"].includes(session.membership.role) && !session.membership.organizationId;
  if (platform) {
    await requirePersistedPlatformAccess(session, repository, "admin.manage_tenants");
    await requirePersistedPlatformAccess(session, repository, "users.invite");
  } else if (session.membership.accountId !== accountId || session.membership.organizationId || !["agency-owner", "agency-admin"].includes(session.role) || !session.effectivePermissions.includes("users.invite")) throw new AuthorizationDeniedError();
  const account = await repository.accountById(accountId);
  const agency = await repository.agencyByAccountId(accountId);
  if (account?.accountType !== "agency" || account.status !== "active" || agency?.status !== "active") throw new AuthorizationDeniedError();
  const assigned = await repository.organizationsForMembership({ ...session.membership, organizationId: null, accountId }, agency);
  const groups = await Promise.all(assigned.filter(org => org.status === "active").map(async org => {
    const owner = await repository.accountById(org.owningAccountId);
    if (owner?.accountType !== "client" || owner.status !== "active") return [];
    if (!platform) {
      requireResourceScope({ ...session, availableOrganizations: [{ id: org.id, name: org.name, mark: "", accountId: org.owningAccountId }] }, org.id, "users.invite");
    }
    const contexts = platform ? await repository.activeBusinessContextsForOrganization(org.id) : await repository.businessContexts(session.membership.id, org.id);
    return contexts.filter(context => context.organizationId === org.id).map(context => ({ ...context, name: `${org.name} / ${context.name}` }));
  }));
  return groups.flat();
}
