import type { ConnectionExperience, SafeSyncRun } from "./integration-experience";

/** Keep stored failure history; classify only recovered conversion checkpoints. */
export function activeFailedCheckpointCount(checkpoints: Record<string, unknown>[], freshness: Record<string, unknown> | undefined, runs: SafeSyncRun[]) {
  const failures = checkpoints.filter(row => row.state === "failed");
  const latest = runs.find(run => run.resource === "everflow_conversions" && !["queued","pending","running","paused"].includes(run.status));
  const fullSuccess = Date.parse(String(freshness?.last_successful_at || ""));
  const runCompleted = Date.parse(latest?.completedAt || "");
  if (freshness?.resource !== "everflow_conversions" || freshness.status !== "current" ||
      latest?.status !== "completed" || latest.recordsFailed > 0 || !Number.isFinite(fullSuccess) ||
      !Number.isFinite(runCompleted) || fullSuccess < runCompleted) return failures.length;
  return failures.filter(row => {
    const attempted = Date.parse(String(row.created_at || ""));
    return row.resource !== "everflow_conversions" || !Number.isFinite(attempted) || attempted > fullSuccess;
  }).length;
}

export function connectionHealth(connection: ConnectionExperience): { state: "healthy" | "degraded" | "unknown"; detail: string } {
  if (connection.status !== "connected" || connection.credential.status !== "active")
    return { state: "degraded", detail: "Connection or credential needs attention." };
  // The server supplies runs newest first. A success for a different resource
  // must not hide a failed ingestion job; only its own later success recovers it.
  const latestByResource = new Map<string, ConnectionExperience["syncRuns"][number]>();
  for (const run of connection.syncRuns) {
    if (["queued", "pending", "running", "paused"].includes(run.status)) continue;
    if (!latestByResource.has(run.resource)) latestByResource.set(run.resource, run);
  }
  const failed = Array.from(latestByResource.values()).find(run =>
    run.status === "failed" || run.status === "completed_with_warnings" || run.recordsFailed > 0,
  );
  if (failed) return { state: "degraded", detail: `${failed.resource.replaceAll("_", " ")}: ${failed.status.replaceAll("_", " ")}. View Connection for details.` };
  if ((connection.diagnostics.activeFailedCheckpoints ?? connection.diagnostics.failedCheckpoints) > 0 || connection.diagnostics.stalled || connection.diagnostics.latestRequestStatus === "failed" || ["failed", "degraded", "stale"].includes(connection.freshness.status))
    return { state: "degraded", detail: "Stored ingestion diagnostics need attention. View Connection for details." };
  if (!latestByResource.size || Array.from(latestByResource.values()).some(run => run.status !== "completed"))
    return { state: "unknown", detail: "Successful ingestion is not established by the stored sync history." };
  return { state: "healthy", detail: "Latest recorded sync for each observed resource completed successfully." };
}
