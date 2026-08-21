import type { IdentityTenancyRepository, AuditEventInput, FirstAdminBootstrapInput, PersistentOrganizationRecord } from "./persistent-repository";
import { redactAuditMetadata } from "./persistent-repository";
import type { PermissionOverride, PersistentAccount, PersistentAgency, PersistentMembership, PersistentUser, WorkOSIdentityInput } from "./persistent-types";
import type { Role } from "./permissions";

type Row = Record<string, unknown>;

function configuration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Persistent identity storage is unavailable.");
  return { url, key };
}

async function rest(path: string, init: RequestInit = {}) {
  const { url, key } = configuration();
  const headers: Record<string, string> = {
    apikey: key,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  // Supabase's newer secret keys authenticate via `apikey` and are not JWTs.
  // Sending one as a Bearer token makes PostgREST attempt JWT validation and
  // can turn an otherwise valid service request into a 401. Legacy JWT
  // service-role keys still require the Bearer header.
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    headers: { ...headers, ...init.headers },
  });
  if (!response.ok) throw new Error(`Persistent identity storage failed (${response.status}).`);
  return response.status === 204 ? [] : response.json();
}

const user = (row: Row): PersistentUser => ({ id: String(row.id), workosUserId: String(row.workos_user_id), primaryEmail: String(row.primary_email), displayName: String(row.display_name), avatarUrl: row.avatar_url ? String(row.avatar_url) : null, status: row.status as PersistentUser["status"] });

export class SupabaseIdentityTenancyRepository implements IdentityTenancyRepository {
  async synchronizeUser(identity: WorkOSIdentityInput) {
    const displayName = [identity.firstName, identity.lastName].filter(Boolean).join(" ") || identity.email;
    const rows = await rest("tracekit_users?on_conflict=workos_user_id", { method: "POST", body: JSON.stringify({ workos_user_id: identity.id, primary_email: identity.email, display_name: displayName, avatar_url: identity.profilePictureUrl || null, last_sign_in_at: new Date().toISOString(), updated_at: new Date().toISOString() }), headers: { Prefer: "resolution=merge-duplicates,return=representation" } }) as Row[];
    if (!rows[0]) throw new Error("Authenticated user synchronization returned no record.");
    return user(rows[0]);
  }

  async membershipsForUser(userId: string) {
    const rows = await rest(`tracekit_memberships?user_id=eq.${encodeURIComponent(userId)}&status=eq.active&select=*,tracekit_roles(role_key)`) as Array<Row & { tracekit_roles?: { role_key?: string } }>;
    return rows.map((row) => ({ id: String(row.id), userId: String(row.user_id), accountId: row.account_id ? String(row.account_id) : null, organizationId: row.organization_id ? String(row.organization_id) : null, role: String(row.tracekit_roles?.role_key) as Role, status: row.status as PersistentMembership["status"] }));
  }

  async isEmptyInstallation() {
    const [organizations, accounts, memberships] = await Promise.all([
      rest("tracekit_organizations?select=id&limit=1"),
      rest("tracekit_accounts?select=id&limit=1"),
      rest("tracekit_memberships?select=id&limit=1"),
    ]) as [Row[], Row[], Row[]];
    return organizations.length === 0 && accounts.length === 0 && memberships.length === 0;
  }

  async bootstrapFirstAdmin(input: FirstAdminBootstrapInput) {
    const rows = await rest("rpc/bootstrap_tracekit_first_admin", {
      method: "POST",
      body: JSON.stringify({
        p_user_id: input.userId,
        p_authenticated_identity_id: input.authenticatedIdentityId,
        p_organization_name: input.organizationName,
        p_account_name: input.accountName,
        p_correlation_id: input.correlationId,
      }),
    }) as Row[];
    const row = rows[0];
    if (!row) throw new Error("TraceKit bootstrap did not create an installation.");
    return {
      accountId: String(row.account_id),
      organizationId: String(row.organization_id),
      membershipId: String(row.membership_id),
      roleKey: "organization-owner" as const,
    };
  }

  async accountById(accountId: string) {
    const rows = await rest(`tracekit_accounts?id=eq.${encodeURIComponent(accountId)}&limit=1`) as Row[];
    const row = rows[0];
    return row ? { id: String(row.id), accountType: row.account_type as PersistentAccount["accountType"], name: String(row.name), status: String(row.status) } : null;
  }

  async agencyByAccountId(accountId: string) {
    const rows = await rest(`tracekit_agencies?account_id=eq.${encodeURIComponent(accountId)}&limit=1`) as Row[];
    const row = rows[0];
    return row ? { id: String(row.id), accountId: String(row.account_id), name: String(row.name), status: String(row.status) } : null;
  }

  async organizationsForMembership(membership: PersistentMembership, agency: PersistentAgency | null) {
    let path: string;
    if (membership.organizationId) path = `tracekit_organizations?id=eq.${encodeURIComponent(membership.organizationId)}&status=eq.active`;
    else if (agency) path = `tracekit_agency_client_assignments?agency_id=eq.${encodeURIComponent(agency.id)}&status=eq.active&select=tracekit_organizations(*)`;
    else path = "tracekit_organizations?id=eq.00000000-0000-0000-0000-000000000000";
    const rows = await rest(path) as Array<Row & { tracekit_organizations?: Row }>;
    return rows.map((source) => source.tracekit_organizations || source).map((row): PersistentOrganizationRecord => ({ id: String(row.id), owningAccountId: String(row.owning_account_id), agencyId: row.agency_id ? String(row.agency_id) : null, workosOrganizationId: row.workos_organization_id ? String(row.workos_organization_id) : null, name: String(row.name), status: String(row.status) }));
  }

  async permissionOverrides(membershipId: string) {
    const rows = await rest(`tracekit_permission_overrides?membership_id=eq.${encodeURIComponent(membershipId)}`) as Row[];
    return rows.map((row) => ({ id: String(row.id), membershipId: String(row.membership_id), capability: row.capability as PermissionOverride["capability"], effect: row.effect as PermissionOverride["effect"], organizationId: row.organization_id ? String(row.organization_id) : null, resourceType: row.resource_type ? String(row.resource_type) : null, resourceId: row.resource_id ? String(row.resource_id) : null }));
  }

  async businessContextIds(membershipId: string, organizationId: string) {
    const rows = await rest(`tracekit_business_context_access?membership_id=eq.${encodeURIComponent(membershipId)}&organization_id=eq.${encodeURIComponent(organizationId)}&status=eq.active&select=business_context_id`) as Row[];
    return rows.map((row) => String(row.business_context_id));
  }

  async recordAuditEvent(event: AuditEventInput) {
    await rest("tracekit_audit_events", { method: "POST", body: JSON.stringify({ actor_user_id: event.actorUserId, authenticated_identity_id: event.authenticatedIdentityId, account_id: event.accountId, organization_id: event.organizationId, action: event.action, target_type: event.targetType || null, target_id: event.targetId || null, result: event.result, permission_evaluated: event.permissionEvaluated || null, correlation_id: event.correlationId, metadata: redactAuditMetadata(event.metadata) }) });
  }
}
