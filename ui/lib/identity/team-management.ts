import type { AccountType } from "./types";
import type { Role } from "./permissions";

export const TEAM_ROLES_BY_ACCOUNT_TYPE = {
  platform: ["platform-owner", "platform-admin", "support", "billing", "read-only-operations"],
  agency: ["agency-owner", "agency-admin", "team-member", "agency-read-only"],
  client: ["organization-owner", "organization-admin", "analyst-operator", "finance", "customer-support", "client-read-only"],
} as const satisfies Record<AccountType, readonly Role[]>;

export const OWNER_ROLE_BY_ACCOUNT_TYPE = {
  platform: "platform-owner",
  agency: "agency-owner",
  client: "organization-owner",
} as const satisfies Record<AccountType, Role>;

export type TeamMembershipStatus = "invited" | "active" | "suspended" | "removed";
export type TeamInvitationStatus = "pending" | "accepted" | "expired" | "revoked";

export class TeamManagementError extends Error {
  constructor(readonly code: "invalid_email" | "invalid_role" | "invalid_transition" | "final_owner" | "identity_mismatch" | "invitation_unavailable") {
    super(code);
  }
}

export function normalizeInvitationEmail(value: unknown) {
  if (typeof value !== "string") throw new TeamManagementError("invalid_email");
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new TeamManagementError("invalid_email");
  }
  return email;
}

export function requireRoleForAccountType(accountType: AccountType, role: unknown): Role {
  if (typeof role !== "string" || !(TEAM_ROLES_BY_ACCOUNT_TYPE[accountType] as readonly string[]).includes(role)) {
    throw new TeamManagementError("invalid_role");
  }
  return role as Role;
}

export function assertMembershipStatusTransition(current: TeamMembershipStatus, next: TeamMembershipStatus) {
  const allowed: Record<TeamMembershipStatus, readonly TeamMembershipStatus[]> = {
    invited: ["active", "suspended", "removed"],
    active: ["suspended", "removed"],
    suspended: ["active", "removed"],
    removed: [],
  };
  if (current === next) return;
  if (!allowed[current].includes(next)) throw new TeamManagementError("invalid_transition");
}

export function assertInvitationStatusTransition(current: TeamInvitationStatus, next: TeamInvitationStatus) {
  const allowed: Record<TeamInvitationStatus, readonly TeamInvitationStatus[]> = {
    pending: ["accepted", "expired", "revoked"],
    accepted: [],
    expired: [],
    revoked: [],
  };
  if (current === next) return;
  if (!allowed[current].includes(next)) throw new TeamManagementError("invalid_transition");
}

export function assertInvitationIdentity(intendedEmail: string, authenticatedEmail: string) {
  if (normalizeInvitationEmail(intendedEmail) !== normalizeInvitationEmail(authenticatedEmail)) {
    throw new TeamManagementError("identity_mismatch");
  }
}

export function assertInvitationAvailable(input: { status: TeamInvitationStatus; expiresAt: string }, now = new Date()) {
  if (input.status !== "pending") throw new TeamManagementError("invitation_unavailable");
  if (!Number.isFinite(Date.parse(input.expiresAt)) || Date.parse(input.expiresAt) <= now.getTime()) {
    throw new TeamManagementError("invitation_unavailable");
  }
}

export function assertOwnerMutationAllowed(input: {
  accountType: AccountType;
  currentRole: Role;
  nextRole?: Role | null;
  nextStatus?: TeamMembershipStatus;
  activeOwnerCount: number;
}) {
  const ownerRole = OWNER_ROLE_BY_ACCOUNT_TYPE[input.accountType];
  if (input.currentRole !== ownerRole) return;
  const removesOwnership =
    (input.nextRole !== undefined && input.nextRole !== null && input.nextRole !== ownerRole) ||
    (input.nextStatus !== undefined && input.nextStatus !== "active");
  if (removesOwnership && input.activeOwnerCount <= 1) throw new TeamManagementError("final_owner");
}
