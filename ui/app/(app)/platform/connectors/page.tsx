import { platformSession } from "@/lib/platform/admin-server";
import {
  loadAdminCatalog,
  loadAdminConnections,
} from "@/lib/platform/admin-repository";
import { ConnectionsList } from "@/components/platform/admin-lists";
export default async function ConnectionsPage() {
  const session = await platformSession("connectors.view");
  const [catalog, connections] = await Promise.all([
    loadAdminCatalog(session),
    loadAdminConnections(session),
  ]);
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-3xl font-semibold">Connections</h1>
      <p className="text-sm text-slate-400">
        Inspect provider connections by client. Open client detail for governed
        access to its connector stack.
      </p>
      <ConnectionsList
        connections={connections}
        organizations={catalog.organizations}
      />
    </div>
  );
}
