import type { Permission } from "./permissions";
import type {
  PermissionOverride,
  PersistentAccount,
  PersistentAgency,
  PersistentMembership,
  PersistentUser,
  WorkOSIdentityInput,
} from "./persistent-types";

export type PersistentOrganizationRecord = {
  id: string;
  owningAccountId: string;
  agencyId: string | null;
  workosOrganizationId: string | null;
  name: string;
  status: string;
};

export type AuditEventInput = {
  actorUserId: string | null;
  authenticatedIdentityId: string | null;
  accountId: string | null;
  organizationId: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  result: "success" | "denied" | "failure";
  permissionEvaluated?: Permission | null;
  correlationId: string;
  metadata?: Record<string, unknown>;
};

export type FirstAdminBootstrapInput = {
  userId: string;
  authenticatedIdentityId: string;
  organizationName: string;
  accountName: string;
  correlationId: string;
};

export type FirstAdminBootstrapResult = {
  accountId: string;
  organizationId: string;
  membershipId: string;
  roleKey: "organization-owner";
};

export interface IdentityTenancyRepository {
  synchronizeUser(identity: WorkOSIdentityInput): Promise<PersistentUser>;
  membershipsForUser(userId: string): Promise<PersistentMembership[]>;
  isEmptyInstallation(): Promise<boolean>;
  bootstrapFirstAdmin(input: FirstAdminBootstrapInput): Promise<FirstAdminBootstrapResult>;
  accountById(accountId: string): Promise<PersistentAccount | null>;
  agencyByAccountId(accountId: string): Promise<PersistentAgency | null>;
  organizationsForMembership(membership: PersistentMembership, agency: PersistentAgency | null): Promise<PersistentOrganizationRecord[]>;
  permissionOverrides(membershipId: string): Promise<PermissionOverride[]>;
  businessContextIds(membershipId: string, organizationId: string): Promise<string[]>;
  recordAuditEvent(event: AuditEventInput): Promise<void>;
}

const REDACTED_KEYS = /token|secret|password|authorization|cookie|email|phone|click|transaction/i;
export function redactAuditMetadata(metadata: Record<string, unknown> = {}) {
  return Object.fromEntries(Object.entries(metadata).map(([key, value]) => [key, REDACTED_KEYS.test(key) ? "[REDACTED]" : value]));
}
