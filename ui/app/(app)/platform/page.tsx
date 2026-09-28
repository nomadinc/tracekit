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
  const organizations = await repository.allActiveOrganizations();
  const catalog = organizations.map((organization) => ({ id: organization.id, name: organization.name, agencyId: organization.agencyId, accountId: organization.owningAccountId }));
  const health = await readClientHealth(catalog);
  return <PlatformControlCenter organizations={health} canEnterClientView={resolution.session.effectivePermissions.includes("admin.impersonate")} />;
}
