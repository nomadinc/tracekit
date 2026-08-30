import { SyncRunsView } from "@/components/connections/integration-experience";
import { EverflowRunClassification } from "@/components/connections/everflow-run-classification";
import { loadSyncRuns } from "@/lib/commerce/integration-experience-server";

export default async function SyncRunsPage() {
  const runs = await loadSyncRuns();
  return <><SyncRunsView runs={runs} /><EverflowRunClassification runs={runs} /></>;
}
