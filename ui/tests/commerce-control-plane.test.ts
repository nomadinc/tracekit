import assert from "node:assert/strict";
import test from "node:test";
import { CommerceControlPlane, type Activation, type CommerceConnection, type CommerceControlRepository, type CredentialVersion, type ProviderAccount, type SourceMapping, type SyncCheckpoint, type SyncRun } from "../lib/commerce/control-plane";
import { CommerceCredentialResolutionError, decryptCommerceCredential, encryptCommerceCredential } from "../lib/commerce/credential-crypto";
import { MemoryCommerceEvidenceStore } from "../lib/commerce/evidence-store";
import type { TraceKitSessionContext } from "../lib/identity/persistent-types";

const ORG_A = "10000000-0000-0000-0000-000000000001";
const ORG_B = "20000000-0000-0000-0000-000000000001";
const ACCOUNT_A = "10000000-0000-0000-0000-000000000002";
const ACCOUNT_B = "20000000-0000-0000-0000-000000000002";
const key = new Uint8Array(32).fill(7);

function session(organizationId = ORG_A, accountId = ACCOUNT_A, permissions = ["connectors.view", "connectors.manage", "imports.view", "imports.manage", "offers.manage", "audit_logs.view"] as const): TraceKitSessionContext {
  return {
    user: { id: "user-a", workosUserId: "workos-a", primaryEmail: "admin@example.invalid", displayName: "Admin", avatarUrl: null, status: "active" },
    externalWorkosUserId: "workos-a", activeAccount: { id: accountId, accountType: "client", name: "A", status: "active" }, activeAgency: null,
    activeOrganization: { id: organizationId, accountId, name: "Organization", mark: "O" },
    availableOrganizations: [{ id: organizationId, accountId, name: "Organization", mark: "O" }],
    membership: { id: "membership-a", userId: "user-a", accountId: null, organizationId, role: "organization-admin", status: "active" }, role: "organization-admin",
    effectivePermissions: [...permissions], permissionOverrides: [], accessibleBusinessContexts: [], activeBusinessContextId: null,
    assurance: { authenticationMethod: "google", impersonated: false }, correlationId: "correlation-a",
  };
}

class MemoryRepository implements CommerceControlRepository {
  connections: CommerceConnection[] = [];
  accounts: ProviderAccount[] = [];
  credentials: CredentialVersion[] = [];
  runs: SyncRun[] = [];
  checkpointRows: SyncCheckpoint[] = [];
  mappings: SourceMapping[] = [];
  activations: Activation[] = [];
  audits: Array<{ action: string; metadata?: Record<string, unknown> }> = [];
  evidence = new Map<string, { organizationId: string; storageReference: string }>();
  lastTransition: Record<string, unknown> | null = null;
  private next = 1;
  async createConnection(input: Omit<CommerceConnection, "id" | "status">) { const row = { ...input, id: `connection-${this.next++}`, status: "draft" as const }; this.connections.push(row); return row; }
  async connectionById(id: string) { return this.connections.find((row) => row.id === id) || null; }
  async connectionBySetupRequest(organizationId: string, setupRequestId: string) { return this.connections.find((row) => row.organizationId === organizationId && row.setupRequestId === setupRequestId) || null; }
  async listConnections(organizationId: string) { return this.connections.filter((row) => row.organizationId === organizationId); }
  async updateConnection(id: string, organizationId: string, patch: Partial<CommerceConnection>) { const row = this.connections.find((item) => item.id === id && item.organizationId === organizationId); if (!row) throw new Error("Unavailable"); Object.assign(row, patch); return row; }
  async upsertProviderAccount(input: Omit<ProviderAccount, "id">) { const found = this.accounts.find((row) => row.connectionId === input.connectionId && row.externalId === input.externalId); if (found) return found; const row = { ...input, id: `account-${this.next++}` }; this.accounts.push(row); return row; }
  async listProviderAccounts(connectionId: string, organizationId: string) { return this.accounts.filter((row) => row.connectionId === connectionId && row.organizationId === organizationId); }
  async disableProviderAccount(id: string, connectionId: string, organizationId: string) { const row = this.accounts.find((item) => item.id === id && item.connectionId === connectionId && item.organizationId === organizationId); if (!row) throw new Error("Commerce resource unavailable."); row.status = "disabled"; return row; }
  async activeCredential(connectionId: string, organizationId: string) { return this.credentials.find((row) => row.connectionId === connectionId && row.organizationId === organizationId && !row.revokedAt) || null; }
  async insertCredential(input: Omit<CredentialVersion, "id">) { const row = { ...input, id: `credential-${this.next++}` }; this.credentials.push(row); return row; }
  async rotateCredential(input: { connectionId: string; organizationId: string; previousId: string; replacement: Omit<CredentialVersion, "id"> }) { const old = this.credentials.find((row) => row.id === input.previousId && row.connectionId === input.connectionId && row.organizationId === input.organizationId); if (!old) throw new Error("Unavailable"); old.revokedAt = new Date().toISOString(); return this.insertCredential(input.replacement); }
  async revokeCredential(id: string, connectionId: string, organizationId: string) { const row = this.credentials.find((item) => item.id === id && item.connectionId === connectionId && item.organizationId === organizationId); if (!row) throw new Error("Unavailable"); row.revokedAt = new Date().toISOString(); }
  async createSyncRun(input: Omit<SyncRun, "id" | "status">) { const row = { ...input, id: `run-${this.next++}`, status: "queued" }; this.runs.push(row); return row; }
  async claimSyncRun(input: { runId: string; organizationId: string; connectionId: string; owner: string; leaseSeconds: number }) { const row = this.runs.find((item) => item.id === input.runId && item.organizationId === input.organizationId && item.connectionId === input.connectionId && item.status === "queued"); if (!row) return null; row.status = "running"; row.leaseOwner = input.owner; return row; }
  async heartbeatSyncRun(input: { runId: string; organizationId: string; connectionId: string; owner: string; leaseSeconds: number }) { return this.runs.some((row) => row.id === input.runId && row.organizationId === input.organizationId && row.connectionId === input.connectionId && row.leaseOwner === input.owner && row.status === "running"); }
  async transitionSyncRun(input: { runId: string; organizationId: string; connectionId: string; owner: string; transition: "completed" | "completed_with_warnings" | "failed"; errorCode?: string; errorSummary?: string }) { this.lastTransition = input; const row = this.runs.find((item) => item.id === input.runId && item.organizationId === input.organizationId && item.connectionId === input.connectionId && item.leaseOwner === input.owner && item.status === "running"); if (!row) return false; row.status = input.transition; return true; }
  async cancelSyncRun(runId: string, organizationId: string, connectionId: string) { const row = this.runs.find((item) => item.id === runId && item.organizationId === organizationId && item.connectionId === connectionId && !["completed", "cancelled"].includes(item.status)); if (!row) return false; row.status = "cancelled"; return true; }
  async beginCheckpoint(input: Omit<SyncCheckpoint, "id" | "state" | "retryCount">) { const existing = this.checkpointRows.find((row) => row.syncRunId === input.syncRunId && row.resource === input.resource && row.page === input.page && row.perPage === input.perPage); if (existing) return existing; const row: SyncCheckpoint = { ...input, id: `checkpoint-${this.next++}`, state: "pending", retryCount: 0 }; this.checkpointRows.push(row); return row; }
  async updateCheckpoint(id: string, organizationId: string, connectionId: string, patch: Partial<SyncCheckpoint>) { const row = this.checkpointRows.find((item) => item.id === id && item.organizationId === organizationId && item.connectionId === connectionId); if (!row) throw new Error("Unavailable"); Object.assign(row, patch); return row; }
  async checkpoints(syncRunId: string, organizationId: string) { return this.checkpointRows.filter((row) => row.syncRunId === syncRunId && row.organizationId === organizationId); }
  async sourceMapping(connectionId: string, providerAccountId: string, sourceObjectType: string, sourceObjectId: string) { return this.mappings.find((row) => row.connectionId === connectionId && row.providerAccountId === providerAccountId && row.sourceObjectType === sourceObjectType && row.sourceObjectId === sourceObjectId) || null; }
  async upsertSourceMapping(input: Omit<SourceMapping, "id">) { const existing = await this.sourceMapping(input.connectionId, input.providerAccountId, input.sourceObjectType, input.sourceObjectId); if (existing) { existing.lastSeenAt = input.lastSeenAt; existing.payloadHash = input.payloadHash; return existing; } const row = { ...input, id: `mapping-${this.next++}` }; this.mappings.push(row); return row; }
  async canonicalTargetExists(organizationId: string, _type: string, id: string) { return organizationId === ORG_A && id.startsWith("canonical-"); }
  async decideProductMapping(input: { organizationId: string }) { if (input.organizationId !== ORG_A) throw new Error("Unavailable"); }
  async activation(organizationId: string, workspace: Activation["workspace"]) { return this.activations.find((row) => row.organizationId === organizationId && row.workspace === workspace) || null; }
  async setActivation(input: Activation & { actorUserId: string }) { const row: Activation = input; this.activations = this.activations.filter((item) => item.organizationId !== input.organizationId || item.workspace !== input.workspace); this.activations.push(row); return row; }
  async evidenceByReference(reference: string) { return this.evidence.get(reference) || null; }
  async recordAudit(input: { action: string; metadata?: Record<string, unknown> }) { this.audits.push(input); }
}

function setup() {
  const repository = new MemoryRepository();
  const evidenceStore = new MemoryCommerceEvidenceStore();
  const control = new CommerceControlPlane(repository, { bytes: key, id: "test-key", version: 1 }, evidenceStore, { verify: async () => ({ capabilities: ["customers.read", "transactions.read"] }) });
  return { repository, evidenceStore, control };
}

test("authorized Organization admin creates a tenant-bound Connection while another Organization fails closed", async () => {
  const { control } = setup();
  const connection = await control.createConnection(session(), ORG_A, { provider: "Commas", displayName: "Primary", environment: "production" });
  assert.equal(connection.accountId, ACCOUNT_A);
  await assert.rejects(() => control.getConnection(session(ORG_B, ACCOUNT_B), connection.id), /unavailable/i);
});

test("connection setup idempotency reuses one Organization-bound Connection", async () => {
  const { repository, control } = setup();
  const input = { provider: "commas", displayName: "Primary", environment: "production", setupRequestId: "10000000-0000-4000-8000-000000000010" };
  const first = await control.createConnection(session(), ORG_A, input);
  const repeated = await control.createConnection(session(), ORG_A, input);
  assert.equal(repeated.id, first.id);
  assert.equal(repository.connections.length, 1);
});

test("credential encryption uses fresh IVs, round trips, and fails safely with the wrong key", async () => {
  const first = await encryptCommerceCredential("synthetic-secret", key, "test-key");
  const second = await encryptCommerceCredential("synthetic-secret", key, "test-key");
  assert.notDeepEqual(first.iv, second.iv);
  assert.equal(await decryptCommerceCredential(first, key), "synthetic-secret");
  await assert.rejects(() => decryptCommerceCredential(first, new Uint8Array(32).fill(8)), CommerceCredentialResolutionError);
  assert.doesNotMatch(new CommerceCredentialResolutionError().message, /synthetic-secret/);
});

test("credential rotation retains the revoked version and cross-Organization rotation is denied", async () => {
  const { repository, control } = setup();
  const connection = await control.createConnection(session(), ORG_A, { provider: "commas", displayName: "Primary", environment: "production" });
  await control.createCredential(session(), connection.id, "first-synthetic-secret");
  await control.rotateCredential(session(), connection.id, "second-synthetic-secret");
  assert.equal(repository.credentials.length, 2);
  assert.ok(repository.credentials[0].revokedAt);
  assert.equal(repository.credentials.filter((row) => !row.revokedAt).length, 1);
  await assert.rejects(() => control.rotateCredential(session(ORG_B, ACCOUNT_B), connection.id, "blocked"), /unavailable/i);
});

test("verification resolves a credential server-side and returns capabilities without returning a secret", async () => {
  const { control } = setup();
  const connection = await control.createConnection(session(), ORG_A, { provider: "commas", displayName: "Primary", environment: "production" });
  await control.createCredential(session(), connection.id, "synthetic-secret");
  const result = await control.verifyConnection(session(), connection.id);
  assert.deepEqual(result, { status: "connected", capabilities: ["customers.read", "transactions.read"] });
  assert.doesNotMatch(JSON.stringify(result), /synthetic-secret/);
});

test("failed verification degrades safely and a later retry recovers", async () => {
  const repository = new MemoryRepository();
  let fails = true;
  const control = new CommerceControlPlane(repository, { bytes: key, id: "test-key", version: 1 }, new MemoryCommerceEvidenceStore(), { verify: async () => { if (fails) throw new Error("provider body with private data"); return { capabilities: ["customers.read"], providerStatus: 200 }; } });
  const connection = await control.createConnection(session(), ORG_A, { provider: "commas", displayName: "Primary", environment: "production" });
  await control.createCredential(session(), connection.id, "synthetic-secret");
  await assert.rejects(() => control.verifyConnection(session(), connection.id), /verification failed/i);
  assert.equal((await repository.connectionById(connection.id))?.status, "degraded");
  assert.equal((await repository.connectionById(connection.id))?.lastErrorCode, "provider_verification_failed");
  assert.doesNotMatch(JSON.stringify(repository.audits), /private data|synthetic-secret/);
  fails = false;
  assert.equal((await control.verifyConnection(session(), connection.id)).status, "connected");
  assert.equal((await repository.connectionById(connection.id))?.lastErrorCode, null);
});

test("sync creation and cancellation remain Organization authorized", async () => {
  const { control } = setup();
  const connection = await control.createConnection(session(), ORG_A, { provider: "commas", displayName: "Primary", environment: "production" });
  const run = await control.createSyncRun(session(), connection.id, "provider-account-a", "shadow", "transactions");
  assert.ok(await control.claimSyncRun(session(), connection.id, run.id, "worker-a"));
  assert.equal(await control.claimSyncRun(session(), connection.id, run.id, "worker-b"), null);
  assert.equal(await control.cancelSyncRun(session(), connection.id, run.id), true);
  await assert.rejects(() => control.cancelSyncRun(session(ORG_B, ACCOUNT_B), connection.id, run.id), /unavailable/i);
});

test("Sync failure persistence and audit redact secret-bearing summaries", async () => {
  const { repository, control } = setup();
  const connection = await control.createConnection(session(), ORG_A, { provider: "commas", displayName: "Primary", environment: "production" });
  const run = await control.createSyncRun(session(), connection.id, "provider-account-a", "shadow", "transactions");
  await control.claimSyncRun(session(), connection.id, run.id, "worker-a");
  await control.failSyncRun(session(), connection.id, run.id, "worker-a", "provider.failure", "api_key=synthetic-super-secret-value private@example.invalid");
  assert.doesNotMatch(JSON.stringify(repository.lastTransition), /synthetic-super-secret-value|private@example/);
  assert.doesNotMatch(JSON.stringify(repository.audits), /synthetic-super-secret-value|private@example/);
});

test("page checkpoints are idempotent and retain failure retry state without date cursors", async () => {
  const { control } = setup();
  const connection = await control.createConnection(session(), ORG_A, { provider: "commas", displayName: "Primary", environment: "production" });
  const run = await control.createSyncRun(session(), connection.id, "provider-account-a", "shadow", "transactions");
  const input = { syncRunId: run.id, providerAccountId: "provider-account-a", resource: "transactions", page: 1, perPage: 100 };
  const first = await control.beginCheckpoint(session(), connection.id, input);
  const repeated = await control.beginCheckpoint(session(), connection.id, input);
  assert.equal(first.id, repeated.id);
  await control.failCheckpoint(session(), connection.id, first.id, 1);
  assert.equal((await control.listRetryableCheckpoints(session(), connection.id, run.id))[0].retryCount, 1);
  assert.equal("updatedAfter" in first, false);
});

test("source mapping validates canonical target Organization and replays by source identity", async () => {
  const { control } = setup();
  const connection = await control.createConnection(session(), ORG_A, { provider: "commas", displayName: "Primary", environment: "production" });
  const input = { providerAccountId: "provider-account-a", sourceObjectType: "transaction", sourceObjectId: "source-1", canonicalObjectType: "order", canonicalObjectId: "canonical-order-a", payloadHash: "hash-a", lastSeenAt: new Date().toISOString() };
  const first = await control.createOrObserveSourceMapping(session(), connection.id, input);
  const second = await control.createOrObserveSourceMapping(session(), connection.id, { ...input, payloadHash: "hash-b" });
  assert.equal(first.id, second.id);
  await assert.rejects(() => control.createOrObserveSourceMapping(session(), connection.id, { ...input, sourceObjectId: "source-2", canonicalObjectId: "foreign-order" }), /unavailable/i);
});

test("evidence access requires the persistent session Organization", async () => {
  const { repository, evidenceStore, control } = setup();
  const stored = await evidenceStore.putImmutable({ organizationId: ORG_A, payload: new TextEncoder().encode('{"synthetic":true}'), contentType: "application/json" });
  repository.evidence.set("evidence-a", { organizationId: ORG_A, storageReference: stored.storageReference });
  assert.match(new TextDecoder().decode(await control.getEvidencePayload(session(), "evidence-a")), /synthetic/);
  await assert.rejects(() => control.getEvidencePayload(session(ORG_B, ACCOUNT_B), "evidence-a"), /unavailable/i);
});

test("repository activation defaults to mock, requires readiness, and rolls back immediately", async () => {
  const { control } = setup();
  const connection = await control.createConnection(session(), ORG_A, { provider: "commas", displayName: "Primary", environment: "production" });
  assert.equal(await control.getWorkspaceMode(session(), ORG_A, "orders"), "mock");
  await assert.rejects(() => control.setWorkspaceMode(session(), ORG_A, "orders", "shadow", connection.id), /verified Connection/);
  await control.createCredential(session(), connection.id, "synthetic-secret");
  await control.verifyConnection(session(), connection.id);
  await control.setWorkspaceMode(session(), ORG_A, "orders", "shadow", connection.id);
  await assert.rejects(() => control.setWorkspaceMode(session(), ORG_A, "orders", "live_beta", connection.id), /readiness/);
  assert.equal((await control.rollbackWorkspaceToMock(session(), ORG_A, "orders")).mode, "mock");
});

test("development state cannot substitute for a persistent authorized session", async () => {
  const { control } = setup();
  await assert.rejects(() => control.createConnection(null as unknown as TraceKitSessionContext, ORG_A, { provider: "commas", displayName: "Blocked", environment: "production" }), /unavailable|resource/i);
});
