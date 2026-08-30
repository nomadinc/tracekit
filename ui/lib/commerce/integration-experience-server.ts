import "server-only";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { requirePermission } from "@/lib/identity/authorization-gateway";
import { commercePersistenceRequest } from "./supabase-control-repository";
import { COMMAS_CAPABILITIES, type ConnectionExperience, type SafeReadinessGate, type SafeSyncRun, type SyncFrequency } from "./integration-experience";
import { canManageTkidOrigins } from "@/lib/tkid/origin-authorization";

type Row = Record<string, unknown>;
const text = (value: unknown) => value == null ? null : String(value);
const number = (value: unknown) => Number(value || 0);
const object = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const nullableNumber = (row: Row, key: string) => Object.prototype.hasOwnProperty.call(row, key) ? number(row[key]) : null;
const frequencyMinutes = (value: unknown) => ({ hourly: 60, "30_minutes": 30, "15_minutes": 15, "5_minutes": 5 } as Record<string, number>)[String(value)] || 60;
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
  return Promise.all(connections.map((row) => loadConnectionExperienceRow(session.activeOrganization!.name, row, session.effectivePermissions.includes("connectors.manage"), canManageTkidOrigins(session))));
}

export async function loadConnectionExperience(connectionId: string) {
  const all = await loadConnectionExperiences();
  const connection = all.find((item) => item.id === connectionId);
  if (!connection) throw new Error("The requested resource is unavailable.");
  return connection;
}

async function loadConnectionExperienceRow(organizationName: string, row: Row, canManage: boolean, canManageOrigins: boolean): Promise<ConnectionExperience> {
  const id = String(row.id);
  const organizationId = String(row.organization_id);
  const [accounts, credentials, runs, activation, checkpoints, evidence, freshnessRows, schedules, controls, pauses, tkidSources] = await Promise.all([
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
    canManageOrigins?optionalRows(`tkid_sources?organization_id=eq.${encodeURIComponent(organizationId)}&environment=eq.production&order=created_at.asc&limit=1`):Promise.resolve([] as Row[]),
  ]) as Row[][];
  const tkidSource=tkidSources[0];
  const originRows=tkidSource?await optionalRows(`tkid_source_origins?organization_id=eq.${encodeURIComponent(organizationId)}&source_id=eq.${encodeURIComponent(String(tkidSource.id))}&order=created_at.asc`):[];
  const tkidOrigins=originRows.map(origin=>({id:String(origin.id),sourceId:String(origin.source_id),origin:String(origin.canonical_origin),role:String(origin.role) as ConnectionExperience["tkidOrigins"]["origins"][number]["role"],status:String(origin.lifecycle_status) as ConnectionExperience["tkidOrigins"]["origins"][number]["status"],verificationState:String(origin.verification_state),verifiedAt:text(origin.verified_at),retiredAt:text(origin.retired_at),lastObservedAt:text(origin.last_observed_at),acceptedEvents:number(origin.accepted_event_count),rejectedEvents:number(origin.rejected_event_count)}));
  const originBlockers=tkidOrigins.some(origin=>origin.status==="active")?[]:tkidOrigins.some(origin=>origin.status==="verified")?["ORIGIN_PENDING_ACTIVATION"]:tkidOrigins.length?["ORIGIN_VERIFICATION_REQUIRED"]:["NO_ACTIVE_ORIGIN"];
  const activeCredential = credentials.find((credential) => !credential.revoked_at);
  const syncRuns = runs.map((run): SafeSyncRun => {
    const metadata = object(run.metadata);
    const everflow = object(metadata.everflow);
    const linkage = object(everflow.linkage);
    const isEverflow = String(row.provider) === "everflow";
    return {
      id: String(run.id), connectionId: id, connectionName: String(row.display_name), provider: String(row.provider), mode: String(run.mode), resource: String(run.sync_type), status: String(run.status), startedAt: text(run.started_at), completedAt: text(run.completed_at), pagesCompleted: number(run.pages_completed), recordsSeen: number(run.records_seen), recordsCreated: number(run.records_created), recordsUpdated: number(run.records_updated), recordsUnchanged:number(run.records_unchanged), recordsFailed: number(run.records_failed), warnings: number(run.warnings_count), providerRequests:number(run.provider_request_count), stoppingReason:text(run.stopping_reason),freshnessResult:text(run.freshness_result), leaseActive: Boolean(run.lease_owner && run.lease_expires_at && new Date(String(run.lease_expires_at)) > new Date()), heartbeatAt: text(run.heartbeat_at), errorSummary: text(run.last_error_summary),
      nonOrderEvents: isEverflow ? nullableNumber(linkage, "non_order") : null,
      unmatchedCommerce: isEverflow ? nullableNumber(linkage, "unmatched") : null,
      matchedCommerce: isEverflow ? nullableNumber(linkage, "matched") : null,
      ambiguousCommerce: isEverflow ? nullableNumber(linkage, "ambiguous") : null,
      conflictCommerce: isEverflow ? nullableNumber(linkage, "conflict") : null,
    };
  });
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
  const syncFrequency = (String(schedules[0]?.sync_frequency || "hourly") as SyncFrequency);
  const lastEnqueuedAt = text(schedules[0]?.last_enqueued_at);
  const nextSyncAt = syncFrequency === "manual" ? null : lastEnqueuedAt ? new Date(new Date(lastEnqueuedAt).getTime() + frequencyMinutes(syncFrequency) * 60_000).toISOString() : new Date().toISOString();
  return {
    id, provider: String(row.provider), displayName: String(row.display_name), environment: String(row.environment), status: String(row.status), organizationName, syncFrequency, nextSyncAt,
    providerAccountLabel: accounts[0] ? String(accounts[0].provider_account_label || accounts[0].provider_account_external_id) : null,
    lastVerifiedAt: text(row.last_success_at), lastSyncAt: latest?.completedAt || latest?.startedAt || null,
    capabilities: String(row.provider) === "commas" ? COMMAS_CAPABILITIES : [], syncRuns,
    credential: activeCredential ? { status: "active", createdAt: text(activeCredential.created_at), rotatedAt: text(activeCredential.rotated_at), version: number(activeCredential.encryption_version) } : { status: credentials.length ? "revoked" : "missing", createdAt: null, rotatedAt: null, version: null },
    readiness, canManage,
    productionReadiness:{schedulerState:String(controls[0]?.activation_state||schedules[0]?.activation_state||"disabled") as ConnectionExperience["productionReadiness"]["schedulerState"],connectionPaused:Boolean(pauses[0]?.paused),quotaMinimumRemaining:schedules[0]?.quota_minimum_remaining==null?null:number(schedules[0].quota_minimum_remaining),deepRequestBudget:schedules[0]?.deep_request_budget==null?null:number(schedules[0].deep_request_budget),blockers:[...(!controls.length?["Production control not configured"]:[]),...(!schedules.length?["Schedule policy not configured"]:[]),...(Boolean(pauses[0]?.paused)?["Connection paused"]:[])]},
    tkidOrigins:{sourceId:tkidSource?String(tkidSource.id):null,sourceState:String(tkidSource?.status||"disabled"),origins:tkidOrigins,blockers:originBlockers,canManage:canManageOrigins},
    freshness:freshness?{status:String(freshness.status) as ConnectionExperience["freshness"]["status"],lastAttemptedAt:text(freshness.last_attempted_at),lastSuccessfulAt:text(freshness.last_successful_at),lastProviderObservationAt:text(freshness.last_provider_observation_at),lastNormalizedRecordAt:text(freshness.last_normalized_record_at),latestProviderTransactionAt:text(freshness.latest_provider_transaction_at),providerTotal:freshness.provider_total_observed==null?null:number(freshness.provider_total_observed),lastDeepReconciliationAt:text(freshness.last_deep_reconciliation_at),stoppingReason:text(freshness.last_stopping_reason),attributionSourceState:String(freshness.attribution_source_state) as ConnectionExperience["freshness"]["attributionSourceState"],deepReconciliationRequired:String(freshness.status)==="degraded"}:{status:"unknown",lastAttemptedAt:null,lastSuccessfulAt:null,lastProviderObservationAt:null,lastNormalizedRecordAt:null,latestProviderTransactionAt:null,providerTotal:null,lastDeepReconciliationAt:null,stoppingReason:null,attributionSourceState:"unavailable",deepReconciliationRequired:false},
    diagnostics: { latestRequestStatus: row.last_error_at ? "failed" : row.last_success_at ? "succeeded" : null, latencyMs: null, providerRequestIdPresent: false, retryCount: 0, rateLimitRemaining: null, rateLimitReset: null, sanitizedError: text(row.last_error_code), activeRun: Boolean(latest && ["pending", "running", "paused"].includes(latest.status)), leaseOwnerPresent: Boolean(latest?.leaseActive), heartbeatAge: latest?.heartbeatAt || null, stalled: Boolean(latest?.status === "running" && !latest.leaseActive), pendingCheckpoints: checkpoints.filter((item) => item.state === "pending").length, failedCheckpoints: checkpoints.filter((item) => item.state === "failed").length, evidenceReferences: evidence.filter((item) => !item.deleted_at).length, missingEvidenceReferences: evidence.filter((item) => !item.storage_reference).length, hashState: evidence.length ? "pending" : "unavailable" },
  };
}

export async function loadSyncRuns(): Promise<SafeSyncRun[]> {
  return (await loadConnectionExperiences()).flatMap((connection) => connection.syncRuns);
}
