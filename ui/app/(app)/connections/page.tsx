import { ConnectionsOverview } from "@/components/connections/connections-overview";
import { loadConnectionsOverview } from "@/lib/commerce/integration-experience-server";

export default async function ConnectionsPage() {
  const overview = await loadConnectionsOverview();
  return <ConnectionsOverview connections={overview.connections} organizationName={overview.organizationName} />;
}
