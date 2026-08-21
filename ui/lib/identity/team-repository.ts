import type { AccountType } from "./types";
import type { Role } from "./permissions";
import type { TeamInvitationStatus, TeamMembershipStatus } from "./team-management";

export type TeamScope = {
  accountId: string;
  organizationId: string | null;
  accountType: AccountType;
};

export type TeamMemberRecord = {
  membershipId: string;
  userId: string;
  displayName: string;
  primaryEmail: string;
  avatarUrl: string | null;
  role: Role;
  status: TeamMembershipStatus;
  lastSignInAt: string | null;
};

export type TeamInvitationRecord = {
  id: string;
  intendedEmail: string;
  role: Role;
  status: TeamInvitationStatus;
  expiresAt: string;
  createdAt: string;
  workosInvitationId: string | null;
};

export type TeamAuditInput = {
  actorUserId: string;
  authenticatedIdentityId: string;
  scope: TeamScope;
  action: string;
  targetType: "membership" | "invitation";
  targetId: string;
  result: "success" | "denied" | "failure";
  permissionEvaluated: "users.view" | "users.invite" | "users.remove" | "users.manage_permissions";
  correlationId: string;
  metadata?: Record<string, unknown>;
};

export interface TeamRepository {
  listMembers(scope: TeamScope): Promise<TeamMemberRecord[]>;
  listInvitations(scope: TeamScope): Promise<TeamInvitationRecord[]>;
  roleExistsForAccountType(role: Role, accountType: AccountType): Promise<boolean>;
  invitationById(invitationId: string): Promise<(TeamInvitationRecord & { targetAccountId: string | null; targetOrganizationId: string | null }) | null>;
  invitationByWorkOSId(workosInvitationId: string): Promise<(TeamInvitationRecord & { targetAccountId: string | null; targetOrganizationId: string | null }) | null>;
  membershipById(membershipId: string): Promise<(TeamMemberRecord & { accountId: string | null; organizationId: string | null }) | null>;
  countActiveOwners(scope: TeamScope, ownerRole: Role): Promise<number>;
  workosOrganizationIdForScope(scope: TeamScope): Promise<string | null>;
  createInvitation(input: { inviterUserId: string; intendedEmail: string; scope: TeamScope; role: Role; expiresAt: string; workosInvitationId?: string | null }): Promise<TeamInvitationRecord>;
  setInvitationDelivery(input: { invitationId: string; workosInvitationId: string; expiresAt?: string | null }): Promise<void>;
  revokeInvitation(invitationId: string): Promise<void>;
  markInvitationExpired(invitationId: string): Promise<void>;
  acceptInvitation(input: { invitationId: string; acceptedByUserId: string; authenticatedIdentityId: string; correlationId: string }): Promise<TeamMemberRecord>;
  updateMembership(input: { membershipId: string; role?: Role; status?: TeamMembershipStatus; actorUserId: string; authenticatedIdentityId: string; permissionEvaluated: "users.remove" | "users.manage_permissions"; correlationId: string }): Promise<TeamMemberRecord>;
  recordAuditEvent(input: TeamAuditInput): Promise<void>;
}
