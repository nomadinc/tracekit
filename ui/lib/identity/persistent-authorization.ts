import { ROLE_PERMISSIONS, type Permission } from "./permissions";
import type { PermissionOverride, PersistentMembership } from "./persistent-types";

export function selectSessionMembership(memberships: readonly PersistentMembership[]) {
  return memberships.find((candidate) => candidate.organizationId) || memberships[0];
}

export function resolveEffectivePermissions(membership: PersistentMembership, overrides: readonly PermissionOverride[]) {
  if (membership.status !== "active") return new Set<Permission>();
  const permissions = new Set<Permission>(ROLE_PERMISSIONS[membership.role]);
  for (const override of overrides) if (override.effect === "allow") permissions.add(override.capability);
  for (const override of overrides) if (override.effect === "deny") permissions.delete(override.capability);
  return permissions;
}
export function permissionDecision(
  membership: PersistentMembership,
  overrides: readonly PermissionOverride[],
  capability: Permission,
) {
  const denied = overrides.some((item) => item.capability === capability && item.effect === "deny");
  if (membership.status !== "active" || denied) return { allowed: false as const, reason: "access_denied" as const };
  return resolveEffectivePermissions(membership, overrides).has(capability)
    ? { allowed: true as const, reason: null }
    : { allowed: false as const, reason: "access_denied" as const };
}

export function canAccessSensitiveCustomerData(membership: PersistentMembership, overrides: readonly PermissionOverride[]) {
  return permissionDecision(membership, overrides, "customers.view_sensitive_data").allowed;
}

export function canAccessFinancialData(membership: PersistentMembership, overrides: readonly PermissionOverride[]) {
  return permissionDecision(membership, overrides, "financials.view").allowed;
}
