import "server-only";
import { commercePersistenceRequest } from "../commerce/supabase-control-repository";
import { requirePlatformAdmin, platformMembershipWindowIsActive } from "./admin-policy";
import { AuthorizationDeniedError } from "../identity/authorization-gateway";
import type { TraceKitSessionContext } from "../identity/persistent-types";

/** Verify privileged scope without changing WS-020's shared identity adapters. */
export async function assertCanonicalPlatformMembership(session: TraceKitSessionContext) {
  requirePlatformAdmin(session);
  const rows = await commercePersistenceRequest(`tracekit_memberships?id=eq.${encodeURIComponent(session.membership.id)}&user_id=eq.${encodeURIComponent(session.user.id)}&account_id=eq.${encodeURIComponent(session.membership.accountId!)}&organization_id=is.null&status=eq.active&select=effective_from,effective_until,tracekit_accounts!inner(account_type,status),tracekit_roles!inner(role_key)&tracekit_accounts.account_type=eq.platform&tracekit_accounts.status=eq.active`);
  const row = rows[0];
  const role = row?.tracekit_roles as Record<string, unknown> | undefined;
  if (!row || role?.role_key !== session.role || !platformMembershipWindowIsActive(row)) throw new AuthorizationDeniedError();
}
