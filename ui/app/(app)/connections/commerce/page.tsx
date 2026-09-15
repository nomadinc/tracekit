import { ConnectionsOverview } from "@/components/connections/connections-overview";
import { EverflowNetworkSelector } from "@/components/connections/everflow-admin-controls";
import { loadConnectionExperiences } from "@/lib/commerce/integration-experience-server";

export default async function CommerceConnectionsPage() {
  const connections = await loadConnectionExperiences();
  return <><ConnectionsOverview connections={connections} /><div className="mx-auto -mt-8 max-w-[1360px] px-5 pb-8 sm:px-8 lg:px-10"><EverflowNetworkSelector connections={connections} /></div></>;
}
