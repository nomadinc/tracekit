import { platformSession } from "@/lib/platform/admin-server";
import { loadAdminCatalog } from "@/lib/platform/admin-repository";
import { ClientsList } from "@/components/platform/admin-lists";
import { AdminForm } from "@/components/platform/admin-actions";
export default async function ClientsPage() {
  const session = await platformSession(),
    catalog = await loadAdminCatalog(session);
  const canCreate =
    ["platform-owner", "platform-admin"].includes(session.role) &&
    session.effectivePermissions.includes("organizations.manage");
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-3xl font-semibold">Clients</h1>
      <p className="text-sm text-slate-400">
        Permanent Advertiser and Agency accounts.
      </p>
      {canCreate ? (
        <section className="rounded-xl border border-white/10 p-5">
          <h2 className="mb-4 font-semibold">Create client</h2>
          <AdminForm action="create" />
        </section>
      ) : null}
      <section className="rounded-xl border border-white/10 p-5">
        <ClientsList {...catalog} />
      </section>
    </div>
  );
}
