import type { Permission } from "./permissions";
import { hasPermission } from "./authorization";
import { MOCK_BUSINESS_CONTEXTS, MOCK_ORGANIZATIONS } from "./mock";
import type { Identity, IdentitySession } from "./types";

export type MockRepositoryScope = {
  authenticated: boolean;
  identity: Identity;
  persistentOrganizationId: string | null;
  mockOrganizationId: string | null;
  persistentBusinessContextId: string | null;
  accessibleOfferIds: string[];
};

/**
 * The sole compatibility boundary between persistent tenancy and reviewed mock
 * read models. Authorization remains attached to the persistent Organization;
 * mock identifiers are derived only after that membership check succeeds.
 */
export function resolveMockRepositoryScope(session: IdentitySession): MockRepositoryScope {
  const persistentOrganizationId = session.activeOrganizationId;
  const persistentBusinessContextId = session.activeBusinessContextId;
  const organizationAuthorized = Boolean(
    session.authenticated &&
      persistentOrganizationId &&
      session.identity.membership.organizationIds.includes(persistentOrganizationId),
  );
  const context = persistentBusinessContextId
    ? MOCK_BUSINESS_CONTEXTS.find((candidate) => candidate.id === persistentBusinessContextId) ?? null
    : null;
  if (!organizationAuthorized || !context) {
    return {
      authenticated: session.authenticated,
      identity: session.identity,
      persistentOrganizationId,
      mockOrganizationId: null,
      persistentBusinessContextId,
      accessibleOfferIds: [],
    };
  }

  const accessibleOfferIds = session.developmentOnly
    ? MOCK_BUSINESS_CONTEXTS.filter((candidate) => candidate.organizationId === context.organizationId).map((candidate) => candidate.id)
    : [context.id];
  return {
    authenticated: true,
    identity: session.identity,
    persistentOrganizationId,
    mockOrganizationId: context.organizationId,
    persistentBusinessContextId,
    accessibleOfferIds,
  };
}

export function mockRepositoryScopeAllows(scope: MockRepositoryScope, permission: Permission): boolean {
  if (
    !scope.authenticated ||
    !scope.persistentOrganizationId ||
    !scope.mockOrganizationId ||
    !scope.persistentBusinessContextId ||
    !scope.identity.membership.organizationIds.includes(scope.persistentOrganizationId) ||
    !hasPermission(scope.identity, permission)
  ) return false;
  const context = MOCK_BUSINESS_CONTEXTS.find((candidate) => candidate.id === scope.persistentBusinessContextId);
  return Boolean(
    context &&
      context.organizationId === scope.mockOrganizationId &&
      MOCK_ORGANIZATIONS.some((organization) => organization.id === scope.mockOrganizationId) &&
      scope.accessibleOfferIds.includes(context.id) &&
      scope.accessibleOfferIds.every((offerId) =>
        MOCK_BUSINESS_CONTEXTS.some((candidate) => candidate.id === offerId && candidate.organizationId === scope.mockOrganizationId),
      ),
  );
}
