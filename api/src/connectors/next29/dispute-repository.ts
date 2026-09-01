import { next29DisputeLifecycleFingerprint, next29DisputeReconciliationKeys, type Next29CanonicalDispute } from "./dispute.ts";
import type { Next29DisputeCheckpoint, Next29DisputePersistence, Next29DisputeScope } from "./dispute-historical-sync.ts";

export type Next29DisputeRepositoryClient = {
  createHistoricalRun(input: Next29DisputeScope & { resource: "disputes"; checkpoint: Next29DisputeCheckpoint }): Promise<{ id: string }>;
  appendHistoricalCheckpoint(input: Next29DisputeScope & { syncRunId: string; checkpoint: Next29DisputeCheckpoint; recordsSeen: number }): Promise<void>;
  finishHistoricalRun(input: Next29DisputeScope & { syncRunId: string; checkpoint: Next29DisputeCheckpoint; pagesCompleted: number; recordsSeen: number; hasMore: boolean }): Promise<void>;
  failHistoricalRun(input: Next29DisputeScope & { syncRunId: string; checkpoint: Next29DisputeCheckpoint; pagesCompleted: number; recordsSeen: number; error: string }): Promise<void>;
  ensureDisputeEvidence(input: Next29DisputeScope & { syncRunId: string; sourceObjectId: string; storageReference: string; payloadHash: string; byteSize: number; sourceUpdatedAt: string }): Promise<{ evidenceId: string }>;
  resolveCanonicalOrder(input: Next29DisputeScope & { providerTransactionId: string | null; providerOrderId: string | null }): Promise<{ canonicalOrderId: string | null; state: "matched" | "review" | "unmatched"; matchedBy: "transaction" | "order" | null }>;
  upsertProviderDispute(input: Next29DisputeScope & { normalized: Next29CanonicalDispute; evidenceId: string; payloadHash: string; canonicalOrderId: string | null; reconciliationState: "matched" | "review" | "unmatched"; matchedBy: "transaction" | "order" | null; rawDispute: unknown }): Promise<{ disputeId: string; lifecycleChanged: boolean }>;
  appendDisputeLifecycle(input: Next29DisputeScope & { disputeId: string; evidenceId: string; fingerprint: string; normalized: Next29CanonicalDispute }): Promise<void>;
};

export function createNext29DisputePersistence(client: Next29DisputeRepositoryClient): Next29DisputePersistence {
  return {
    async beginRun(input) { const run = await client.createHistoricalRun(input); if (!String(run.id || "").trim()) throw new Error("29Next dispute repository did not return a sync run id."); return { syncRunId: run.id }; },
    async persistDispute(input) {
      const evidence = await client.ensureDisputeEvidence({ ...scope(input), syncRunId: input.syncRunId, sourceObjectId: input.normalized.providerDisputeId, storageReference: input.evidence.storageReference, payloadHash: input.evidence.payloadHash, byteSize: input.evidence.byteSize, sourceUpdatedAt: input.normalized.happenedAt || input.normalized.sourceCreatedAt || new Date().toISOString() });
      const keys = next29DisputeReconciliationKeys(input.normalized);
      const match = await client.resolveCanonicalOrder({ ...scope(input), providerTransactionId: keys.providerTransactionId, providerOrderId: keys.providerOrderId });
      const dispute = await client.upsertProviderDispute({ ...scope(input), normalized: input.normalized, evidenceId: evidence.evidenceId, payloadHash: input.evidence.payloadHash, canonicalOrderId: match.canonicalOrderId, reconciliationState: match.state, matchedBy: match.matchedBy, rawDispute: input.rawDispute });
      if (dispute.lifecycleChanged) await client.appendDisputeLifecycle({ ...scope(input), disputeId: dispute.disputeId, evidenceId: evidence.evidenceId, fingerprint: next29DisputeLifecycleFingerprint(input.normalized), normalized: input.normalized });
    },
    appendCheckpoint: (input) => client.appendHistoricalCheckpoint(input),
    completeRun: (input) => client.finishHistoricalRun(input),
    failRun: (input) => client.failHistoricalRun(input),
  };
}

export function next29ProviderDisputeRow(input: Next29DisputeScope & { accountId: string; normalized: Next29CanonicalDispute; evidenceId: string; canonicalOrderId: string | null; reconciliationState: "matched" | "review" | "unmatched"; matchedBy: "transaction" | "order" | null; rawDispute: unknown }) {
  return {
    organization_id: input.organizationId,
    account_id: input.accountId,
    connection_id: input.connectionId,
    provider_account_id: input.providerAccountId,
    provider_dispute_id: input.normalized.providerDisputeId,
    latest_evidence_id: input.evidenceId,
    provider_transaction_id: input.normalized.providerTransactionId,
    order_id: input.normalized.providerOrderId,
    amount: input.normalized.amount,
    currency: input.normalized.currency,
    status: input.normalized.status,
    state: input.normalized.type,
    reason: input.normalized.resolutionOtherMessage,
    reason_code: input.normalized.resolution,
    opened_at: input.normalized.happenedAt,
    reconciliation_state: input.reconciliationState,
    matched_canonical_order_id: input.canonicalOrderId,
    metadata: { provider: "next29", arn: input.normalized.arn, case_number: input.normalized.caseNumber, report_amount: input.normalized.reportAmount, report_currency: input.normalized.reportCurrency, resolution: input.normalized.resolution, matched_by: input.matchedBy, provider_metadata: input.normalized.metadata, raw_dispute_preserved_in_evidence: true },
  };
}

export function next29ChargebackLedgerProjection(dispute: Next29CanonicalDispute) {
  // Lifecycle observations are not financial events. Projection is returned only
  // when the provider object is a chargeback with a durable transaction id and amount.
  if (dispute.type !== "chargeback" || !dispute.providerTransactionId || dispute.amount === null) return null;
  return {
    ledger_type: "chargeback" as const,
    transaction_id: dispute.providerTransactionId,
    order_id: dispute.providerOrderId,
    amount: -Math.abs(dispute.amount),
    currency: dispute.currency,
    platform: "next29",
    source_system: "next29",
    dispute_id: dispute.providerDisputeId,
    source_event_id: `next29:dispute:${dispute.providerDisputeId}:chargeback`,
    occurred_at: dispute.happenedAt || dispute.sourceCreatedAt,
  };
}

function scope(input: Next29DisputeScope): Next29DisputeScope { return { organizationId: input.organizationId, connectionId: input.connectionId, providerAccountId: input.providerAccountId }; }
