import "server-only";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { requirePermission } from "@/lib/identity/authorization-gateway";
import { commercePersistenceRequest } from "./supabase-control-repository";
import { COMMAS_CAPABILITIES, type ConnectionExperience, type SafeReadinessGate, type SafeSyncRun } from "./integration-experience";

type Row = Record<string, unknown>;
const text = (value: unknown) => value == null ? null : String(value);
const number = (value: unknown) => Number(value || 0);

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
  const [accounts, credentials, runs, activation, checkpoints, evidence] = await Promise.all([
    commercePersistenceRequest(`commerce_provider_accounts?connection_id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(organizationId)}&order=created_at.asc`),
    commercePersistenceRequest(`commerce_provider_credentials?connection_id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(organizationId)}&select=id,created_at,rotated_at,revoked_at,encryption_version&order=created_at.desc`),
    commercePersistenceRequest(`commerce_sync_runs?connection_id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(organizationId)}&order=created_at.desc&limit=50`),
    commercePersistenceRequest(`commerce_repository_activation?connection_id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(organizationId)}`),
    commercePersistenceRequest(`commerce_sync_checkpoints?connection_id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(organizationId)}&select=state`),
    commercePersistenceRequest(`commerce_evidence_records?connection_id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(organizationId)}&select=id,storage_reference,deleted_at`),
  ]) as Row[][];
  const activeCredential = credentials.find((credential) => !credential.revoked_at);
  const syncRuns = runs.map((run): SafeSyncRun => ({ id: String(run.id), connectionId: id, connectionName: String(row.display_name), provider: String(row.provider), mode: String(run.mode), resource: String(run.sync_type), status: String(run.status), startedAt: text(run.started_at), completedAt: text(run.completed_at), pagesCompleted: number(run.pages_completed), recordsSeen: number(run.records_seen), recordsCreated: number(run.records_created), recordsUpdated: number(run.records_updated), recordsFailed: number(run.records_failed), warnings: number(run.warnings_count), leaseActive: Boolean(run.lease_owner && run.lease_expires_at && new Date(String(run.lease_expires_at)) > new Date()), heartbeatAt: text(run.heartbeat_at), errorSummary: text(run.last_error_summary) }));
  const readinessRecord = activation.find((item) => item.workspace === "orders");
  const evidenceMap = (readinessRecord?.readiness_evidence || {}) as Record<string, { passed?: boolean; evidence?: string; at?: string }>;
  const gates: Array<[string, string]> = [["connection_verified", "Connection verified"], ["credential_active", "Credential active"], ["tenant_scope", "Tenant scope clean"], ["shadow_sync", "Shadow sync complete"], ["reconciliation", "Reconciliation within threshold"], ["product_mapping", "Product mappings reviewed"], ["rollback_tested", "Rollback tested"], ["refund_schema", "Refund schema verified"]];
  const readiness: SafeReadinessGate[] = gates.map(([gateId, label]) => ({ id: gateId, label, status: evidenceMap[gateId]?.passed ? "passed" : gateId === "refund_schema" ? "pending" : "blocked", explanation: evidenceMap[gateId]?.evidence || (gateId === "shadow_sync" ? "Shadow ingestion is not enabled yet." : "No server-verified evidence has been recorded."), evidenceAt: evidenceMap[gateId]?.at || null }));
  const latest = syncRuns[0];
  return {
    id, provider: String(row.provider), displayName: String(row.display_name), environment: String(row.environment), status: String(row.status), organizationName,
    providerAccountLabel: accounts[0] ? String(accounts[0].provider_account_label || accounts[0].provider_account_external_id) : null,
    lastVerifiedAt: text(row.last_success_at), lastSyncAt: latest?.completedAt || latest?.startedAt || null,
    capabilities: String(row.provider) === "commas" ? COMMAS_CAPABILITIES : [], syncRuns,
    credential: activeCredential ? { status: "active", createdAt: text(activeCredential.created_at), rotatedAt: text(activeCredential.rotated_at), version: number(activeCredential.encryption_version) } : { status: credentials.length ? "revoked" : "missing", createdAt: null, rotatedAt: null, version: null },
    readiness, canManage,
    diagnostics: { latestRequestStatus: row.last_error_at ? "failed" : row.last_success_at ? "succeeded" : null, latencyMs: null, providerRequestIdPresent: false, retryCount: 0, rateLimitRemaining: null, rateLimitReset: null, sanitizedError: text(row.last_error_code), activeRun: Boolean(latest && ["pending", "running", "paused"].includes(latest.status)), leaseOwnerPresent: Boolean(latest?.leaseActive), heartbeatAge: latest?.heartbeatAt || null, stalled: Boolean(latest?.status === "running" && !latest.leaseActive), pendingCheckpoints: checkpoints.filter((item) => item.state === "pending").length, failedCheckpoints: checkpoints.filter((item) => item.state === "failed").length, evidenceReferences: evidence.filter((item) => !item.deleted_at).length, missingEvidenceReferences: evidence.filter((item) => !item.storage_reference).length, hashState: evidence.length ? "pending" : "unavailable" },
  };
}

export async function loadSyncRuns(): Promise<SafeSyncRun[]> {
  return (await loadConnectionExperiences()).flatMap((connection) => connection.syncRuns);
}
