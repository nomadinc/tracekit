import "server-only";
import { SupabaseIdentityTenancyRepository } from "../identity/supabase-identity-repository";
import { requirePersistedPlatformAccess } from "../identity/platform-catalog-access";
import type { Permission } from "../identity/permissions";
import type { TraceKitSessionContext } from "../identity/persistent-types";

/** Share canonical membership validity and persisted permission overrides with WS-020. */
export async function assertCanonicalPlatformMembership(session: TraceKitSessionContext, permission: Permission = "admin.manage_tenants") {
  const repository = new SupabaseIdentityTenancyRepository();
  await requirePersistedPlatformAccess(session, repository, "admin.manage_tenants");
  await requirePersistedPlatformAccess(session, repository, permission);
}
