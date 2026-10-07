import type { ConnectionExperience } from "./integration-experience";

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
  if (connection.diagnostics.failedCheckpoints > 0 || connection.diagnostics.stalled || connection.diagnostics.latestRequestStatus === "failed" || ["failed", "degraded", "stale"].includes(connection.freshness.status))
    return { state: "degraded", detail: "Stored ingestion diagnostics need attention. View Connection for details." };
  if (!latestByResource.size || Array.from(latestByResource.values()).some(run => run.status !== "completed"))
    return { state: "unknown", detail: "Successful ingestion is not established by the stored sync history." };
  return { state: "healthy", detail: "Latest recorded sync for each observed resource completed successfully." };
}
