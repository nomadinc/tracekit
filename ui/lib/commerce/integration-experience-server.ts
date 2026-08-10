import "server-only";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { requirePermission } from "@/lib/identity/authorization-gateway";
import { commercePersistenceRequest } from "./supabase-control-repository";
import { COMMAS_CAPABILITIES, type ConnectionExperience, type SafeReadinessGate, type SafeSyncRun } from "./integration-experience";

type Row = Record<string, unknown>;
const text = (value: unknown) => value == null ? null : String(value);
const number = (value: unknown) => Number(value || 0);
async function optionalRows(path:string){try{return await commercePersistenceRequest(path) as Row[]}catch{return [] as Row[]}}

async function authorizedSession(permission: "connectors.view" | "connectors.manage") {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization) throw new Error("The requested resource is unavailable.");
  requirePermission(resolution.session, permission);
  return resolution.session;
}

export async function loadConnectionExperiences(): Promise<ConnectionExperience[]> {
  const session = await authorizedSession("connectors.view");
  const organizationId = session.activeOrganization!.id;
  const connections = await commercePersistenceRequest(`commerce_provider_connections?organization_id=eq.${encodeURIComponent(organizationId)}&order=created_at.asc`) as Row[];
  return Promise.all(connections.map((row) => loadConnectionExperienceRow(session.activeOrganization!.name, row, session.effectivePermissions.includes("connectors.manage"))));
}

export async function loadConnectionExperience(connectionId: string) {
  const all = await loadConnectionExperiences();
  const connection = all.find((item) => item.id === connectionId);
  if (!connection) throw new Error("The requested resource is unavailable.");
  return connection;
}

async function loadConnectionExperienceRow(organizationName: string, row: Row, canManage: boolean): Promise<ConnectionExperience> {
  const id = String(row.id);
  const organizationId = String(row.organization_id);
  const [accounts, credentials, runs, activation, checkpoints, evidence, freshnessRows, schedules, controls, pauses] = await Promise.all([
    commercePersistenceRequest(`commerce_provider_accounts?connection_id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(organizationId)}&order=created_at.asc`),
    commercePersistenceRequest(`commerce_provider_credentials?connection_id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(organizationId)}&select=id,created_at,rotated_at,revoked_at,encryption_version&order=created_at.desc`),
    commercePersistenceRequest(`commerce_sync_runs?connection_id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(organizationId)}&order=created_at.desc&limit=50`),
    commercePersistenceRequest(`commerce_repository_activation?connection_id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(organizationId)}`),
    commercePersistenceRequest(`commerce_sync_checkpoints?connection_id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(organizationId)}&select=state`),
    commercePersistenceRequest(`commerce_evidence_records?connection_id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(organizationId)}&select=id,storage_reference,deleted_at`),
    commercePersistenceRequest(`commerce_continuous_sync_state?connection_id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(organizationId)}&resource=eq.transactions&limit=1`),
    optionalRows(`commerce_sync_schedules?connection_id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(organizationId)}&resource=eq.transactions&limit=1`),
    optionalRows(`tracekit_production_controls?organization_id=eq.${encodeURIComponent(organizationId)}&capability=eq.commerce_scheduler&limit=1`),
    optionalRows(`commerce_connection_pauses?connection_id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(organizationId)}&limit=1`),
  ]) as Row[][];
  const activeCredential = credentials.find((credential) => !credential.revoked_at);
  const syncRuns = runs.map((run): SafeSyncRun => ({ id: String(run.id), connectionId: id, connectionName: String(row.display_name), provider: String(row.provider), mode: String(run.mode), resource: String(run.sync_type), status: String(run.status), startedAt: text(run.started_at), completedAt: text(run.completed_at), pagesCompleted: number(run.pages_completed), recordsSeen: number(run.records_seen), recordsCreated: number(run.records_created), recordsUpdated: number(run.records_updated), recordsUnchanged:number(run.records_unchanged), recordsFailed: number(run.records_failed), warnings: number(run.warnings_count), providerRequests:number(run.provider_request_count), stoppingReason:text(run.stopping_reason),freshnessResult:text(run.freshness_result), leaseActive: Boolean(run.lease_owner && run.lease_expires_at && new Date(String(run.lease_expires_at)) > new Date()), heartbeatAt: text(run.heartbeat_at), errorSummary: text(run.last_error_summary) }));
  const readinessRecord = activation.find((item) => item.workspace === "orders");
  const evidenceMap = (readinessRecord?.readiness_evidence || {}) as Record<string, { passed?: boolean; evidence?: string; at?: string }>;
  const latestContinuous=syncRuns.find((run)=>run.mode==="continuous"&&run.status==="completed");
  const deepProof=syncRuns.find((run)=>run.mode==="deep_reconciliation"&&["completed","completed_with_warnings"].includes(run.status));
  const gates: Array<[string, string]> = [["connection_verified", "Connection verified"], ["credential_active", "Credential active"], ["tenant_scope", "Tenant scope clean"], ["continuous_overlap", "Continuous overlap proven"], ["deep_reconciliation", "Deep reconciliation proven"], ["lease_recovery", "Lease recovery proven"], ["refund_normalization", "Refund normalization healthy"], ["investigation_refresh", "Investigation refresh boundary proven"], ["live_activation", "Live Workspace activation"]];
  const readiness: SafeReadinessGate[] = gates.map(([gateId, label]) => {
    const derived=gateId==="connection_verified"?String(row.status)==="connected":gateId==="credential_active"?Boolean(activeCredential):gateId==="tenant_scope"?accounts.length===1:gateId==="continuous_overlap"?Boolean(latestContinuous?.stoppingReason==="stable_known_boundary"):gateId==="deep_reconciliation"?Boolean(deepProof):gateId==="refund_normalization"?Boolean(latestContinuous&&latestContinuous.recordsFailed===0):gateId==="investigation_refresh"?Boolean(freshnessRows[0]):false;
    const explanation=gateId==="continuous_overlap"?"A bounded run reached a durable stable-known boundary.":gateId==="deep_reconciliation"?"A bounded deep-reconciliation region completed; a full production cadence remains unapproved.":gateId==="lease_recovery"?"Lease expiry and recovery are covered by database/runtime tests; no production scheduler is active.":gateId==="refund_normalization"?"Verified embedded Refund parsing remains idempotent.":gateId==="investigation_refresh"?"Relevant Evidence can mark immutable Investigations refresh-available.":gateId==="live_activation"?"Continuous Shadow operation does not authorize live Workspace repositories.":"Server-owned Connection scope is intact.";
    return {id:gateId,label,status:derived||evidenceMap[gateId]?.passed?"passed":gateId==="live_activation"?"not_required":"pending",explanation:evidenceMap[gateId]?.evidence||explanation,evidenceAt:evidenceMap[gateId]?.at||latestContinuous?.completedAt||null};
  });
  const latest = syncRuns[0];
  const freshness=freshnessRows[0];
  return {
    id, provider: String(row.provider), displayName: String(row.display_name), environment: String(row.environment), status: String(row.status), organizationName,
    providerAccountLabel: accounts[0] ? String(accounts[0].provider_account_label || accounts[0].provider_account_external_id) : null,
    lastVerifiedAt: text(row.last_success_at), lastSyncAt: latest?.completedAt || latest?.startedAt || null,
    capabilities: String(row.provider) === "commas" ? COMMAS_CAPABILITIES : [], syncRuns,
    credential: activeCredential ? { status: "active", createdAt: text(activeCredential.created_at), rotatedAt: text(activeCredential.rotated_at), version: number(activeCredential.encryption_version) } : { status: credentials.length ? "revoked" : "missing", createdAt: null, rotatedAt: null, version: null },
    readiness, canManage,
    productionReadiness:{schedulerState:String(controls[0]?.activation_state||schedules[0]?.activation_state||"disabled") as ConnectionExperience["productionReadiness"]["schedulerState"],connectionPaused:Boolean(pauses[0]?.paused),quotaMinimumRemaining:schedules[0]?.quota_minimum_remaining==null?null:number(schedules[0].quota_minimum_remaining),deepRequestBudget:schedules[0]?.deep_request_budget==null?null:number(schedules[0].deep_request_budget),blockers:[...(!controls.length?["Production control not configured"]:[]),...(!schedules.length?["Schedule policy not configured"]:[]),...(Boolean(pauses[0]?.paused)?["Connection paused"]:[])]},
    freshness:freshness?{status:String(freshness.status) as ConnectionExperience["freshness"]["status"],lastAttemptedAt:text(freshness.last_attempted_at),lastSuccessfulAt:text(freshness.last_successful_at),lastProviderObservationAt:text(freshness.last_provider_observation_at),lastNormalizedRecordAt:text(freshness.last_normalized_record_at),latestProviderTransactionAt:text(freshness.latest_provider_transaction_at),providerTotal:freshness.provider_total_observed==null?null:number(freshness.provider_total_observed),lastDeepReconciliationAt:text(freshness.last_deep_reconciliation_at),stoppingReason:text(freshness.last_stopping_reason),attributionSourceState:String(freshness.attribution_source_state) as ConnectionExperience["freshness"]["attributionSourceState"],deepReconciliationRequired:String(freshness.status)==="degraded"}:{status:"unknown",lastAttemptedAt:null,lastSuccessfulAt:null,lastProviderObservationAt:null,lastNormalizedRecordAt:null,latestProviderTransactionAt:null,providerTotal:null,lastDeepReconciliationAt:null,stoppingReason:null,attributionSourceState:"unavailable",deepReconciliationRequired:false},
    diagnostics: { latestRequestStatus: row.last_error_at ? "failed" : row.last_success_at ? "succeeded" : null, latencyMs: null, providerRequestIdPresent: false, retryCount: 0, rateLimitRemaining: null, rateLimitReset: null, sanitizedError: text(row.last_error_code), activeRun: Boolean(latest && ["pending", "running", "paused"].includes(latest.status)), leaseOwnerPresent: Boolean(latest?.leaseActive), heartbeatAge: latest?.heartbeatAt || null, stalled: Boolean(latest?.status === "running" && !latest.leaseActive), pendingCheckpoints: checkpoints.filter((item) => item.state === "pending").length, failedCheckpoints: checkpoints.filter((item) => item.state === "failed").length, evidenceReferences: evidence.filter((item) => !item.deleted_at).length, missingEvidenceReferences: evidence.filter((item) => !item.storage_reference).length, hashState: evidence.length ? "pending" : "unavailable" },
  };
}

export async function loadSyncRuns(): Promise<SafeSyncRun[]> {
  return (await loadConnectionExperiences()).flatMap((connection) => connection.syncRuns);
}
