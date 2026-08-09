import { requireOrganizationAccess, requirePermission, AuthorizationDeniedError } from "@/lib/identity/authorization-gateway";
import type { Permission } from "@/lib/identity/permissions";
import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";
import type { CommerceEvidenceStore } from "./evidence-store";
import { decryptCommerceCredential, encryptCommerceCredential, type EncryptedCommerceCredential } from "./credential-crypto";

export type ConnectionStatus = "draft" | "connected" | "degraded" | "disabled" | "revoked";
export type RepositoryMode = "mock" | "shadow" | "live_beta" | "live";
export type Workspace = "mission_control" | "offers" | "customers" | "orders" | "money" | "operations" | "settings";
export type CommerceScope = { actorUserId: string; accountId: string; organizationId: string; correlationId: string };
export type CommerceConnection = { id: string; accountId: string; organizationId: string; provider: string; displayName: string; environment: string; status: ConnectionStatus; lastSuccessAt?: string | null; lastErrorAt?: string | null; lastErrorCode?: string | null; capabilities?: Record<string, unknown>; setupRequestId?: string | null };
export type ProviderAccount = { id: string; organizationId: string; connectionId: string; externalId: string; status: string; provisional: boolean };
export type CredentialVersion = { id: string; organizationId: string; connectionId: string; revokedAt: string | null; encrypted?: EncryptedCommerceCredential; secretReference?: string };
export type SyncRun = { id: string; organizationId: string; connectionId: string; providerAccountId: string; syncType: string; mode: string; status: string; leaseOwner?: string | null; leaseExpiresAt?: string | null };
export type SyncCheckpoint = { id: string; syncRunId: string; organizationId: string; connectionId: string; providerAccountId: string; resource: string; page: number; perPage: number; state: "pending" | "running" | "completed" | "failed" | "superseded"; retryCount: number; pageFingerprint?: string | null };
export type SourceMapping = { id: string; organizationId: string; connectionId: string; providerAccountId: string; sourceObjectType: string; sourceObjectId: string; canonicalObjectType: string; canonicalObjectId: string; payloadHash: string; lastSeenAt: string };
export type ReadinessEvidence = Record<string, { passed: boolean; evidence: string }>;
export type Activation = { organizationId: string; workspace: Workspace; mode: RepositoryMode; connectionId: string | null; readinessEvidence: ReadinessEvidence };

export interface CommerceControlRepository {
  createConnection(input: Omit<CommerceConnection, "id" | "status">): Promise<CommerceConnection>;
  connectionById(id: string): Promise<CommerceConnection | null>;
  connectionBySetupRequest(organizationId: string, setupRequestId: string): Promise<CommerceConnection | null>;
  listConnections(organizationId: string): Promise<CommerceConnection[]>;
  updateConnection(id: string, organizationId: string, patch: Partial<Pick<CommerceConnection, "displayName" | "status" | "lastSuccessAt" | "lastErrorAt" | "lastErrorCode" | "capabilities">>): Promise<CommerceConnection>;
  upsertProviderAccount(input: Omit<ProviderAccount, "id">): Promise<ProviderAccount>;
  listProviderAccounts(connectionId: string, organizationId: string): Promise<ProviderAccount[]>;
  disableProviderAccount(id: string, connectionId: string, organizationId: string): Promise<ProviderAccount>;
  activeCredential(connectionId: string, organizationId: string): Promise<CredentialVersion | null>;
  insertCredential(input: Omit<CredentialVersion, "id">): Promise<CredentialVersion>;
  rotateCredential(input: { connectionId: string; organizationId: string; previousId: string; replacement: Omit<CredentialVersion, "id"> }): Promise<CredentialVersion>;
  revokeCredential(id: string, connectionId: string, organizationId: string): Promise<void>;
  createSyncRun(input: Omit<SyncRun, "id" | "status">): Promise<SyncRun>;
  claimSyncRun(input: { runId: string; organizationId: string; connectionId: string; owner: string; leaseSeconds: number }): Promise<SyncRun | null>;
  heartbeatSyncRun(input: { runId: string; organizationId: string; connectionId: string; owner: string; leaseSeconds: number }): Promise<boolean>;
  transitionSyncRun(input: { runId: string; organizationId: string; connectionId: string; owner: string; transition: "completed" | "completed_with_warnings" | "failed"; errorCode?: string; errorSummary?: string }): Promise<boolean>;
  cancelSyncRun(runId: string, organizationId: string, connectionId: string): Promise<boolean>;
  beginCheckpoint(input: Omit<SyncCheckpoint, "id" | "state" | "retryCount">): Promise<SyncCheckpoint>;
  updateCheckpoint(id: string, organizationId: string, connectionId: string, patch: Partial<Pick<SyncCheckpoint, "state" | "retryCount" | "pageFingerprint">>): Promise<SyncCheckpoint>;
  checkpoints(syncRunId: string, organizationId: string): Promise<SyncCheckpoint[]>;
  sourceMapping(connectionId: string, providerAccountId: string, sourceObjectType: string, sourceObjectId: string): Promise<SourceMapping | null>;
  upsertSourceMapping(input: Omit<SourceMapping, "id">): Promise<SourceMapping>;
  canonicalTargetExists(organizationId: string, type: string, id: string): Promise<boolean>;
  decideProductMapping(input: { organizationId: string; connectionId: string; providerAccountId: string; providerProductId: string; resultingState: "approved" | "rejected"; businessContextId?: string; canonicalOfferId?: string; offerStepId?: string; offerVariantId?: string; mappingVersion: string; actorUserId: string; reason: string }): Promise<void>;
  activation(organizationId: string, workspace: Workspace): Promise<Activation | null>;
  setActivation(input: Activation & { actorUserId: string }): Promise<Activation>;
  evidenceByReference(reference: string): Promise<{ organizationId: string; storageReference: string } | null>;
  recordAudit(input: { scope: CommerceScope; action: string; targetType: string; targetId: string; result: "success" | "failure" | "denied"; metadata?: Record<string, unknown> }): Promise<void>;
}

export interface CommerceConnectionVerifier {
  verify(input: { provider: string; environment: string; secret: string; correlationId: string }): Promise<{ capabilities: string[]; providerStatus?: number; providerRequestIdPresent?: boolean; rateLimitRemaining?: number | null }>;
}

export interface CommerceReadinessEvaluator {
  evaluate(input: { scope: CommerceScope; connection: CommerceConnection; workspace: Workspace }): Promise<ReadinessEvidence>;
}

const SECRET_METADATA = /api.?key|secret|token|authorization|cookie|password|cipher|payload/i;
function safeMetadata(metadata: Record<string, unknown> = {}) {
  const inspect = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(inspect);
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_METADATA.test(key)) throw new Error("Secret-like metadata is not allowed.");
      inspect(child);
    }
  };
  inspect(metadata);
  return metadata;
}

export function authorizeCommerceOrganizationAccess(session: TraceKitSessionContext, organizationId: string, permission: Permission): CommerceScope {
  requirePermission(session, permission);
  const organization = requireOrganizationAccess(session, organizationId);
  if (!session.activeAccount?.id || organization.accountId !== session.activeAccount.id) throw new AuthorizationDeniedError();
  return { actorUserId: session.user.id, accountId: session.activeAccount.id, organizationId: organization.id, correlationId: session.correlationId };
}

export async function authorizeCommerceConnectionAccess(repository: CommerceControlRepository, session: TraceKitSessionContext, connectionId: string, permission: Permission) {
  requirePermission(session, permission);
  const connection = await repository.connectionById(connectionId);
  if (!connection) throw new AuthorizationDeniedError();
  const scope = authorizeCommerceOrganizationAccess(session, connection.organizationId, permission);
  if (connection.accountId !== scope.accountId) throw new AuthorizationDeniedError();
  return { scope, connection };
}

export class CommerceControlPlane {
  constructor(
    private readonly repository: CommerceControlRepository,
    private readonly key: { bytes: Uint8Array; id: string; version: number },
    private readonly evidenceStore: CommerceEvidenceStore,
    private readonly verifier?: CommerceConnectionVerifier,
    private readonly readinessEvaluator?: CommerceReadinessEvaluator,
  ) {}

  async createConnection(session: TraceKitSessionContext, organizationId: string, input: { provider: string; displayName: string; environment: string; setupRequestId?: string; metadata?: Record<string, unknown> }) {
    const scope = authorizeCommerceOrganizationAccess(session, organizationId, "connectors.manage");
    safeMetadata(input.metadata);
    if (input.setupRequestId) {
      const existing = await this.repository.connectionBySetupRequest(scope.organizationId, input.setupRequestId);
      if (existing) return existing;
    }
    let connection: CommerceConnection;
    try {
      connection = await this.repository.createConnection({ accountId: scope.accountId, organizationId: scope.organizationId, provider: input.provider.toLowerCase(), displayName: input.displayName, environment: input.environment, setupRequestId: input.setupRequestId || null });
    } catch (error) {
      const existing = input.setupRequestId ? await this.repository.connectionBySetupRequest(scope.organizationId, input.setupRequestId) : null;
      if (!existing) throw error;
      connection = existing;
    }
    await this.audit(scope, "provider_connection.created", "commerce_provider_connection", connection.id, { provider: connection.provider, status: connection.status });
    return connection;
  }

  async getConnection(session: TraceKitSessionContext, connectionId: string) {
    return (await authorizeCommerceConnectionAccess(this.repository, session, connectionId, "connectors.view")).connection;
  }

  async listConnections(session: TraceKitSessionContext, organizationId: string) {
    const scope = authorizeCommerceOrganizationAccess(session, organizationId, "connectors.view");
    return this.repository.listConnections(scope.organizationId);
  }

  async updateConnection(session: TraceKitSessionContext, connectionId: string, patch: { displayName?: string }) {
    const { scope } = await authorizeCommerceConnectionAccess(this.repository, session, connectionId, "connectors.manage");
    const connection = await this.repository.updateConnection(connectionId, scope.organizationId, patch);
    await this.audit(scope, "provider_connection.updated", "commerce_provider_connection", connectionId, { fields: Object.keys(patch) });
    return connection;
  }

  async disableConnection(session: TraceKitSessionContext, connectionId: string) {
    const { scope } = await authorizeCommerceConnectionAccess(this.repository, session, connectionId, "connectors.manage");
    const result = await this.repository.updateConnection(connectionId, scope.organizationId, { status: "disabled" });
    await this.audit(scope, "provider_connection.disabled", "commerce_provider_connection", connectionId, { status: "disabled" });
    return result;
  }

  async markConnectionConnected(session: TraceKitSessionContext, connectionId: string) {
    const { scope } = await authorizeCommerceConnectionAccess(this.repository, session, connectionId, "connectors.manage");
    const result = await this.repository.updateConnection(connectionId, scope.organizationId, { status: "connected", lastSuccessAt: new Date().toISOString() });
    await this.audit(scope, "provider_connection.updated", "commerce_provider_connection", connectionId, { status: "connected" });
    return result;
  }

  async markConnectionDegraded(session: TraceKitSessionContext, connectionId: string) {
    const { scope } = await authorizeCommerceConnectionAccess(this.repository, session, connectionId, "connectors.manage");
    const result = await this.repository.updateConnection(connectionId, scope.organizationId, { status: "degraded" });
    await this.audit(scope, "provider_connection.updated", "commerce_provider_connection", connectionId, { status: "degraded" });
    return result;
  }

  async upsertProviderAccount(session: TraceKitSessionContext, connectionId: string, input: { externalId?: string; status?: string }) {
    const { scope } = await authorizeCommerceConnectionAccess(this.repository, session, connectionId, "connectors.manage");
    const provisional = !input.externalId;
    return this.repository.upsertProviderAccount({ organizationId: scope.organizationId, connectionId, externalId: input.externalId || `provisional:${connectionId}`, status: input.status || "active", provisional });
  }

  async listProviderAccounts(session: TraceKitSessionContext, connectionId: string) {
    const { scope } = await authorizeCommerceConnectionAccess(this.repository, session, connectionId, "connectors.view");
    return this.repository.listProviderAccounts(connectionId, scope.organizationId);
  }

  async disableProviderAccount(session: TraceKitSessionContext, connectionId: string, providerAccountId: string) {
    const { scope } = await authorizeCommerceConnectionAccess(this.repository, session, connectionId, "connectors.manage");
    return this.repository.disableProviderAccount(providerAccountId, connectionId, scope.organizationId);
  }

  async credentialStatus(session: TraceKitSessionContext, connectionId: string) {
    const { scope } = await authorizeCommerceConnectionAccess(this.repository, session, connectionId, "connectors.view");
    const credential = await this.repository.activeCredential(connectionId, scope.organizationId);
    return credential ? { id: credential.id, status: "active" as const } : { id: null, status: "missing" as const };
  }

  async createCredential(session: TraceKitSessionContext, connectionId: string, secret: string) {
    const { scope } = await authorizeCommerceConnectionAccess(this.repository, session, connectionId, "connectors.manage");
    if (await this.repository.activeCredential(connectionId, scope.organizationId)) throw new Error("An active credential already exists.");
    const encrypted = await encryptCommerceCredential(secret, this.key.bytes, this.key.id, this.key.version);
    const credential = await this.repository.insertCredential({ organizationId: scope.organizationId, connectionId, revokedAt: null, encrypted });
    await this.audit(scope, "provider_credential.created", "commerce_provider_credential", credential.id);
    return { id: credential.id, status: "active" as const };
  }

  async rotateCredential(session: TraceKitSessionContext, connectionId: string, secret: string) {
    const { scope } = await authorizeCommerceConnectionAccess(this.repository, session, connectionId, "connectors.manage");
    const previous = await this.repository.activeCredential(connectionId, scope.organizationId);
    if (!previous) throw new Error("No active credential exists.");
    const encrypted = await encryptCommerceCredential(secret, this.key.bytes, this.key.id, this.key.version);
    const replacement = await this.repository.rotateCredential({ connectionId, organizationId: scope.organizationId, previousId: previous.id, replacement: { organizationId: scope.organizationId, connectionId, revokedAt: null, encrypted } });
    await this.audit(scope, "provider_credential.rotated", "commerce_provider_credential", replacement.id, { previousCredentialId: previous.id });
    return { id: replacement.id, status: "active" as const };
  }

  async revokeCredential(session: TraceKitSessionContext, connectionId: string) {
    const { scope } = await authorizeCommerceConnectionAccess(this.repository, session, connectionId, "connectors.manage");
    const current = await this.repository.activeCredential(connectionId, scope.organizationId);
    if (!current) return;
    await this.repository.revokeCredential(current.id, connectionId, scope.organizationId);
    await this.audit(scope, "provider_credential.revoked", "commerce_provider_credential", current.id);
  }

  async resolveCredentialForExecution(session: TraceKitSessionContext, connectionId: string) {
    const { scope } = await authorizeCommerceConnectionAccess(this.repository, session, connectionId, "imports.manage");
    const credential = await this.repository.activeCredential(connectionId, scope.organizationId);
    if (!credential?.encrypted || credential.revokedAt) throw new Error("The commerce credential is unavailable.");
    return decryptCommerceCredential(credential.encrypted, this.key.bytes);
  }

  async verifyConnection(session: TraceKitSessionContext, connectionId: string) {
    const { scope, connection } = await authorizeCommerceConnectionAccess(this.repository, session, connectionId, "connectors.manage");
    if (!this.verifier) throw new Error("Connection verification is unavailable.");
    try {
      const secret = await this.resolveCredentialForExecution(session, connectionId);
      const result = await this.verifier.verify({ provider: connection.provider, environment: connection.environment, secret, correlationId: scope.correlationId });
      await this.repository.updateConnection(connectionId, scope.organizationId, { status: "connected", lastSuccessAt: new Date().toISOString(), lastErrorAt: null, lastErrorCode: null, capabilities: { verified: result.capabilities } });
      await this.audit(scope, "provider_connection.updated", "commerce_provider_connection", connectionId, { verification: "succeeded", capabilities: result.capabilities });
      return { status: "connected" as const, ...result };
    } catch {
      await this.repository.updateConnection(connectionId, scope.organizationId, { status: "degraded", lastErrorAt: new Date().toISOString(), lastErrorCode: "provider_verification_failed" });
      await this.audit(scope, "provider_connection.updated", "commerce_provider_connection", connectionId, { verification: "failed" });
      throw new Error("Connection verification failed.");
    }
  }

  async createSyncRun(session: TraceKitSessionContext, connectionId: string, providerAccountId: string, mode: "discovery" | "shadow" | "reconciliation" | "historical_backfill", syncType: string) {
    const { scope } = await authorizeCommerceConnectionAccess(this.repository, session, connectionId, "imports.manage");
    return this.repository.createSyncRun({ organizationId: scope.organizationId, connectionId, providerAccountId, syncType, mode, leaseOwner: null, leaseExpiresAt: null });
  }

  async claimSyncRun(session: TraceKitSessionContext, connectionId: string, runId: string, owner: string, leaseSeconds = 60) {
    const { scope } = await authorizeCommerceConnectionAccess(this.repository, session, connectionId, "imports.manage");
    const run = await this.repository.claimSyncRun({ runId, organizationId: scope.organizationId, connectionId, owner, leaseSeconds });
    if (run) await this.audit(scope, "commerce_sync.started", "commerce_sync_run", runId);
    return run;
  }

  async heartbeatSyncRun(session: TraceKitSessionContext, connectionId: string, runId: string, owner: string, leaseSeconds = 60) {
    const { scope } = await authorizeCommerceConnectionAccess(this.repository, session, connectionId, "imports.manage");
    return this.repository.heartbeatSyncRun({ runId, organizationId: scope.organizationId, connectionId, owner, leaseSeconds });
  }

  async completeSyncRun(session: TraceKitSessionContext, connectionId: string, runId: string, owner: string, withWarnings = false) {
    const { scope } = await authorizeCommerceConnectionAccess(this.repository, session, connectionId, "imports.manage");
    const completed = await this.repository.transitionSyncRun({ runId, organizationId: scope.organizationId, connectionId, owner, transition: withWarnings ? "completed_with_warnings" : "completed" });
    if (completed) await this.audit(scope, "commerce_sync.completed", "commerce_sync_run", runId, { withWarnings });
    return completed;
  }

  async failSyncRun(session: TraceKitSessionContext, connectionId: string, runId: string, owner: string, errorCode: string, safeSummary: string) {
    const { scope } = await authorizeCommerceConnectionAccess(this.repository, session, connectionId, "imports.manage");
    const normalizedCode = /^[a-z][a-z0-9_.-]{0,63}$/.test(errorCode) ? errorCode : "provider_failure";
    const failed = await this.repository.transitionSyncRun({ runId, organizationId: scope.organizationId, connectionId, owner, transition: "failed", errorCode: normalizedCode, errorSummary: redactSafeErrorSummary(safeSummary) });
    if (failed) await this.audit(scope, "commerce_sync.failed", "commerce_sync_run", runId, { errorCode: normalizedCode });
    return failed;
  }

  async cancelSyncRun(session: TraceKitSessionContext, connectionId: string, runId: string) {
    const { scope } = await authorizeCommerceConnectionAccess(this.repository, session, connectionId, "imports.manage");
    const cancelled = await this.repository.cancelSyncRun(runId, scope.organizationId, connectionId);
    if (cancelled) await this.audit(scope, "commerce_sync.cancelled", "commerce_sync_run", runId);
    return cancelled;
  }

  async beginCheckpoint(session: TraceKitSessionContext, connectionId: string, input: Omit<SyncCheckpoint, "id" | "organizationId" | "connectionId" | "state" | "retryCount">) {
    const { scope } = await authorizeCommerceConnectionAccess(this.repository, session, connectionId, "imports.manage");
    return this.repository.beginCheckpoint({ ...input, organizationId: scope.organizationId, connectionId });
  }

  async completeCheckpoint(session: TraceKitSessionContext, connectionId: string, checkpointId: string, pageFingerprint: string) {
    const { scope } = await authorizeCommerceConnectionAccess(this.repository, session, connectionId, "imports.manage");
    return this.repository.updateCheckpoint(checkpointId, scope.organizationId, connectionId, { state: "completed", pageFingerprint });
  }

  async failCheckpoint(session: TraceKitSessionContext, connectionId: string, checkpointId: string, retryCount: number) {
    const { scope } = await authorizeCommerceConnectionAccess(this.repository, session, connectionId, "imports.manage");
    return this.repository.updateCheckpoint(checkpointId, scope.organizationId, connectionId, { state: "failed", retryCount });
  }

  async listRetryableCheckpoints(session: TraceKitSessionContext, connectionId: string, syncRunId: string) {
    const { scope } = await authorizeCommerceConnectionAccess(this.repository, session, connectionId, "imports.manage");
    return (await this.repository.checkpoints(syncRunId, scope.organizationId)).filter((item) => item.state === "pending" || item.state === "failed");
  }

  async resolveSourceMapping(session: TraceKitSessionContext, connectionId: string, providerAccountId: string, sourceObjectType: string, sourceObjectId: string) {
    await authorizeCommerceConnectionAccess(this.repository, session, connectionId, "imports.view");
    return this.repository.sourceMapping(connectionId, providerAccountId, sourceObjectType, sourceObjectId);
  }

  async createOrObserveSourceMapping(session: TraceKitSessionContext, connectionId: string, input: Omit<SourceMapping, "id" | "organizationId" | "connectionId">) {
    const { scope } = await authorizeCommerceConnectionAccess(this.repository, session, connectionId, "imports.manage");
    if (!await this.repository.canonicalTargetExists(scope.organizationId, input.canonicalObjectType, input.canonicalObjectId)) throw new AuthorizationDeniedError();
    return this.repository.upsertSourceMapping({ ...input, organizationId: scope.organizationId, connectionId });
  }

  async decideProductMapping(session: TraceKitSessionContext, connectionId: string, input: { providerAccountId: string; providerProductId: string; resultingState: "approved" | "rejected"; businessContextId?: string; canonicalOfferId?: string; offerStepId?: string; offerVariantId?: string; mappingVersion: string; reason: string }) {
    const { scope } = await authorizeCommerceConnectionAccess(this.repository, session, connectionId, "offers.manage");
    await this.repository.decideProductMapping({ ...input, organizationId: scope.organizationId, connectionId, actorUserId: scope.actorUserId });
    await this.audit(scope, input.resultingState === "approved" ? "product_mapping.approved" : "product_mapping.rejected", "commerce_provider_product", input.providerProductId, { mappingVersion: input.mappingVersion });
  }

  async getEvidencePayload(session: TraceKitSessionContext, reference: string) {
    requirePermission(session, "audit_logs.view");
    const record = await this.repository.evidenceByReference(reference);
    if (!record) throw new AuthorizationDeniedError();
    const scope = authorizeCommerceOrganizationAccess(session, record.organizationId, "audit_logs.view");
    const payload = await this.evidenceStore.getAuthorized({ organizationId: scope.organizationId, storageReference: record.storageReference });
    if (!payload) throw new AuthorizationDeniedError();
    await this.audit(scope, "commerce_evidence.accessed", "commerce_evidence", reference);
    return payload;
  }

  async getWorkspaceMode(session: TraceKitSessionContext, organizationId: string, workspace: Workspace) {
    authorizeCommerceOrganizationAccess(session, organizationId, "connectors.view");
    return (await this.repository.activation(organizationId, workspace))?.mode || "mock";
  }

  async setWorkspaceMode(session: TraceKitSessionContext, organizationId: string, workspace: Workspace, mode: RepositoryMode, connectionId: string | null) {
    const scope = authorizeCommerceOrganizationAccess(session, organizationId, "connectors.manage");
    const current = (await this.repository.activation(organizationId, workspace))?.mode || "mock";
    if (!allowedTransition(current, mode)) throw new Error("Repository mode transition is not allowed.");
    let readinessEvidence: ReadinessEvidence = {};
    if (mode !== "mock") {
      if (!connectionId) throw new Error("A verified Connection is required.");
      const authorized = await authorizeCommerceConnectionAccess(this.repository, session, connectionId, "connectors.manage");
      if (authorized.connection.status !== "connected") throw new Error("A verified Connection is required.");
      if (mode === "live_beta" || mode === "live") {
        if (!this.readinessEvaluator) throw new Error("Repository readiness gates are incomplete.");
        readinessEvidence = await this.readinessEvaluator.evaluate({ scope, connection: authorized.connection, workspace });
      }
    }
    if ((mode === "live_beta" || mode === "live") && !readinessPassed(readinessEvidence)) throw new Error("Repository readiness gates are incomplete.");
    const result = await this.repository.setActivation({ organizationId, workspace, mode, connectionId, readinessEvidence, actorUserId: scope.actorUserId });
    await this.audit(scope, "repository_mode.changed", "commerce_repository_activation", workspace, { from: current, to: mode, connectionId });
    return result;
  }

  rollbackWorkspaceToMock(session: TraceKitSessionContext, organizationId: string, workspace: Workspace) {
    return this.setWorkspaceMode(session, organizationId, workspace, "mock", null);
  }

  private audit(scope: CommerceScope, action: string, targetType: string, targetId: string, metadata: Record<string, unknown> = {}) {
    return this.repository.recordAudit({ scope, action, targetType, targetId, result: "success", metadata: safeMetadata(metadata) });
  }
}

function allowedTransition(from: RepositoryMode, to: RepositoryMode) {
  const allowed: Record<RepositoryMode, RepositoryMode[]> = { mock: ["mock", "shadow"], shadow: ["shadow", "mock", "live_beta"], live_beta: ["live_beta", "shadow", "mock", "live"], live: ["live", "shadow", "mock"] };
  return allowed[from].includes(to);
}

function readinessPassed(evidence: ReadinessEvidence) {
  const required = ["connection_verified", "credential_active", "tenant_scope", "shadow_sync", "reconciliation", "product_mapping", "rollback_tested"];
  return required.every((gate) => evidence[gate]?.passed && Boolean(evidence[gate]?.evidence));
}

function redactSafeErrorSummary(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED]")
    .replace(/\b(?:bearer\s+)?[A-Za-z0-9_-]{24,}\b/gi, "[REDACTED]")
    .replace(/(api[_ -]?key|token|secret|authorization)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .slice(0, 500);
}
