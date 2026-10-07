import { AuthorizationDeniedError, requirePermission } from "./authorization-gateway";
import { isMembershipEffective, resolveEffectivePermissions } from "./persistent-authorization";
import type { Permission } from "./permissions";
import type { IdentityTenancyRepository } from "./persistent-repository";
import type { TraceKitSessionContext } from "./persistent-types";

type PlatformRepository = Pick<IdentityTenancyRepository, "membershipsForUser" | "accountById" | "permissionOverrides" | "allActiveOrganizations">;
const PLATFORM_ROLES = new Set(["platform-owner", "platform-admin", "support"]);

export async function requirePersistedPlatformAccess(session: TraceKitSessionContext, repository: PlatformRepository, permission: Permission) {
  requirePermission(session, permission);
  const current = session.membership;
  if (current.organizationId || !PLATFORM_ROLES.has(current.role)) throw new AuthorizationDeniedError();
  const membership = (await repository.membershipsForUser(session.user.id)).find(candidate =>
    candidate.id === current.id && candidate.userId === session.user.id && candidate.accountId === current.accountId &&
    candidate.role === current.role && !candidate.organizationId && isMembershipEffective(candidate));
  if (!membership?.accountId) throw new AuthorizationDeniedError();
  const account = await repository.accountById(membership.accountId);
  if (account?.accountType !== "platform" || account.status !== "active") throw new AuthorizationDeniedError();
  const overrides = await repository.permissionOverrides(membership.id);
  if (!resolveEffectivePermissions(membership, overrides).has(permission)) throw new AuthorizationDeniedError();
}

export async function readAuthorizedPlatformCatalog(session: TraceKitSessionContext, repository: PlatformRepository) {
  try { await requirePersistedPlatformAccess(session, repository, "admin.manage_tenants"); }
  catch (error) { if (error instanceof AuthorizationDeniedError) return []; throw error; }
  return (await repository.allActiveOrganizations()).map(organization => ({
    id: organization.id, name: organization.name, mark: organization.name.slice(0, 2).toUpperCase(), accountId: organization.owningAccountId,
  }));
}
