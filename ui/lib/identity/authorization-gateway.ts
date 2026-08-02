import type { Permission } from "./permissions";
import type { TraceKitSessionContext } from "./persistent-types";

export class AuthorizationDeniedError extends Error {
  readonly code = "access_denied";
  constructor() { super("The requested resource is unavailable."); }
}
export function requireAuthenticatedUser(session: TraceKitSessionContext | null) {
  if (!session?.user || session.user.status !== "active") throw new AuthorizationDeniedError();
  return session.user;
}

export function requireActiveMembership(session: TraceKitSessionContext) {
  requireAuthenticatedUser(session);
  if (session.membership.status !== "active") throw new AuthorizationDeniedError();
  return session.membership;
}

export function requirePermission(session: TraceKitSessionContext, permission: Permission) {
  requireActiveMembership(session);
  if (!session.effectivePermissions.includes(permission)) throw new AuthorizationDeniedError();
  return session;
}

export function requireOrganizationAccess(session: TraceKitSessionContext, organizationId: string) {
  requireActiveMembership(session);
  const organization = session.availableOrganizations.find((candidate) => candidate.id === organizationId);
  if (!organization) throw new AuthorizationDeniedError();
  return organization;
}

export function requireResourceScope(session: TraceKitSessionContext, organizationId: string, permission: Permission) {
  requirePermission(session, permission);
  return requireOrganizationAccess(session, organizationId);
}

export function canAccessSensitiveCustomerData(session: TraceKitSessionContext) {
  return session.effectivePermissions.includes("customers.view_sensitive_data");
}

export function canAccessFinancialData(session: TraceKitSessionContext) {
  return session.effectivePermissions.includes("financials.view");
}
