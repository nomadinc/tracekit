import { SyncRunsView } from "@/components/connections/integration-experience";
import { loadSyncRuns } from "@/lib/commerce/integration-experience-server";
export default async function SyncRunsPage() { return <SyncRunsView runs={await loadSyncRuns()} />; }
