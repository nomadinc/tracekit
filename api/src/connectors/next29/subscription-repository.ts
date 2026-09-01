import type { Next29CanonicalSubscription } from "./subscription.ts";
import type { Next29SubscriptionCheckpoint, Next29SubscriptionPersistence, Next29SubscriptionSyncScope } from "./subscription-historical-sync.ts";

export type Next29SubscriptionSourceMapping = { id: string; canonicalObjectId: string };

export type Next29SubscriptionRepositoryClient = {
  createSubscriptionRun(input: Next29SubscriptionSyncScope & { resource: "subscriptions"; checkpoint: Next29SubscriptionCheckpoint }): Promise<{ id: string }>;
  appendSubscriptionCheckpoint(input: Next29SubscriptionSyncScope & { syncRunId: string; checkpoint: Next29SubscriptionCheckpoint; recordsSeen: number }): Promise<void>;
  finishSubscriptionRun(input: Next29SubscriptionSyncScope & { syncRunId: string; checkpoint: Next29SubscriptionCheckpoint; pagesCompleted: number; recordsSeen: number; hasMore: boolean }): Promise<void>;
  failSubscriptionRun(input: Next29SubscriptionSyncScope & { syncRunId: string; checkpoint: Next29SubscriptionCheckpoint; pagesCompleted: number; recordsSeen: number; error: string }): Promise<void>;
  ensureSubscriptionEvidence(input: Next29SubscriptionSyncScope & { syncRunId: string; sourceObjectId: string; storageReference: string; payloadHash: string; byteSize: number; sourceUpdatedAt: string | null }): Promise<{ evidenceId: string }>;
  ensureSubscriptionSourceMapping(input: Next29SubscriptionSyncScope & { sourceObjectId: string; payloadHash: string; sourceUpdatedAt: string | null; mappingVersion: "next29-subscription-v1" }): Promise<Next29SubscriptionSourceMapping>;
  upsertSubscription(input: Next29SubscriptionSyncScope & { normalized: Next29CanonicalSubscription; canonicalSubscriptionId: string; sourceMappingId: string; evidenceId: string }): Promise<void>;
  replaceSubscriptionLines(input: Next29SubscriptionSyncScope & { normalized: Next29CanonicalSubscription; canonicalSubscriptionId: string; evidenceId: string }): Promise<void>;
  resolveCanonicalOrder(input: Next29SubscriptionSyncScope & { providerOrderId: string }): Promise<{ canonicalOrderId: string } | null>;
  upsertSubscriptionOrderLink(input: Next29SubscriptionSyncScope & { canonicalSubscriptionId: string; providerOrderId: string; canonicalOrderId: string | null; billingCycle: number | null; evidenceId: string }): Promise<void>;
};

export function createNext29SubscriptionPersistence(client: Next29SubscriptionRepositoryClient): Next29SubscriptionPersistence {
  return {
    async beginRun(input) {
      const run = await client.createSubscriptionRun(input);
      if (!String(run.id || "").trim()) throw new Error("29Next subscription repository did not return a sync run id.");
      return { syncRunId: run.id };
    },
    async persistSubscription(input) {
      const sourceUpdatedAt = input.normalized.nextRenewalAt || input.normalized.createdAt;
      const evidence = await client.ensureSubscriptionEvidence({ ...scope(input), syncRunId: input.syncRunId, sourceObjectId: input.normalized.providerSubscriptionId, storageReference: input.evidence.storageReference, payloadHash: input.evidence.payloadHash, byteSize: input.evidence.byteSize, sourceUpdatedAt });
      const mapping = await client.ensureSubscriptionSourceMapping({ ...scope(input), sourceObjectId: input.normalized.providerSubscriptionId, payloadHash: input.evidence.payloadHash, sourceUpdatedAt, mappingVersion: "next29-subscription-v1" });
      await client.upsertSubscription({ ...scope(input), normalized: input.normalized, canonicalSubscriptionId: mapping.canonicalObjectId, sourceMappingId: mapping.id, evidenceId: evidence.evidenceId });
      await client.replaceSubscriptionLines({ ...scope(input), normalized: input.normalized, canonicalSubscriptionId: mapping.canonicalObjectId, evidenceId: evidence.evidenceId });
      for (const renewal of input.normalized.renewalOrders) {
        const order = await client.resolveCanonicalOrder({ ...scope(input), providerOrderId: renewal.providerOrderId });
        await client.upsertSubscriptionOrderLink({ ...scope(input), canonicalSubscriptionId: mapping.canonicalObjectId, providerOrderId: renewal.providerOrderId, canonicalOrderId: order?.canonicalOrderId ?? null, billingCycle: renewal.billingCycle, evidenceId: evidence.evidenceId });
      }
    },
    async appendCheckpoint(input) { await client.appendSubscriptionCheckpoint(input); },
    async completeRun(input) { await client.finishSubscriptionRun(input); },
    async failRun(input) { await client.failSubscriptionRun(input); },
  };
}

export function next29SubscriptionRow(input: Next29SubscriptionSyncScope & { accountId: string; normalized: Next29CanonicalSubscription; canonicalSubscriptionId: string; sourceMappingId: string; evidenceId: string; observedAt?: string }) {
  const now = input.observedAt ?? new Date().toISOString();
  return {
    id: input.canonicalSubscriptionId,
    account_id: input.accountId,
    organization_id: input.organizationId,
    connection_id: input.connectionId,
    provider_account_id: input.providerAccountId,
    provider_subscription_id: input.normalized.providerSubscriptionId,
    provider_customer_id: input.normalized.providerCustomerId,
    status: input.normalized.status,
    currency: input.normalized.currency,
    recurring_amount: input.normalized.recurringAmount,
    interval_unit: input.normalized.interval,
    interval_count: input.normalized.intervalCount,
    next_renewal_at: input.normalized.nextRenewalAt,
    source_created_at: input.normalized.createdAt,
    cancel_reason: input.normalized.cancelReason,
    is_test: input.normalized.isTest,
    source_mapping_id: input.sourceMappingId,
    evidence_id: input.evidenceId,
    last_seen_at: now,
    metadata: { provider: "next29", payment_method: input.normalized.paymentMethod, attribution: input.normalized.attribution },
    updated_at: now,
  };
}

export function next29SubscriptionLineRows(input: Next29SubscriptionSyncScope & { canonicalSubscriptionId: string; evidenceId: string; normalized: Next29CanonicalSubscription }) {
  return input.normalized.lines.map((line) => ({
    organization_id: input.organizationId,
    connection_id: input.connectionId,
    provider_account_id: input.providerAccountId,
    subscription_id: input.canonicalSubscriptionId,
    provider_line_id: line.providerLineId,
    provider_product_id: line.providerProductId,
    provider_variant_id: line.providerVariantId,
    sku: line.sku,
    title: line.title,
    quantity: line.quantity,
    recurring_unit_amount: line.recurringUnitAmount,
    currency: input.normalized.currency,
    evidence_id: input.evidenceId,
    metadata: { provider: "next29" },
  }));
}

export function next29SubscriptionOrderLinkRow(input: Next29SubscriptionSyncScope & { canonicalSubscriptionId: string; providerOrderId: string; canonicalOrderId: string | null; billingCycle: number | null; evidenceId: string; observedAt?: string }) {
  return { organization_id: input.organizationId, connection_id: input.connectionId, provider_account_id: input.providerAccountId, subscription_id: input.canonicalSubscriptionId, provider_order_id: input.providerOrderId, canonical_order_id: input.canonicalOrderId, billing_cycle: input.billingCycle, evidence_id: input.evidenceId, observed_at: input.observedAt ?? new Date().toISOString(), metadata: { provider: "next29", reconciliation_state: input.canonicalOrderId ? "linked" : "pending_order" } };
}

function scope(input: Next29SubscriptionSyncScope): Next29SubscriptionSyncScope { return { organizationId: input.organizationId, connectionId: input.connectionId, providerAccountId: input.providerAccountId }; }
