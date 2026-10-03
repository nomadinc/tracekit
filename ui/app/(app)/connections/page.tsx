import { ConnectionsOverview } from "@/components/connections/connections-overview";
import { loadConnectionsOverview } from "@/lib/commerce/integration-experience-server";

function message(provider?: string, google?: string, meta?: string) {
  if (provider === "google_ads" && google) {
    if (google === "connected") return { tone: "success" as const, text: "Google Ads connected successfully." };
    if (google === "cancelled") return { tone: "info" as const, text: "Google Ads authorization was cancelled." };
    if (google === "permission") return { tone: "error" as const, text: "Google Ads did not grant the required permission." };
    if (google === "state") return { tone: "error" as const, text: "Google Ads authorization could not be verified. Please try connecting again." };
    if (google.startsWith("google_ads_api_")) return { tone: "error" as const, text: `Google Ads authorization succeeded, but account discovery failed (${google.replace("google_ads_api_", "")}).` };
    if (google === "google_ads_hierarchy_discovery_failed") return { tone: "error" as const, text: "Google Ads authorization succeeded and accessible customers were found, but account hierarchy discovery failed." };
    if (google === "google_ads_connection_persistence_failed") return { tone: "error" as const, text: "Google Ads authorization and discovery succeeded, but TraceKit could not persist the connection." };
    if (google === "google_ads_account_persistence_failed") return { tone: "error" as const, text: "Google Ads authorization succeeded and the connection was created, but TraceKit could not persist the discovered accounts." };
    if (google === "failed") return { tone: "error" as const, text: "Google Ads authorization returned, but TraceKit could not complete the connection." };
  }
  if (provider === "meta" && meta === "connected") return { tone: "success" as const, text: "Meta Ads connected successfully." };
  return null;
}

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const overview = await loadConnectionsOverview();
  const params = await searchParams;
  const provider = typeof params.provider === "string" ? params.provider : undefined;
  const google = typeof params.google === "string" ? params.google : undefined;
  const meta = typeof params.meta === "string" ? params.meta : undefined;
  return <ConnectionsOverview connections={overview.connections} organizationName={overview.organizationName} callbackNotice={message(provider, google, meta)} />;
}
