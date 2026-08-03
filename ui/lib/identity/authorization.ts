import { ROLE_PERMISSIONS, type Permission } from "./permissions";
import { MOCK_BUSINESS_CONTEXTS, MOCK_ORGANIZATIONS } from "./mock";
import type { BusinessContext, Identity, IdentitySession, Organization, ShellVariant } from "./types";

export function effectivePermissions(identity: Identity): ReadonlySet<Permission> {
  const permissions = new Set<Permission>(ROLE_PERMISSIONS[identity.membership.role]);
  for (const grant of identity.membership.grants || []) permissions.add(grant);
  for (const denial of identity.membership.denials || []) permissions.delete(denial);
  return permissions;
}

export function hasPermission(identity: Identity, permission: Permission) {
  return effectivePermissions(identity).has(permission);
}

export function hasAnyPermission(identity: Identity, permissions: readonly Permission[]) {
  const effective = effectivePermissions(identity);
  return permissions.some((permission) => effective.has(permission));
}

export function satisfiesPermissionRequirement(identity: Identity, requirement: Permission | readonly Permission[]) {
  return typeof requirement === "string" ? hasPermission(identity, requirement) : hasAnyPermission(identity, requirement);
}

export function shellVariant(identity: Identity): ShellVariant {
  if (identity.membership.accountType === "platform") return "product-admin";
  if (identity.membership.accountType === "agency") return "agency";
  return "client";
}

export function accessibleOrganizations(identity: Identity): Organization[] {
  if (identity.membership.accountType === "platform") return [];
  const allowed = new Set(identity.membership.organizationIds);
  return MOCK_ORGANIZATIONS.filter((organization) => allowed.has(organization.id));
}

export function accessibleBusinessContexts(identity: Identity, organizationId: string | null): BusinessContext[] {
  if (!organizationId || !hasPermission(identity, "offers.view")) return [];
  if (!accessibleOrganizations(identity).some((organization) => organization.id === organizationId)) return [];
  return MOCK_BUSINESS_CONTEXTS.filter((context) => context.organizationId === organizationId);
}

export function normalizeSession(session: IdentitySession): IdentitySession {
  const organizations = accessibleOrganizations(session.identity);
  const activeOrganizationId = organizations.some((organization) => organization.id === session.activeOrganizationId)
    ? session.activeOrganizationId
    : organizations[0]?.id || null;
  const contexts = accessibleBusinessContexts(session.identity, activeOrganizationId);
  const activeBusinessContextId = contexts.some((context) => context.id === session.activeBusinessContextId)
    ? session.activeBusinessContextId
    : contexts[0]?.id || null;
  return { ...session, activeOrganizationId, activeBusinessContextId };
}

export function authorize(identity: Identity, required: Permission | readonly Permission[], organizationId?: string | null) {
  const permissions = Array.isArray(required) ? required : [required];
  const permissionAllowed = permissions.some((permission) => hasPermission(identity, permission));
  if (!permissionAllowed) return { allowed: false as const, reason: "Missing required permission." };
  if (organizationId && !identity.membership.organizationIds.includes(organizationId)) {
    return { allowed: false as const, reason: "The active Organization is outside this membership's allowed data scope." };
  }
  return { allowed: true as const, reason: null };
}

export function authorizeShellVariant(identity: Identity, variants: readonly ShellVariant[]) {
  const variant = shellVariant(identity);
  return variants.includes(variant)
    ? { allowed: true as const, reason: null }
    : { allowed: false as const, reason: `This destination belongs to the ${variants.join(" or ")} shell.` };
}
