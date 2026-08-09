import "server-only";
import { randomUUID } from "node:crypto";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";
import { investigationRunKey, type InvestigationRunRequest } from "./runtime-contract";
export async function enqueueInvestigationRun(input: InvestigationRunRequest) {
  const key = investigationRunKey(input);
  const existing = await commercePersistenceRequest(`tracekit_investigation_runs?organization_id=eq.${encodeURIComponent(input.organizationId)}&idempotency_key=eq.${key}&limit=1`);
  if (existing[0]) return { id: String(existing[0].id), reused: true, status: String(existing[0].status) };
  const rows = await commercePersistenceRequest("tracekit_investigation_runs", { method: "POST", body: JSON.stringify({ id: randomUUID(), account_id: input.accountId, organization_id: input.organizationId, investigation_id: input.investigationId, idempotency_key: key, algorithm_version: input.algorithmVersion, commerce_reconciliation_version: input.commerceVersion, journey_linkage_version: input.journeyVersion, dispute_reconciliation_version: input.disputeVersion, reason_normalization_version: input.reasonVersion, cohort_definition_version: input.cohortVersion, source_snapshot: input.sourceSnapshot, evidence_cutoff_at: input.evidenceCutoffAt, requested_by_user_id: input.requestedByUserId }) });
  return { id: String(rows[0].id), reused: false, status: "queued" };
}

export async function enqueueInvestigationRefresh(input:InvestigationRunRequest) {
  const queued=await enqueueInvestigationRun(input);
  await commercePersistenceRequest(`tracekit_investigation_freshness?investigation_id=eq.${encodeURIComponent(input.investigationId)}&organization_id=eq.${encodeURIComponent(input.organizationId)}`,{method:"PATCH",body:JSON.stringify({freshness_status:"refresh_queued",refresh_run_id:queued.id,evaluated_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
  return queued;
}
