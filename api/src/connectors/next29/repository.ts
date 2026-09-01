import type { Next29HistoricalCheckpoint, Next29HistoricalPersistence, Next29HistoricalScope } from "./historical-sync.ts";
import { expandNext29Order, type Next29CanonicalExpansion } from "./expansion.ts";
import type { NormalizedNext29Order } from "./normalize.ts";

export type Next29CommerceSourceMapping = {
  id: string;
  canonicalObjectId: string;
};

export type Next29CommerceRepositoryClient = {
  createHistoricalRun(input: Next29HistoricalScope & { resource: "orders"; checkpoint: Next29HistoricalCheckpoint }): Promise<{ id: string }>;
  appendHistoricalCheckpoint(input: Next29HistoricalScope & { syncRunId: string; checkpoint: Next29HistoricalCheckpoint; recordsSeen: number }): Promise<void>;
  finishHistoricalRun(input: Next29HistoricalScope & { syncRunId: string; checkpoint: Next29HistoricalCheckpoint; pagesCompleted: number; recordsSeen: number; hasMore: boolean }): Promise<void>;
  failHistoricalRun(input: Next29HistoricalScope & { syncRunId: string; checkpoint: Next29HistoricalCheckpoint; pagesCompleted: number; recordsSeen: number; error: string }): Promise<void>;
  ensureOrderEvidence(input: Next29HistoricalScope & {
    syncRunId: string;
    sourceObjectId: string;
    storageReference: string;
    payloadHash: string;
    byteSize: number;
    sourceUpdatedAt: string;
  }): Promise<{ evidenceId: string }>;
  ensureOrderSourceMapping(input: Next29HistoricalScope & {
    sourceObjectId: string;
    payloadHash: string;
    sourceUpdatedAt: string;
    mappingVersion: "next29-order-v1";
  }): Promise<Next29CommerceSourceMapping>;
  upsertPlatformOrder(input: Next29HistoricalScope & {
    accountId?: string | null;
    normalized: NormalizedNext29Order;
    canonicalOrderId: string;
    sourceMappingId: string;
    evidenceId: string;
    rawOrder: unknown;
  }): Promise<void>;
  upsertOrderLines(input: Next29HistoricalScope & {
    canonicalOrderId: string;
    evidenceId: string;
    expansion: Next29CanonicalExpansion;
  }): Promise<void>;
  upsertCustomerIdentity(input: Next29HistoricalScope & {
    canonicalOrderId: string;
    evidenceId: string;
    expansion: Next29CanonicalExpansion;
  }): Promise<void>;
  upsertTransactions(input: Next29HistoricalScope & {
    canonicalOrderId: string;
    evidenceId: string;
    expansion: Next29CanonicalExpansion;
  }): Promise<void>;
  upsertRefunds(input: Next29HistoricalScope & {
    canonicalOrderId: string;
    evidenceId: string;
    expansion: Next29CanonicalExpansion;
  }): Promise<void>;
};

export function createNext29HistoricalPersistence(client: Next29CommerceRepositoryClient): Next29HistoricalPersistence {
  return {
    async beginRun(input) {
      const run = await client.createHistoricalRun(input);
      if (!String(run.id || "").trim()) throw new Error("29Next commerce repository did not return a sync run id.");
      return { syncRunId: run.id };
    },

    async persistOrder(input) {
      const evidence = await client.ensureOrderEvidence({
        organizationId: input.organizationId,
        connectionId: input.connectionId,
        providerAccountId: input.providerAccountId,
        syncRunId: input.syncRunId,
        sourceObjectId: input.normalized.sourceObjectId,
        storageReference: input.evidence.storageReference,
        payloadHash: input.evidence.payloadHash,
        byteSize: input.evidence.byteSize,
        sourceUpdatedAt: input.normalized.providerUpdatedAt,
      });
      const mapping = await client.ensureOrderSourceMapping({
        organizationId: input.organizationId,
        connectionId: input.connectionId,
        providerAccountId: input.providerAccountId,
        sourceObjectId: input.normalized.sourceObjectId,
        payloadHash: input.evidence.payloadHash,
        sourceUpdatedAt: input.normalized.providerUpdatedAt,
        mappingVersion: "next29-order-v1",
      });
      await client.upsertPlatformOrder({
        organizationId: input.organizationId,
        connectionId: input.connectionId,
        providerAccountId: input.providerAccountId,
        normalized: input.normalized,
        canonicalOrderId: mapping.canonicalObjectId,
        sourceMappingId: mapping.id,
        evidenceId: evidence.evidenceId,
        rawOrder: input.rawOrder,
      });

      const expansion = expandNext29Order(input.rawOrder);
      const expansionInput = {
        organizationId: input.organizationId,
        connectionId: input.connectionId,
        providerAccountId: input.providerAccountId,
        canonicalOrderId: mapping.canonicalObjectId,
        evidenceId: evidence.evidenceId,
        expansion,
      };
      await client.upsertOrderLines(expansionInput);
      await client.upsertCustomerIdentity(expansionInput);
      await client.upsertTransactions(expansionInput);
      await client.upsertRefunds(expansionInput);
    },

    async appendCheckpoint(input) {
      await client.appendHistoricalCheckpoint(input);
    },

    async completeRun(input) {
      await client.finishHistoricalRun(input);
    },

    async failRun(input) {
      await client.failHistoricalRun(input);
    },
  };
}

export function next29PlatformOrderRow(input: Next29HistoricalScope & {
  accountId?: string | null;
  normalized: NormalizedNext29Order;
  canonicalOrderId: string;
  sourceMappingId: string;
  evidenceId: string;
  rawOrder: unknown;
}) {
  return {
    platform: "next29",
    platform_order_id: input.normalized.platformOrderId,
    provider_order_id: input.normalized.sourceObjectId,
    order_id: input.normalized.orderId,
    order_ts: input.normalized.orderTs,
    status: input.normalized.status,
    status_norm: input.normalized.statusNorm,
    currency: input.normalized.currency,
    gross_amount: input.normalized.grossAmount,
    product_subtotal: input.normalized.productSubtotal,
    tax_amount: input.normalized.taxAmount,
    raw: input.rawOrder,
    raw_json: input.rawOrder,
    workspace_id: input.organizationId,
    canonical_order_id: input.canonicalOrderId,
    source_mapping_id: input.sourceMappingId,
    evidence_id: input.evidenceId,
    account_id: input.accountId ?? null,
    organization_id: input.organizationId,
    connection_id: input.connectionId,
    provider_account_id: input.providerAccountId,
    reconciliation_state: "observed",
    data_quality_state: "observed",
    metadata: {
      provider: "next29",
      is_test: input.normalized.isTest,
      attribution: input.normalized.attribution,
      discount_amount: input.normalized.discountAmount,
    },
  };
}
