import type { AccountType, BusinessContext, Organization } from "./types";
import type { Permission, Role } from "./permissions";

export type PersistentUser = {
  id: string;
  workosUserId: string;
  primaryEmail: string;
  displayName: string;
  avatarUrl: string | null;
  status: "active" | "suspended" | "disabled";
};

export type PersistentAccount = { id: string; accountType: AccountType; name: string; status: string };
export type PersistentAgency = { id: string; accountId: string; name: string; status: string };
export type PersistentMembership = {
  id: string;
  userId: string;
  accountId: string | null;
  organizationId: string | null;
  role: Role;
  status: "invited" | "active" | "suspended" | "removed";
};
export type PermissionOverride = {
  id: string;
  membershipId: string;
  capability: Permission;
  effect: "allow" | "deny";
  organizationId: string | null;
  resourceType: string | null;
  resourceId: string | null;
};

export type TraceKitSessionContext = {
  user: PersistentUser;
  externalWorkosUserId: string;
  activeAccount: PersistentAccount;
  activeAgency: PersistentAgency | null;
  activeOrganization: Organization | null;
  availableOrganizations: Organization[];
  membership: PersistentMembership;
  role: Role;
  effectivePermissions: Permission[];
  permissionOverrides: PermissionOverride[];
  accessibleBusinessContexts: BusinessContext[];
  activeBusinessContextId: string | null;
  assurance: { authenticationMethod: string | null; impersonated: boolean };
  correlationId: string;
};

export type SafeClientSession = Omit<TraceKitSessionContext, "externalWorkosUserId" | "permissionOverrides">;

export type WorkOSIdentityInput = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  profilePictureUrl?: string | null;
};

export function serializeSessionForClient(session: TraceKitSessionContext): SafeClientSession {
  const { externalWorkosUserId: _external, permissionOverrides: _overrides, ...safe } = session;
  return structuredClone(safe);
}
