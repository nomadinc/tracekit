import { ConnectionsOverview } from "@/components/connections/integration-experience";
import { loadConnectionExperiences } from "@/lib/commerce/integration-experience-server";
export default async function CommerceConnectionsPage() { return <ConnectionsOverview connections={await loadConnectionExperiences()} />; }
