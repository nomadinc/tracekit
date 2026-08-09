import "server-only";
import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";
import { authorizeCommerceConnectionAccess } from "./control-plane";
import type { CommerceEvidenceStore } from "./evidence-store";
import { commercePersistenceRequest, SupabaseCommerceControlRepository } from "./supabase-control-repository";

type PersistEvidenceInput = {
  connectionId: string;
  providerAccountId: string;
  syncRunId: string;
  sourceObjectType: string;
  sourceObjectId: string;
  payload: Uint8Array;
  contentType: string;
  sourceCreatedAt?: string | null;
  sourceUpdatedAt?: string | null;
  normalizerVersion: string;
  mappingVersion: string;
  piiClassification: "none" | "restricted" | "sensitive" | "highly_sensitive";
  retentionPolicy: string;
};

type Row = Record<string, unknown>;

export class DurableCommerceEvidenceService {
  constructor(private readonly store: CommerceEvidenceStore, private readonly repository = new SupabaseCommerceControlRepository()) {}

  async persist(session: TraceKitSessionContext, input: PersistEvidenceInput) {
    const { scope } = await authorizeCommerceConnectionAccess(this.repository, session, input.connectionId, "imports.manage");
    const stored = await this.store.putImmutable({ organizationId: scope.organizationId, connectionId: input.connectionId, providerAccountId: input.providerAccountId, sourceObjectType: input.sourceObjectType, payload: input.payload, contentType: input.contentType });
    const body = {
      organization_id: scope.organizationId, connection_id: input.connectionId, provider_account_id: input.providerAccountId,
      sync_run_id: input.syncRunId, source_object_type: input.sourceObjectType, source_object_id: input.sourceObjectId,
      payload_hash: stored.payloadHash, storage_backend: "object_storage", storage_reference: stored.storageReference,
      content_type: stored.contentType, byte_size: stored.byteSize, source_created_at: input.sourceCreatedAt || null,
      source_updated_at: input.sourceUpdatedAt || null, observed_at: new Date().toISOString(), normalizer_version: input.normalizerVersion,
      mapping_version: input.mappingVersion, pii_classification: input.piiClassification, retention_policy: input.retentionPolicy,
      metadata: { immutable: true },
    };
    const rows = await commercePersistenceRequest("commerce_evidence_records?on_conflict=connection_id,provider_account_id,source_object_type,source_object_id,payload_hash", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(body) });
    if (rows[0]) return this.safeRecord(rows[0]);
    const existing = await commercePersistenceRequest(`commerce_evidence_records?connection_id=eq.${encodeURIComponent(input.connectionId)}&provider_account_id=eq.${encodeURIComponent(input.providerAccountId)}&source_object_type=eq.${encodeURIComponent(input.sourceObjectType)}&source_object_id=eq.${encodeURIComponent(input.sourceObjectId)}&payload_hash=eq.${stored.payloadHash}&limit=1`);
    if (!existing[0]) throw new Error("Commerce Evidence metadata could not be persisted.");
    return this.safeRecord(existing[0]);
  }

  async retrieve(session: TraceKitSessionContext, connectionId: string, evidenceId: string) {
    const { scope } = await authorizeCommerceConnectionAccess(this.repository, session, connectionId, "imports.view");
    const rows = await commercePersistenceRequest(`commerce_evidence_records?id=eq.${encodeURIComponent(evidenceId)}&connection_id=eq.${encodeURIComponent(connectionId)}&organization_id=eq.${encodeURIComponent(scope.organizationId)}&deleted_at=is.null&limit=1`);
    if (!rows[0]) throw new Error("Evidence unavailable.");
    const payload = await this.store.getAuthorized({ organizationId: scope.organizationId, storageReference: String(rows[0].storage_reference) });
    if (!payload || !(await this.store.verifyHash({ organizationId: scope.organizationId, storageReference: String(rows[0].storage_reference), payloadHash: String(rows[0].payload_hash) }))) throw new Error("Evidence integrity verification failed.");
    return payload;
  }

  async erase(session: TraceKitSessionContext, connectionId: string, evidenceId: string) {
    const { scope } = await authorizeCommerceConnectionAccess(this.repository, session, connectionId, "connectors.manage");
    const rows = await commercePersistenceRequest(`commerce_evidence_records?id=eq.${encodeURIComponent(evidenceId)}&connection_id=eq.${encodeURIComponent(connectionId)}&organization_id=eq.${encodeURIComponent(scope.organizationId)}&deleted_at=is.null&limit=1`);
    if (!rows[0]) throw new Error("Evidence unavailable.");
    await this.store.markErased({ organizationId: scope.organizationId, storageReference: String(rows[0].storage_reference) });
    await commercePersistenceRequest(`commerce_evidence_records?id=eq.${encodeURIComponent(evidenceId)}&organization_id=eq.${encodeURIComponent(scope.organizationId)}`, { method: "PATCH", body: JSON.stringify({ deleted_at: new Date().toISOString() }) });
    await this.repository.recordAudit({ scope, action: "commerce_evidence.erased", targetType: "commerce_evidence_record", targetId: evidenceId, result: "success", metadata: { retentionPolicy: String(rows[0].retention_policy) } });
  }

  private safeRecord(row: Row) { return { id: String(row.id), payloadHash: String(row.payload_hash), byteSize: Number(row.byte_size), contentType: String(row.content_type) }; }
}
