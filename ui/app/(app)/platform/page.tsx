import { requirePersistedPlatformAccess } from "@/lib/identity/platform-catalog-access";
import { redirect } from "next/navigation";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { SupabaseIdentityTenancyRepository } from "@/lib/identity/supabase-identity-repository";
import { PlatformControlCenter } from "@/components/platform/platform-control-center";
import { readClientHealth } from "@/lib/platform/client-health";
import { platformSession } from "@/lib/platform/admin-server";

export default async function PlatformPage() {
  await platformSession();
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated") redirect("/");
  const repository = new SupabaseIdentityTenancyRepository();
  try { await requirePersistedPlatformAccess(resolution.session, repository, "admin.manage_tenants"); }
  catch { redirect("/"); }
  const [organizations, agencies] = await Promise.all([repository.allActiveOrganizations(), repository.allActiveAgencies()]);
  const catalog = organizations.map((organization) => ({ id: organization.id, name: organization.name, agencyId: organization.agencyId, accountId: organization.owningAccountId }));
  const health = await readClientHealth(catalog);
  return <PlatformControlCenter organizations={health} agencies={agencies.map((agency) => ({ id: agency.id, name: agency.name }))} canEnterClientView={resolution.session.effectivePermissions.includes("admin.impersonate")} />;
}
