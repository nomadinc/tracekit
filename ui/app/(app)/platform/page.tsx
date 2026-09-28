import { redirect } from "next/navigation";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { SupabaseIdentityTenancyRepository } from "@/lib/identity/supabase-identity-repository";
import { PlatformControlCenter } from "@/components/platform/platform-control-center";
import { readClientHealth } from "@/lib/platform/client-health";

export default async function PlatformPage() {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated") redirect("/");
  if (!resolution.session.effectivePermissions.includes("admin.manage_tenants")) redirect("/");
  const repository = new SupabaseIdentityTenancyRepository();
  const [organizations, agencies] = await Promise.all([repository.allActiveOrganizations(), repository.allActiveAgencies()]);
  const catalog = organizations.map((organization) => ({ id: organization.id, name: organization.name, agencyId: organization.agencyId, accountId: organization.owningAccountId }));
  const health = await readClientHealth(catalog);
  return <PlatformControlCenter organizations={health} agencies={agencies.map((agency) => ({ id: agency.id, name: agency.name }))} canEnterClientView={resolution.session.effectivePermissions.includes("admin.impersonate")} />;
}
