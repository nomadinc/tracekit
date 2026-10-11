type Outcome = { status?: unknown; clickStatus?: unknown };
type SchedulerOutcome = {
  results?: Outcome[];
  historicalImport?: Outcome | null;
  reconciliationMaintenance?: Outcome[];
};

/** A caught target failure is still a failed cron; resumable progress is not. */
export function everflowSchedulerHealth(outcome: SchedulerOutcome) {
  const failedTargets = (outcome.results || []).filter(row => row.status === "failed").length;
  const failedClickTargets = (outcome.results || []).filter(row => row.clickStatus === "failed").length;
  const historicalFailed = outcome.historicalImport?.status === "failed";
  const maintenanceFailures = (outcome.reconciliationMaintenance || []).filter(row => row.status === "warning" || row.status === "failed").length;
  const failed = failedTargets > 0 || failedClickTargets > 0 || historicalFailed || maintenanceFailures > 0;
  return { failed, failedTargets, failedClickTargets, historicalFailed, maintenanceFailures };
}
