import type { Role } from "./permissions";
import { redactAuditMetadata } from "./persistent-repository";
import type {
  TeamAuditInput,
  TeamInvitationRecord,
  TeamMemberRecord,
  TeamRepository,
  TeamScope,
} from "./team-repository";
import type { TeamInvitationStatus, TeamMembershipStatus } from "./team-management";

type Row = Record<string, unknown>;
type RoleJoin = { role_key?: string } | null;
type UserJoin = {
  id?: string;
  display_name?: string;
  primary_email?: string;
  avatar_url?: string | null;
  last_sign_in_at?: string | null;
} | null;

function configuration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Team storage is unavailable.");
  return { url, key };
}

async function rest(path: string, init: RequestInit = {}) {
  const { url, key } = configuration();
  const headers: Record<string, string> = {
    apikey: key,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    headers: { ...headers, ...init.headers },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const safeMessage = body.slice(0, 300).replace(/[\r\n]+/g, " ");
    throw new Error(`Team storage failed (${response.status})${safeMessage ? `: ${safeMessage}` : ""}`);
  }
  return response.status === 204 ? [] : response.json();
}

function scopeFilter(scope: TeamScope, accountColumn: string, organizationColumn: string) {
  return scope.organizationId
    ? `${organizationColumn}=eq.${encodeURIComponent(scope.organizationId)}`
    : `${accountColumn}=eq.${encodeURIComponent(scope.accountId)}`;
}

function mapMember(row: Row & { tracekit_users?: UserJoin; tracekit_roles?: RoleJoin }): TeamMemberRecord {
  const user = row.tracekit_users || {};
  const role = row.tracekit_roles || {};
  return {
    membershipId: String(row.id),
    userId: String(row.user_id || user.id || ""),
    displayName: String(user.display_name || ""),
    primaryEmail: String(user.primary_email || ""),
    avatarUrl: user.avatar_url ? String(user.avatar_url) : null,
    role: String(role.role_key || "") as Role,
    status: row.status as TeamMembershipStatus,
    lastSignInAt: user.last_sign_in_at ? String(user.last_sign_in_at) : null,
  };
}

function mapInvitation(row: Row & { tracekit_roles?: RoleJoin }): TeamInvitationRecord {
  return {
    id: String(row.id),
    intendedEmail: String(row.intended_email),
    role: String(row.tracekit_roles?.role_key || "") as Role,
    status: row.status as TeamInvitationStatus,
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
    workosInvitationId: row.workos_invitation_id ? String(row.workos_invitation_id) : null,
  };
}

async function roleId(role: Role, accountType?: TeamScope["accountType"]) {
  const filter = accountType ? `&account_type=eq.${encodeURIComponent(accountType)}` : "";
  const rows = await rest(`tracekit_roles?role_key=eq.${encodeURIComponent(role)}${filter}&system_role=eq.true&select=id,role_key,account_type&limit=1`) as Row[];
  return rows[0] ? String(rows[0].id) : null;
}

export class SupabaseTeamRepository implements TeamRepository {
  async listMembers(scope: TeamScope) {
    const filter = scopeFilter(scope, "account_id", "organization_id");
    const rows = await rest(`tracekit_memberships?${filter}&select=id,user_id,status,tracekit_users(id,display_name,primary_email,avatar_url,last_sign_in_at),tracekit_roles(role_key)&order=created_at.asc`) as Array<Row & { tracekit_users?: UserJoin; tracekit_roles?: RoleJoin }>;
    return rows.map(mapMember);
  }

  async listInvitations(scope: TeamScope) {
    const filter = scopeFilter(scope, "target_account_id", "target_organization_id");
    const rows = await rest(`tracekit_invitations?${filter}&select=id,intended_email,status,expires_at,created_at,workos_invitation_id,tracekit_roles:requested_role_id(role_key)&order=created_at.desc`) as Array<Row & { tracekit_roles?: RoleJoin }>;
    return rows.map(mapInvitation);
  }

  async roleExistsForAccountType(role: Role, accountType: TeamScope["accountType"]) {
    return Boolean(await roleId(role, accountType));
  }

  async invitationById(invitationId: string) {
    const rows = await rest(`tracekit_invitations?id=eq.${encodeURIComponent(invitationId)}&select=id,intended_email,status,expires_at,created_at,workos_invitation_id,target_account_id,target_organization_id,tracekit_roles:requested_role_id(role_key)&limit=1`) as Array<Row & { tracekit_roles?: RoleJoin }>;
    const row = rows[0];
    if (!row) return null;
    return {
      ...mapInvitation(row),
      targetAccountId: row.target_account_id ? String(row.target_account_id) : null,
      targetOrganizationId: row.target_organization_id ? String(row.target_organization_id) : null,
    };
  }

  async membershipById(membershipId: string) {
    const rows = await rest(`tracekit_memberships?id=eq.${encodeURIComponent(membershipId)}&select=id,user_id,account_id,organization_id,status,tracekit_users(id,display_name,primary_email,avatar_url,last_sign_in_at),tracekit_roles(role_key)&limit=1`) as Array<Row & { tracekit_users?: UserJoin; tracekit_roles?: RoleJoin }>;
    const row = rows[0];
    if (!row) return null;
    return {
      ...mapMember(row),
      accountId: row.account_id ? String(row.account_id) : null,
      organizationId: row.organization_id ? String(row.organization_id) : null,
    };
  }

  async countActiveOwners(scope: TeamScope, ownerRole: Role) {
    const filter = scopeFilter(scope, "account_id", "organization_id");
    const rows = await rest(`tracekit_memberships?${filter}&status=eq.active&select=id,tracekit_roles(role_key)`) as Array<Row & { tracekit_roles?: RoleJoin }>;
    return rows.filter((row) => row.tracekit_roles?.role_key === ownerRole).length;
  }

  async createInvitation(input: {
    inviterUserId: string;
    intendedEmail: string;
    scope: TeamScope;
    role: Role;
    expiresAt: string;
    workosInvitationId?: string | null;
  }) {
    const requestedRoleId = await roleId(input.role, input.scope.accountType);
    if (!requestedRoleId) throw new Error("invalid_role");
    const payload = {
      inviter_user_id: input.inviterUserId,
      intended_email: input.intendedEmail,
      target_account_id: input.scope.organizationId ? null : input.scope.accountId,
      target_organization_id: input.scope.organizationId,
      requested_role_id: requestedRoleId,
      workos_invitation_id: input.workosInvitationId || null,
      status: "pending",
      expires_at: input.expiresAt,
    };
    const rows = await rest("tracekit_invitations?select=id,intended_email,status,expires_at,created_at,workos_invitation_id,tracekit_roles:requested_role_id(role_key)", {
      method: "POST",
      body: JSON.stringify(payload),
    }) as Array<Row & { tracekit_roles?: RoleJoin }>;
    if (!rows[0]) throw new Error("invitation_create_failed");
    return mapInvitation(rows[0]);
  }

  async setInvitationDeliveryId(invitationId: string, workosInvitationId: string | null) {
    await rest(`tracekit_invitations?id=eq.${encodeURIComponent(invitationId)}&status=eq.pending`, {
      method: "PATCH",
      body: JSON.stringify({ workos_invitation_id: workosInvitationId, updated_at: new Date().toISOString() }),
    });
  }

  async revokeInvitation(invitationId: string) {
    await rest(`tracekit_invitations?id=eq.${encodeURIComponent(invitationId)}&status=eq.pending`, {
      method: "PATCH",
      body: JSON.stringify({ status: "revoked", updated_at: new Date().toISOString() }),
    });
  }

  async markInvitationExpired(invitationId: string) {
    await rest(`tracekit_invitations?id=eq.${encodeURIComponent(invitationId)}&status=eq.pending`, {
      method: "PATCH",
      body: JSON.stringify({ status: "expired", updated_at: new Date().toISOString() }),
    });
  }

  async acceptInvitation(input: { invitationId: string; acceptedByUserId: string; role: Role; scope: TeamScope }) {
    const rows = await rest("rpc/accept_tracekit_team_invitation", {
      method: "POST",
      body: JSON.stringify({
        p_invitation_id: input.invitationId,
        p_accepted_by_user_id: input.acceptedByUserId,
      }),
    }) as Row[];
    const membershipId = rows[0]?.membership_id ? String(rows[0].membership_id) : null;
    if (!membershipId) throw new Error("invitation_accept_failed");
    const member = await this.membershipById(membershipId);
    if (!member) throw new Error("accepted_membership_unavailable");
    return member;
  }

  async updateMembership(input: { membershipId: string; role?: Role; status?: TeamMembershipStatus }) {
    const rows = await rest("rpc/mutate_tracekit_team_membership", {
      method: "POST",
      body: JSON.stringify({
        p_membership_id: input.membershipId,
        p_new_role_key: input.role ?? null,
        p_new_status: input.status ?? null,
      }),
    }) as Row[];
    const membershipId = rows[0]?.membership_id ? String(rows[0].membership_id) : null;
    if (!membershipId) throw new Error("membership_update_failed");
    const member = await this.membershipById(membershipId);
    if (!member) throw new Error("updated_membership_unavailable");
    return member;
  }

  async recordAuditEvent(input: TeamAuditInput) {
    await rest("tracekit_audit_events", {
      method: "POST",
      body: JSON.stringify({
        actor_user_id: input.actorUserId,
        authenticated_identity_id: input.authenticatedIdentityId,
        account_id: input.scope.accountId,
        organization_id: input.scope.organizationId,
        action: input.action,
        target_type: input.targetType,
        target_id: input.targetId,
        result: input.result,
        permission_evaluated: input.permissionEvaluated,
        correlation_id: input.correlationId,
        metadata: redactAuditMetadata(input.metadata),
      }),
    });
  }
}
