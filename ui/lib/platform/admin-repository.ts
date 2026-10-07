import "server-only";
import { commercePersistenceRequest as request } from "../commerce/supabase-control-repository";
import type { TraceKitSessionContext } from "../identity/persistent-types";
import { assertCanonicalPlatformMembership } from "./platform-access";
import { requirePlatformAdmin } from "./admin-policy";
import { resolveInvitationTargetAccess } from "../identity/invitation-target-access";
import { SupabaseIdentityTenancyRepository } from "../identity/supabase-identity-repository";
import { AuthorizationDeniedError } from "../identity/authorization-gateway";

export type Row = Record<string, unknown>;
async function all(path: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    const page = await request(`${path}&limit=500&offset=${offset}`);
    rows.push(...page);
    if (page.length < 500) return rows;
  }
  throw new Error("Catalog exceeds this view's supported size.");
}
export async function loadAdminCatalog(session: TraceKitSessionContext) {
  requirePlatformAdmin(session);
  await assertCanonicalPlatformMembership(session);
  const [accounts, organizations] = await Promise.all([
    all(
      "tracekit_accounts?account_type=in.(client,agency)&select=id,name,account_type,status&order=name.asc,id.asc",
    ),
    all(
      "tracekit_organizations?select=id,name,status,owning_account_id,agency_id&order=name.asc,id.asc",
    ),
  ]);
  return { accounts, organizations };
}
export async function loadAdminUsers(session: TraceKitSessionContext) {
  requirePlatformAdmin(session, "users.view");
  await assertCanonicalPlatformMembership(session, "users.view");
  const [users, memberships] = await Promise.all([
    all(
      "tracekit_users?select=id,display_name,primary_email,status&order=display_name.asc,id.asc",
    ),
    all(
      "tracekit_memberships?select=id,user_id,account_id,organization_id,status,tracekit_roles(role_key),tracekit_accounts(id,name),tracekit_organizations(id,name,owning_account_id)&order=created_at.asc,id.asc",
    ),
  ]);
  return { users, memberships };
}
export async function loadAdminConnections(
  session: TraceKitSessionContext,
  organizationId?: string,
) {
  requirePlatformAdmin(session, "connectors.view");
  await assertCanonicalPlatformMembership(session, "connectors.view");
  const filter = organizationId
    ? `&organization_id=eq.${encodeURIComponent(organizationId)}`
    : "";
  // Never select credential material, configuration, or provider raw payloads.
  const [commerce, marketing] = await Promise.all([
    all(
      `commerce_provider_connections?select=id,organization_id,provider,display_name,status,last_success_at,last_error_at,last_error_code&order=created_at.asc,id.asc${filter}`,
    ),
    all(
      `marketing_provider_connections?select=id,organization_id,provider,display_name,status,last_success_at,last_error_at,last_error_code&order=created_at.asc,id.asc${filter}`,
    ),
  ]);
  return [...commerce, ...marketing];
}
export async function loadClientDetail(
  session: TraceKitSessionContext,
  accountId: string,
) {
  requirePlatformAdmin(session);
  await assertCanonicalPlatformMembership(session);
  const accountRows = await request(
    `tracekit_accounts?id=eq.${encodeURIComponent(accountId)}&account_type=in.(client,agency)&select=id,name,account_type,status`,
  );
  const account = accountRows[0];
  if (!account) return null;
  const organizations = await all(
    `tracekit_organizations?owning_account_id=eq.${encodeURIComponent(accountId)}&select=id,name,status&order=name.asc,id.asc`,
  );
  const scopes =
    account.account_type === "agency"
      ? [null]
      : organizations.map((row) => String(row.id));
  const groups = await Promise.all(
    scopes.map(async (organizationId) => {
      const filter = organizationId
        ? `organization_id=eq.${encodeURIComponent(organizationId)}`
        : `account_id=eq.${encodeURIComponent(accountId)}`;
      let invitationContexts: Array<{ id: string; name: string }> | null = null;
      if (organizationId && session.effectivePermissions.includes("users.invite")) {
        try {
          const target = await resolveInvitationTargetAccess(session, new SupabaseIdentityTenancyRepository(), organizationId);
          invitationContexts = target.accessibleBusinessContexts.map(context => ({ id: context.id, name: context.name }));
        } catch (error) { if (!(error instanceof AuthorizationDeniedError)) throw error; }
      }
      const [memberships, invitations, contexts, offers, connections] =
        await Promise.all([
          session.effectivePermissions.includes("users.view")
            ? all(
                `tracekit_memberships?${filter}&select=id,status,tracekit_roles(role_key),tracekit_users(id,display_name,primary_email,status)&order=created_at.asc,id.asc`,
              )
            : Promise.resolve(null),
          session.effectivePermissions.includes("users.view")
            ? all(
                `tracekit_invitations?target_${filter}&select=id,intended_email,status,expires_at,tracekit_roles(role_key)&order=created_at.desc,id.desc`,
              )
            : Promise.resolve(null),
          organizationId && session.effectivePermissions.includes("offers.view")
            ? all(
                `tracekit_business_contexts?organization_id=eq.${encodeURIComponent(organizationId)}&select=id,name,status&order=name.asc,id.asc`,
              )
            : Promise.resolve(null),
          organizationId && session.effectivePermissions.includes("offers.view")
            ? all(
                `canonical_offers?organization_id=eq.${encodeURIComponent(organizationId)}&select=id,name,status&order=name.asc,id.asc`,
              )
            : Promise.resolve(null),
          organizationId &&
          session.effectivePermissions.includes("connectors.view")
            ? loadAdminConnections(session, organizationId)
            : Promise.resolve(null),
        ]);
      return {
        organizationId,
        name: organizationId
          ? String(organizations.find((row) => row.id === organizationId)?.name)
          : String(account.name),
        memberships,
        invitations,
        invitationContexts,
        contexts,
        offers,
        connections,
      };
    }),
  );
  const roles = await request(
    `tracekit_roles?account_type=eq.${account.account_type}&select=role_key,name&order=name.asc`,
  );
  return { account, organizations, groups, roles };
}
export async function adminRpc(
  session: TraceKitSessionContext,
  name: string,
  parameters: Row,
) {
  const rows = await request(`rpc/${name}`, {
    method: "POST",
    body: JSON.stringify({
      p_actor: session.user.id,
      p_identity: session.externalWorkosUserId,
      p_correlation: session.correlationId,
      ...parameters,
    }),
  });
  return rows[0];
}
export { request as adminPersistenceRequest };
