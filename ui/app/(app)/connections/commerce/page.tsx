import { ConnectionsOverview } from "@/components/connections/connections-overview";
import { loadConnectionExperiences } from "@/lib/commerce/integration-experience-server";

export default async function CommerceConnectionsPage() {
  return <ConnectionsOverview connections={await loadConnectionExperiences()} />;
}
