import { randomUUID } from "node:crypto";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { identityMode, resolveIdentitySource } from "./identity-mode";
import { ROLE_PERMISSIONS } from "./permissions";
import type { IdentitySession } from "./types";
import type { SafeClientSession, TraceKitSessionContext, WorkOSIdentityInput } from "./persistent-types";
import { serializeSessionForClient } from "./persistent-types";
import { resolveEffectivePermissions, selectSessionMembership } from "./persistent-authorization";
import { SupabaseIdentityTenancyRepository } from "./supabase-identity-repository";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { ACTIVE_ORGANIZATION_COOKIE, readActiveOrganization } from "./active-organization-cookie";
import type { BusinessContext } from "./types";
import { MOCK_BUSINESS_CONTEXTS } from "./mock";
import { resolveUnaffiliatedSessionState } from "./first-admin-bootstrap";

const DEVELOPMENT_REVIEW_HEADER = "x-tracekit-development-review";

export type ApplicationSessionResolution =
  | { kind: "development" }
  | { kind: "authenticated"; session: TraceKitSessionContext; clientSession: SafeClientSession; legacySession: IdentitySession }
  | { kind: "bootstrap" }
  | { kind: "no-membership" }
  | { kind: "provider-unavailable" }
  | { kind: "unauthenticated" };

function configured() {
  return Boolean(process.env.WORKOS_CLIENT_ID && process.env.WORKOS_API_KEY && process.env.WORKOS_COOKIE_PASSWORD);
}

export async function synchronizeWorkOSUser(identity: WorkOSIdentityInput) {
  const repository = new SupabaseIdentityTenancyRepository();
  return repository.synchronizeUser(identity);
}

export async function recordAuthenticationSuccess(identity: WorkOSIdentityInput) {
  const repository = new SupabaseIdentityTenancyRepository();
  const user = await repository.synchronizeUser(identity);
  await repository.recordAuditEvent({ actorUserId: user.id, authenticatedIdentityId: identity.id, accountId: null, organizationId: null, action: "authentication.sign_in.succeeded", result: "success", correlationId: randomUUID(), metadata: { provider: "workos" } });
  return user;
}

export async function resolveAuthenticatedPersistentIdentity() {
  if (!configured()) return null;
  let auth: Awaited<ReturnType<typeof withAuth>>;
  try {
    auth = await withAuth();
  } catch {
    return null;
  }
  if (!auth.user) return null;
  const repository = new SupabaseIdentityTenancyRepository();
  const user = await repository.synchronizeUser({
    id: auth.user.id,
    email: auth.user.email,
    firstName: auth.user.firstName,
    lastName: auth.user.lastName,
    profilePictureUrl: auth.user.profilePictureUrl,
  });
  return { user, externalWorkosUserId: auth.user.id, repository };
}

export async function resolveApplicationSession(): Promise<ApplicationSessionResolution> {
  const requestHeaders = await headers();
  const requestedDevelopmentIdentity = requestHeaders.get(
    DEVELOPMENT_REVIEW_HEADER,
  );
  const developmentEnabled =
    identityMode() === "development" && Boolean(requestedDevelopmentIdentity);
  const providerConfigured = configured();
  if (!providerConfigured) return developmentEnabled ? { kind: "development" } : { kind: "provider-unavailable" };
  const jar = await cookies();
  const hasWorkOSSession = jar.has(process.env.WORKOS_COOKIE_NAME || "wos-session");
  let auth: Awaited<ReturnType<typeof withAuth>>;
  try {
    auth = await withAuth();
  } catch {
    return developmentEnabled && !hasWorkOSSession ? { kind: "development" } : { kind: "provider-unavailable" };
  }
  const source = resolveIdentitySource({ hasRealSession: Boolean(auth.user), developmentEnabled: developmentEnabled && !hasWorkOSSession, providerConfigured });
  if (source === "development") return { kind: "development" };
  if (source === "none") return { kind: "unauthenticated" };
  if (source === "provider-unavailable") return { kind: "provider-unavailable" };
  if (!auth.user) return { kind: "unauthenticated" };

  const repository = new SupabaseIdentityTenancyRepository();
  const correlationId = randomUUID();
  const user = await repository.synchronizeUser({
    id: auth.user.id,
    email: auth.user.email,
    firstName: auth.user.firstName,
    lastName: auth.user.lastName,
    profilePictureUrl: auth.user.profilePictureUrl,
  });
  const memberships = await repository.membershipsForUser(user.id);
  // An authenticated reviewer may hold an additional Account-level platform
  // entitlement. Keep the tenant session anchored to its Organization
  // membership; explicit capability overrides remain the narrow bridge for
  // Product/Admin review inside that Organization.
  const membership = selectSessionMembership(memberships);
  if (!membership) {
    const inactiveMemberships = await repository.inactiveMembershipsForUser(user.id);
    const deniedMembership = inactiveMemberships[0];
    if (deniedMembership) {
      await repository.recordAuditEvent({
        actorUserId: user.id,
        authenticatedIdentityId: auth.user.id,
        accountId: deniedMembership.accountId,
        organizationId: deniedMembership.organizationId,
        action: "user.access.denied",
        targetType: "membership",
        targetId: deniedMembership.id,
        result: "denied",
        correlationId,
        metadata: {
          reason: "no_active_membership",
          membership_status: deniedMembership.status,
          role: deniedMembership.role,
        },
      });
      return { kind: "no-membership" };
    }
    return resolveUnaffiliatedSessionState(() => repository.isEmptyInstallation());
  }
  const directlyScopedOrganizations = membership.organizationId ? await repository.organizationsForMembership(membership, null) : [];
  const accountId = membership.accountId || directlyScopedOrganizations[0]?.owningAccountId;
  if (!accountId) return { kind: "no-membership" };
  const account = await repository.accountById(accountId);
  if (!account || account.status !== "active") return { kind: "no-membership" };
  const agency = account.accountType === "agency" ? await repository.agencyByAccountId(account.id) : null;
  const organizationRecords = directlyScopedOrganizations.length ? directlyScopedOrganizations : await repository.organizationsForMembership(membership, agency);
  const organizations = organizationRecords.map((organization) => ({ id: organization.id, name: organization.name, mark: organization.name.slice(0, 2).toUpperCase(), accountId: organization.owningAccountId }));
  const overrides = await repository.permissionOverrides(membership.id);
  const permissions = Array.from(resolveEffectivePermissions(membership, overrides));
  const requestedOrganizationId = readActiveOrganization(jar.get(ACTIVE_ORGANIZATION_COOKIE)?.value, user.id);
  const activeOrganization = organizations.find((organization) => organization.id === requestedOrganizationId) || organizations[0] || null;
  // Display metadata remains mock-only; persistent access rows constrain which IDs may be shown.
  const allowedContextIds = activeOrganization ? await repository.businessContextIds(membership.id, activeOrganization.id) : [];
  const businessContexts: BusinessContext[] = activeOrganization
    ? MOCK_BUSINESS_CONTEXTS.filter((context) =>
        allowedContextIds.includes(context.id),
      ).map((context) => ({
        ...context,
        organizationId: activeOrganization.id,
      }))
    : [];
  const activeBusinessContextId = businessContexts[0]?.id ?? null;
  const session: TraceKitSessionContext = {
    user,
    externalWorkosUserId: auth.user.id,
    activeAccount: account,
    activeAgency: agency,
    activeOrganization,
    availableOrganizations: organizations,
    membership,
    role: membership.role,
    effectivePermissions: permissions,
    permissionOverrides: overrides,
    accessibleBusinessContexts: businessContexts,
    activeBusinessContextId,
    assurance: { authenticationMethod: null, impersonated: Boolean(auth.impersonator) },
    correlationId,
  };
  const legacySession: IdentitySession = {
    authenticated: true,
    developmentOnly: false,
    identity: {
      id: user.id,
      name: user.displayName,
      email: user.primaryEmail,
      title: membership.role,
      membership: {
        id: membership.id,
        accountId: account.id,
        accountName: account.name,
        accountType: account.accountType,
        role: membership.role,
        // Authorization uses persistent Organization IDs only. Mock repository
        // compatibility is resolved separately from the authorized Business Context.
        organizationIds: organizations.map((organization) => organization.id),
        grants: permissions.filter((permission) => !ROLE_PERMISSIONS[membership.role].includes(permission as never)),
      },
    },
    activeOrganizationId: activeOrganization?.id || null,
    activeBusinessContextId,
  };
  return { kind: "authenticated", session, clientSession: serializeSessionForClient(session), legacySession };
}
