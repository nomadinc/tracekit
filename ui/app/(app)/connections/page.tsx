import { ConnectionsOverview } from "@/components/connections/connections-overview";
import { loadConnectionExperiences } from "@/lib/commerce/integration-experience-server";

export default async function ConnectionsPage() {
  const connections = await loadConnectionExperiences();
  const organizationName = connections[0]?.organizationName || null;
  return <ConnectionsOverview connections={connections} organizationName={organizationName} />;
}
