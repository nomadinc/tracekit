import { randomUUID } from "node:crypto";
import type { IdentityTenancyRepository } from "@/lib/identity/persistent-repository";
import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";
import { resolveEffectivePermissions } from "@/lib/identity/persistent-authorization";
import type { BusinessContext } from "@/lib/identity/types";
import { MOCK_BUSINESS_CONTEXTS } from "@/lib/identity/mock";

export type McpExternalIdentity = {
  workosUserId: string;
  workosOrganizationId?: string | null;
  authenticationMethod?: string | null;
};

export async function resolveMcpExternalSession(
  identity: McpExternalIdentity,
  repository: IdentityTenancyRepository,
): Promise<TraceKitSessionContext | null> {
  if (!identity.workosUserId) return null;
  const user = await repository.userByWorkOSId(identity.workosUserId);
  if (!user || user.status !== "active") return null;

  const memberships = (await repository.membershipsForUser(user.id)).filter((candidate) => candidate.status === "active");
  let membership = null as (typeof memberships)[number] | null;
  let organizationRecord = null as Awaited<ReturnType<IdentityTenancyRepository["organizationByWorkOSId"]>>;

  if (identity.workosOrganizationId) {
    organizationRecord = await repository.organizationByWorkOSId(identity.workosOrganizationId);
    if (!organizationRecord || organizationRecord.status !== "active") return null;
    membership = memberships.find((candidate) => candidate.organizationId === organizationRecord!.id) || null;
  } else {
    const organizationMemberships = memberships.filter((candidate) => Boolean(candidate.organizationId));
    if (organizationMemberships.length !== 1) return null;
    membership = organizationMemberships[0];
    const candidates = await repository.organizationsForMembership(membership, null);
    organizationRecord = candidates.find((candidate) => candidate.id === membership!.organizationId) || null;
  }
  if (!membership || !organizationRecord || organizationRecord.status !== "active") return null;

  const account = await repository.accountById(membership.accountId || organizationRecord.owningAccountId);
  if (!account || account.status !== "active") return null;
  const agency = account.accountType === "agency" ? await repository.agencyByAccountId(account.id) : null;
  const accessibleRecords = await repository.organizationsForMembership(membership, agency);
  if (!accessibleRecords.some((candidate) => candidate.id === organizationRecord.id)) return null;

  const overrides = await repository.permissionOverrides(membership.id);
  const effectivePermissions = Array.from(resolveEffectivePermissions(membership, overrides));
  const allowedContextIds = await repository.businessContextIds(membership.id, organizationRecord.id);
  const accessibleBusinessContexts: BusinessContext[] = MOCK_BUSINESS_CONTEXTS
    .filter((context) => allowedContextIds.includes(context.id))
    .map((context) => ({ ...context, organizationId: organizationRecord.id }));

  return {
    user,
    externalWorkosUserId: identity.workosUserId,
    activeAccount: account,
    activeAgency: agency,
    activeOrganization: { id: organizationRecord.id, name: organizationRecord.name, mark: organizationRecord.name.slice(0, 2).toUpperCase(), accountId: organizationRecord.owningAccountId },
    availableOrganizations: [{ id: organizationRecord.id, name: organizationRecord.name, mark: organizationRecord.name.slice(0, 2).toUpperCase(), accountId: organizationRecord.owningAccountId }],
    membership,
    role: membership.role,
    effectivePermissions,
    permissionOverrides: overrides,
    accessibleBusinessContexts,
    activeBusinessContextId: accessibleBusinessContexts[0]?.id ?? null,
    assurance: { authenticationMethod: identity.authenticationMethod || "oauth_bearer", impersonated: false },
    correlationId: randomUUID(),
  };
}
