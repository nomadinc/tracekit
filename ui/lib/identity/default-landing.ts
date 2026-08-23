import type { Permission, Role } from "./permissions";
import type { TraceKitSessionContext } from "./persistent-types";

type LandingCandidate = {
  path: string;
  permission?: Permission;
  requiresBusinessContext?: boolean;
};

const MISSION_CONTROL: LandingCandidate = {
  path: "/",
  requiresBusinessContext: true,
};

const CUSTOMERS: LandingCandidate = { path: "/customers", permission: "customers.view" };
const ORDERS: LandingCandidate = { path: "/orders", permission: "orders.view" };
const MONEY: LandingCandidate = { path: "/money", permission: "financials.view" };
const OPERATIONS: LandingCandidate = { path: "/operations", permission: "imports.view" };
const TEAM: LandingCandidate = { path: "/team", permission: "users.view" };
const CLIENTS: LandingCandidate = { path: "/clients", permission: "organizations.view" };
const CONNECTIONS: LandingCandidate = { path: "/connections", permission: "connectors.view" };

export const ROLE_LANDING_PREFERENCES: Record<Role, readonly LandingCandidate[]> = {
  "platform-owner": [{ path: "/platform/organizations", permission: "admin.manage_tenants" }],
  "platform-admin": [{ path: "/platform/organizations", permission: "admin.manage_tenants" }],
  support: [{ path: "/platform/support", permission: "admin.manage_tenants" }],
  billing: [{ path: "/platform/billing", permission: "billing.view" }],
  "read-only-operations": [{ path: "/platform/system-health", permission: "audit_logs.view" }, CONNECTIONS],

  "agency-owner": [MISSION_CONTROL, CLIENTS, CUSTOMERS, ORDERS, TEAM],
  "agency-admin": [MISSION_CONTROL, CLIENTS, CUSTOMERS, ORDERS, TEAM],
  "team-member": [MISSION_CONTROL, CUSTOMERS, ORDERS, OPERATIONS],
  "agency-read-only": [MISSION_CONTROL, CUSTOMERS, ORDERS, CONNECTIONS],

  "organization-owner": [MISSION_CONTROL, CUSTOMERS, ORDERS, TEAM],
  "organization-admin": [MISSION_CONTROL, CUSTOMERS, ORDERS, TEAM],
  "analyst-operator": [MISSION_CONTROL, CUSTOMERS, ORDERS, OPERATIONS],
  finance: [MISSION_CONTROL, MONEY, ORDERS, CUSTOMERS],
  "customer-support": [MISSION_CONTROL, CUSTOMERS, ORDERS, CONNECTIONS],
  "client-read-only": [MISSION_CONTROL, CUSTOMERS, ORDERS, MONEY],
};

export function resolveDefaultLanding(
  session: Pick<TraceKitSessionContext, "role" | "effectivePermissions" | "accessibleBusinessContexts">,
): string {
  const permissions = new Set(session.effectivePermissions);
  const candidates = ROLE_LANDING_PREFERENCES[session.role] || [];

  for (const candidate of candidates) {
    if (candidate.requiresBusinessContext && session.accessibleBusinessContexts.length === 0) continue;
    if (candidate.permission && !permissions.has(candidate.permission)) continue;
    return candidate.path;
  }

  return "/access-pending";
}
