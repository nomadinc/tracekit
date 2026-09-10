import "server-only";

import { randomUUID } from "node:crypto";
import { Next29Client } from "../../../api/src/connectors/next29/client.ts";
import { runNext29LiveValidation, type Next29LiveValidationReport } from "../../../api/src/connectors/next29/live-validation.ts";
import { createNext29HistoricalPersistence } from "../../../api/src/connectors/next29/repository.ts";
import { createNext29SubscriptionPersistence, next29SubscriptionLineRows, next29SubscriptionOrderLinkRow, next29SubscriptionRow } from "../../../api/src/connectors/next29/subscription-repository.ts";
import { createNext29DisputePersistence } from "../../../api/src/connectors/next29/dispute-repository.ts";
import type { Next29CanonicalExpansion } from "../../../api/src/connectors/next29/expansion.ts";
import type { Next29EvidenceSink } from "../../../api/src/connectors/next29/types.ts";
import { parseNext29ConnectionCredential } from "./next29-verifier";
import { createCommerceControlPlane } from "./server-control-plane";
import { SupabaseCommerceEvidenceStore } from "./supabase-evidence-store";
import { commercePersistenceRequest } from "./supabase-control-repository";
import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";

const MAX_RECORDS = 10;
const VALIDATION_ENV = new Set(["preview", "staging"]);
type Row = Record<string, unknown>;
type Scope = { organizationId: string; connectionId: string; providerAccountId: string };

type ValidationContext = Scope & {
  accountId: string;
  environment: "preview" | "staging";
  client: Next29Client;
};

export async function runStoredNext29LiveValidation(input: {
  session: TraceKitSessionContext;
  connectionId: string;
}): Promise<Next29LiveValidationReport> {
  const environment = validationEnvironment();
  const evidenceStore = new SupabaseCommerceEvidenceStore();
  const plane = createCommerceControlPlane({ evidenceStore });
  const connection = await plane.getConnection(input.session, input.connectionId);
  if (connection.provider !== "next29") throw new Error("29Next live validation requires a 29Next connection.");
  if (!input.session.activeAccount?.id || !input.session.activeOrganization?.id) throw new Error("29Next live validation requires an active workspace.");

  const accounts = (await plane.listProviderAccounts(input.session, input.connectionId))
    .filter((row) => row.status === "active" && !row.provisional);
  if (accounts.length !== 1) throw new Error("29Next live validation requires exactly one active provider account.");

  await assertExecutionDisabled({ organizationId: connection.organizationId, connectionId: connection.id, providerAccountId: accounts[0].id });

  const secret = await plane.resolveCredentialForExecution(input.session, input.connectionId);
  const credential = parseNext29ConnectionCredential(secret);
  const client = new Next29Client({ store: credential.store, accessToken: credential.accessToken, apiVersion: credential.apiVersion });
  const context: ValidationContext = {
    accountId: input.session.activeAccount.id,
    organizationId: connection.organizationId,
    connectionId: connection.id,
    providerAccountId: accounts[0].id,
    environment,
    client,
  };

  const evidenceSink: Next29EvidenceSink = {
    async putImmutable(item) {
      const stored = await evidenceStore.putImmutable({
        organizationId: item.organizationId,
        connectionId: item.connectionId,
        providerAccountId: item.providerAccountId,
        sourceObjectType: item.sourceObjectType,
        payload: item.payload,
        contentType: item.contentType,
      });
      return { storageReference: stored.storageReference, payloadHash: stored.payloadHash, byteSize: stored.byteSize };
    },
  };

  const persistence = createPersistence(context);
  return runNext29LiveValidation({
    environment,
    organizationId: context.organizationId,
    connectionId: context.connectionId,
    providerAccountId: context.providerAccountId,
    client,
    evidenceSink,
    persistence,
  });
}

export function validationEnvironment(): "preview" | "staging" {
  const requested = String(process.env.TRACEKIT_NEXT29_LIVE_VALIDATION_ENV || "").trim().toLowerCase();
  if (!VALIDATION_ENV.has(requested)) {
    throw new Error("Set TRACEKIT_NEXT29_LIVE_VALIDATION_ENV to preview or staging before running 29Next live validation.");
  }
  if (process.env.NODE_ENV === "production") throw new Error("29Next live validation cannot run from a production UI runtime.");
  return requested as "preview" | "staging";
}

async function assertExecutionDisabled(scope: Scope) {
  const encodedConnection = encodeURIComponent(scope.connectionId);
  const schedules = await commercePersistenceRequest(`commerce_sync_schedules?connection_id=eq.${encodedConnection}&enabled=eq.true&select=id&limit=1`).catch(() => []);
  if (schedules.length) throw new Error("29Next live validation requires all connection schedules to remain disabled.");
  const activeRuns = await commercePersistenceRequest(`commerce_sync_runs?connection_id=eq.${encodedConnection}&status=in.(queued,running)&select=id&limit=1`);
  if (activeRuns.length) throw new Error("29Next live validation will not run while another commerce sync is active.");
}

function createPersistence(context: ValidationContext) {
  const runClient = createRunClient(context);
  const evidence = createEvidenceClient(context);
  const mappings = createMappingClient(context);

  const orders = createNext29HistoricalPersistence({
    ...runClient.orders,
    ...evidence.orders,
    ...mappings.orders,
    async upsertPlatformOrder(input) {
      const row = input.normalized;
      await upsert("platform_orders", "platform_order_id", {
        platform: "next29",
        platform_order_id: row.platformOrderId,
        provider_order_id: row.sourceObjectId,
        order_id: row.orderId,
        order_ts: row.orderTs,
        status: row.status || row.statusNorm || "unknown",
        status_norm: row.statusNorm,
        currency: row.currency,
        gross_amount: row.grossAmount,
        product_subtotal: row.productSubtotal,
        tax_amount: row.taxAmount,
        raw: input.rawOrder,
        raw_json: input.rawOrder,
        workspace_id: input.organizationId,
        canonical_order_id: input.canonicalOrderId,
        source_mapping_id: input.sourceMappingId,
        evidence_id: input.evidenceId,
        account_id: context.accountId,
        organization_id: input.organizationId,
        connection_id: input.connectionId,
        provider_account_id: input.providerAccountId,
        reconciliation_state: "observed",
        data_quality_state: "observed",
        affiliate_id: text(row.attribution.affiliate),
        sub1: text(row.attribution.subaffiliate1),
        sub2: text(row.attribution.subaffiliate2),
        sub3: text(row.attribution.subaffiliate3),
        sub4: text(row.attribution.subaffiliate4),
        sub5: text(row.attribution.subaffiliate5),
      });
    },
    async upsertProducts(input) { await upsertProducts(context, input.evidenceId, input.expansion); },
    async upsertOrderLines(input) { await upsertOrderLines(context, input.canonicalOrderId, input.evidenceId, input.expansion); },
    async upsertCustomerIdentity(input) { await upsertCustomer(context, input.evidenceId, input.expansion); },
    async upsertTransactions(input) { await upsertTransactions(context, input.canonicalOrderId, input.expansion); },
    async upsertRefunds(input) { await upsertRefunds(context, input.canonicalOrderId, input.evidenceId, input.expansion); },
  });

  const subscriptions = createNext29SubscriptionPersistence({
    ...runClient.subscriptions,
    ...evidence.subscriptions,
    ...mappings.subscriptions,
    async upsertSubscription(input) {
      await upsertComposite("commerce_subscriptions", "connection_id,provider_account_id,provider_subscription_id", next29SubscriptionRow({
        accountId: context.accountId,
        organizationId: input.organizationId,
        connectionId: input.connectionId,
        providerAccountId: input.providerAccountId,
        normalized: input.normalized,
        canonicalSubscriptionId: input.canonicalSubscriptionId,
        sourceMappingId: input.sourceMappingId,
        evidenceId: input.evidenceId,
      }));
    },
    async replaceSubscriptionLines(input) {
      const rows = next29SubscriptionLineRows(input);
      for (const row of rows) await upsertComposite("commerce_subscription_lines", "subscription_id,provider_line_id", row);
    },
    async resolveCanonicalOrder(input) {
      const rows = await commercePersistenceRequest(`platform_orders?organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&provider_account_id=eq.${encodeURIComponent(input.providerAccountId)}&provider_order_id=eq.${encodeURIComponent(input.providerOrderId)}&select=canonical_order_id&limit=2`);
      return rows.length === 1 && rows[0].canonical_order_id ? { canonicalOrderId: String(rows[0].canonical_order_id) } : null;
    },
    async upsertSubscriptionOrderLink(input) {
      await upsertComposite("commerce_subscription_order_links", "subscription_id,provider_order_id", next29SubscriptionOrderLinkRow(input));
    },
  });

  const disputes = createNext29DisputePersistence({
    ...runClient.disputes,
    ...evidence.disputes,
    async ensureDisputeObservation(input) {
      const existing = await commercePersistenceRequest(`commerce_provider_dispute_observations?connection_id=eq.${encodeURIComponent(input.connectionId)}&provider_account_id=eq.${encodeURIComponent(input.providerAccountId)}&provider=eq.next29&provider_dispute_id=eq.${encodeURIComponent(input.providerDisputeId)}&payload_hash=eq.${encodeURIComponent(input.payloadHash)}&select=id&limit=1`);
      if (existing[0]) return { observationId: String(existing[0].id) };
      const rows = await commercePersistenceRequest("commerce_provider_dispute_observations", { method: "POST", body: JSON.stringify({
        organization_id: input.organizationId, account_id: context.accountId, connection_id: input.connectionId, provider_account_id: input.providerAccountId,
        provider: "next29", provider_dispute_id: input.providerDisputeId, source_kind: "api", provider_event_id: null,
        evidence_id: input.evidenceId, payload_hash: input.payloadHash, observed_at: input.observedAt,
        source_created_at: input.sourceCreatedAt, source_updated_at: input.sourceUpdatedAt, metadata: { provider: "next29", m12_live_validation: true },
      }) });
      return { observationId: String(rows[0].id) };
    },
    async resolveCanonicalOrder(input) {
      if (input.providerTransactionId) {
        const tx = await commercePersistenceRequest(`payment_transactions?platform=eq.next29&transaction_id=eq.${encodeURIComponent(input.providerTransactionId)}&select=order_id&limit=2`);
        if (tx.length === 1 && tx[0].order_id) {
          const matched = await canonicalOrderByProviderId(context, String(tx[0].order_id));
          if (matched) return { canonicalOrderId: matched, state: "matched" as const, matchedBy: "transaction" as const };
        }
      }
      if (input.providerOrderId) {
        const matched = await canonicalOrderByProviderId(context, input.providerOrderId);
        if (matched) return { canonicalOrderId: matched, state: "matched" as const, matchedBy: "order" as const };
      }
      return { canonicalOrderId: null, state: "unmatched" as const, matchedBy: null };
    },
    async upsertProviderDispute(input) {
      const query = `commerce_provider_disputes?connection_id=eq.${encodeURIComponent(input.connectionId)}&provider_account_id=eq.${encodeURIComponent(input.providerAccountId)}&provider_dispute_id=eq.${encodeURIComponent(input.normalized.providerDisputeId)}&select=id,status,state,reason_code,amount,currency&limit=1`;
      const existing = await commercePersistenceRequest(query);
      const prior = existing[0];
      const lifecycleChanged = !prior || String(prior.status ?? "") !== input.normalized.status || String(prior.state ?? "") !== input.normalized.type || String(prior.reason_code ?? "") !== String(input.normalized.resolution ?? "") || Number(prior.amount ?? 0) !== Number(input.normalized.amount ?? 0) || String(prior.currency ?? "") !== String(input.normalized.currency ?? "");
      const body = {
        organization_id: input.organizationId, account_id: context.accountId, connection_id: input.connectionId, provider_account_id: input.providerAccountId,
        provider_dispute_id: input.normalized.providerDisputeId, latest_observation_id: input.observationId, latest_evidence_id: input.evidenceId,
        provider_transaction_id: input.normalized.providerTransactionId, order_id: input.normalized.providerOrderId,
        amount: input.normalized.amount, currency: input.normalized.currency, status: input.normalized.status, state: input.normalized.type,
        reason: input.normalized.resolutionOtherMessage, reason_code: input.normalized.resolution,
        opened_at: input.normalized.happenedAt, closed_at: input.normalized.status === "resolved" ? input.normalized.happenedAt : null,
        reconciliation_state: input.reconciliationState, matched_canonical_order_id: input.canonicalOrderId,
      };
      let disputeId: string;
      if (prior?.id) {
        const rows = await commercePersistenceRequest(`commerce_provider_disputes?id=eq.${encodeURIComponent(String(prior.id))}`, { method: "PATCH", body: JSON.stringify(body) });
        disputeId = String(rows[0].id);
      } else {
        const rows = await commercePersistenceRequest("commerce_provider_disputes", { method: "POST", body: JSON.stringify(body) });
        disputeId = String(rows[0].id);
      }
      return { disputeId, lifecycleChanged };
    },
    async appendDisputeLifecycle(input) {
      const existing = await commercePersistenceRequest(`commerce_provider_dispute_lifecycle_events?observation_id=eq.${encodeURIComponent(input.observationId)}&select=id&limit=1`);
      if (existing.length) return;
      await commercePersistenceRequest("commerce_provider_dispute_lifecycle_events", { method: "POST", body: JSON.stringify({
        organization_id: input.organizationId, connection_id: input.connectionId, provider_account_id: input.providerAccountId,
        dispute_id: input.disputeId, webhook_event_id: null, observation_id: input.observationId, event_type: "dispute.updated",
        status: input.normalized.status, state: input.normalized.type, reason: input.normalized.resolutionOtherMessage,
        reason_code: input.normalized.resolution, observed_at: input.normalized.happenedAt || input.normalized.sourceCreatedAt || new Date().toISOString(),
        metadata: { provider: "next29", lifecycle_fingerprint: input.fingerprint, source: "api" },
      }) });
    },
  });

  return { orders, subscriptions, disputes };
}

function createRunClient(context: ValidationContext) {
  const methods = (resource: "orders" | "subscriptions" | "disputes") => ({
    async createHistoricalRun(input: Scope) { return createRun(context, input, resource); },
    async createSubscriptionRun(input: Scope) { return createRun(context, input, resource); },
    async appendHistoricalCheckpoint(input: any) { await checkpoint(input, resource); },
    async appendSubscriptionCheckpoint(input: any) { await checkpoint(input, resource); },
    async finishHistoricalRun(input: any) { await finishRun(input, false); },
    async finishSubscriptionRun(input: any) { await finishRun(input, false); },
    async failHistoricalRun(input: any) { await finishRun(input, true); },
    async failSubscriptionRun(input: any) { await finishRun(input, true); },
  });
  return { orders: methods("orders"), subscriptions: methods("subscriptions"), disputes: methods("disputes") };
}

function createEvidenceClient(_context: ValidationContext) {
  const ensure = (sourceObjectType: string, normalizerVersion: string, mappingVersion: string) => async (input: any) => {
    const query = `commerce_evidence_records?connection_id=eq.${encodeURIComponent(input.connectionId)}&provider_account_id=eq.${encodeURIComponent(input.providerAccountId)}&source_object_type=eq.${encodeURIComponent(sourceObjectType)}&source_object_id=eq.${encodeURIComponent(input.sourceObjectId)}&payload_hash=eq.${encodeURIComponent(input.payloadHash)}&select=id&limit=1`;
    const existing = await commercePersistenceRequest(query);
    if (existing[0]) return { evidenceId: String(existing[0].id) };
    const rows = await commercePersistenceRequest("commerce_evidence_records", { method: "POST", body: JSON.stringify({
      organization_id: input.organizationId, connection_id: input.connectionId, provider_account_id: input.providerAccountId, sync_run_id: input.syncRunId,
      source_object_type: sourceObjectType, source_object_id: input.sourceObjectId, payload_hash: input.payloadHash,
      storage_backend: "object_storage", storage_reference: input.storageReference, content_type: "application/json", byte_size: input.byteSize,
      source_updated_at: input.sourceUpdatedAt || null, observed_at: new Date().toISOString(), normalizer_version: normalizerVersion,
      mapping_version: mappingVersion, pii_classification: "sensitive", retention_policy: "commerce_evidence_default",
      metadata: { provider: "next29", m12_live_validation: true },
    }) });
    return { evidenceId: String(rows[0].id) };
  };
  return {
    orders: { ensureOrderEvidence: ensure("next29_order", "next29-order-v1", "next29-order-v1") },
    subscriptions: { ensureSubscriptionEvidence: ensure("next29_subscription", "next29-subscription-v1", "next29-subscription-v1") },
    disputes: { ensureDisputeEvidence: ensure("next29_dispute", "next29-dispute-v1", "next29-dispute-v1") },
  };
}

function createMappingClient(_context: ValidationContext) {
  const ensure = (sourceObjectType: string, canonicalObjectType: string) => async (input: any) => {
    const query = `commerce_source_mappings?connection_id=eq.${encodeURIComponent(input.connectionId)}&provider_account_id=eq.${encodeURIComponent(input.providerAccountId)}&source_object_type=eq.${encodeURIComponent(sourceObjectType)}&source_object_id=eq.${encodeURIComponent(input.sourceObjectId)}&select=id,canonical_object_id&limit=1`;
    const existing = await commercePersistenceRequest(query);
    if (existing[0]) {
      await commercePersistenceRequest(`commerce_source_mappings?id=eq.${encodeURIComponent(String(existing[0].id))}`, { method: "PATCH", body: JSON.stringify({ last_seen_at: new Date().toISOString(), source_updated_at: input.sourceUpdatedAt || null, payload_hash: input.payloadHash, mapping_version: input.mappingVersion }) });
      return { id: String(existing[0].id), canonicalObjectId: String(existing[0].canonical_object_id) };
    }
    const canonicalObjectId = randomUUID();
    const now = new Date().toISOString();
    const rows = await commercePersistenceRequest("commerce_source_mappings", { method: "POST", body: JSON.stringify({
      organization_id: input.organizationId, connection_id: input.connectionId, provider_account_id: input.providerAccountId,
      source_object_type: sourceObjectType, source_object_id: input.sourceObjectId, canonical_object_type: canonicalObjectType,
      canonical_object_id: canonicalObjectId, first_seen_at: now, last_seen_at: now, source_updated_at: input.sourceUpdatedAt || null,
      payload_hash: input.payloadHash, mapping_version: input.mappingVersion, state: "active", metadata: { provider: "next29", m12_live_validation: true },
    }) });
    return { id: String(rows[0].id), canonicalObjectId };
  };
  return {
    orders: { ensureOrderSourceMapping: ensure("next29_order", "order") },
    subscriptions: { ensureSubscriptionSourceMapping: ensure("next29_subscription", "subscription") },
  };
}

async function createRun(context: ValidationContext, input: Scope, resource: string) {
  const rows = await commercePersistenceRequest("commerce_sync_runs", { method: "POST", body: JSON.stringify({
    organization_id: input.organizationId, connection_id: input.connectionId, provider_account_id: input.providerAccountId,
    sync_type: resource, mode: "historical_backfill", status: "running", started_at: new Date().toISOString(),
    metadata: { provider: "next29", m12_live_validation: true, validation_environment: context.environment, max_pages: 1, max_records: MAX_RECORDS },
  }) });
  return { id: String(rows[0].id) };
}

async function checkpoint(input: any, resource: string) {
  const page = Math.max(1, Number(input.checkpoint?.page || 1));
  const body = {
    sync_run_id: input.syncRunId, organization_id: input.organizationId, connection_id: input.connectionId, provider_account_id: input.providerAccountId,
    resource, page, per_page: MAX_RECORDS, state: "completed", completed_at: new Date().toISOString(),
    last_source_id: input.checkpoint?.lastSourceObjectId || null,
    metadata: { provider: "next29", next_cursor_present: Boolean(input.checkpoint?.next), records_seen: Number(input.recordsSeen || 0), m12_live_validation: true },
  };
  await upsertComposite("commerce_sync_checkpoints", "sync_run_id,resource,page,per_page", body);
}

async function finishRun(input: any, failed: boolean) {
  const body: Row = {
    status: failed ? "failed" : "completed",
    pages_completed: Number(input.pagesCompleted || input.checkpoint?.page || 0), records_seen: Number(input.recordsSeen || 0),
    completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  if (failed) {
    body.last_error_code = "next29_live_validation_failed";
    body.last_error_summary = safeError(input.error);
  } else {
    body.metadata = { provider: "next29", m12_live_validation: true, has_more: Boolean(input.hasMore) };
  }
  await commercePersistenceRequest(`commerce_sync_runs?id=eq.${encodeURIComponent(input.syncRunId)}&organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}`, { method: "PATCH", body: JSON.stringify(body) });
}

async function upsertProducts(context: ValidationContext, evidenceId: string, expansion: Next29CanonicalExpansion) {
  const now = new Date().toISOString();
  for (const product of expansion.products) {
    await upsertComposite("commerce_provider_products", "connection_id,provider_account_id,provider_product_id", {
      organization_id: context.organizationId, connection_id: context.connectionId, provider_account_id: context.providerAccountId,
      provider_product_id: product.providerProductId, title: product.title || `29Next product ${product.providerProductId}`,
      evidence_id: evidenceId, first_seen_at: now, last_seen_at: now, mapping_status: "observed",
      metadata: { provider: "next29", provider_variant_id: product.providerVariantId, sku: product.sku, unit_cost: product.unitCost },
    });
  }
}

async function upsertOrderLines(context: ValidationContext, canonicalOrderId: string, evidenceId: string, expansion: Next29CanonicalExpansion) {
  for (const line of expansion.lines) {
    if (line.quantity <= 0) continue;
    let providerProductUuid: string | null = null;
    if (line.providerProductId) {
      const products = await commercePersistenceRequest(`commerce_provider_products?connection_id=eq.${encodeURIComponent(context.connectionId)}&provider_account_id=eq.${encodeURIComponent(context.providerAccountId)}&provider_product_id=eq.${encodeURIComponent(line.providerProductId)}&select=id&limit=1`);
      providerProductUuid = products[0]?.id ? String(products[0].id) : null;
    }
    await upsertComposite("commerce_order_lines", "connection_id,provider_account_id,canonical_order_id,source_line_key", {
      account_id: context.accountId, organization_id: context.organizationId, connection_id: context.connectionId, provider_account_id: context.providerAccountId,
      canonical_order_id: canonicalOrderId, provider_product_id: providerProductUuid, evidence_id: evidenceId, source_line_key: line.sourceLineKey,
      quantity: line.quantity, unit_amount: line.unitAmount, gross_amount: line.grossAmount, currency: line.currency,
      metadata: { provider: "next29", provider_product_id: line.providerProductId, provider_variant_id: line.providerVariantId, sku: line.sku, title: line.title, is_upsell: line.isUpsell, unit_cost: line.unitCost },
    });
  }
}

async function upsertCustomer(context: ValidationContext, evidenceId: string, expansion: Next29CanonicalExpansion) {
  const customer = expansion.customer;
  if (!customer) return;
  const existing = await commercePersistenceRequest(`person_source_identities?organization_id=eq.${encodeURIComponent(context.organizationId)}&connection_id=eq.${encodeURIComponent(context.connectionId)}&provider_account_id=eq.${encodeURIComponent(context.providerAccountId)}&source_type=eq.provider_customer_id&source_id=eq.${encodeURIComponent(customer.providerCustomerId)}&select=person_id&limit=1`);
  let personId = existing[0]?.person_id ? String(existing[0].person_id) : null;
  const now = new Date().toISOString();
  if (!personId) {
    personId = randomUUID();
    await commercePersistenceRequest("people", { method: "POST", body: JSON.stringify({ id: personId, workspace_id: context.organizationId, organization_id: context.organizationId, status: "active", display_name: customer.displayName, primary_email: customer.email, primary_phone: customer.phone, first_seen_at: now, last_seen_at: now, metadata: { provider: "next29" } }) });
    await commercePersistenceRequest("person_source_identities", { method: "POST", body: JSON.stringify({ organization_id: context.organizationId, person_id: personId, connection_id: context.connectionId, provider_account_id: context.providerAccountId, source_type: "provider_customer_id", source_id: customer.providerCustomerId, confidence: 1, status: "observed", first_seen_at: now, last_seen_at: now, evidence_id: evidenceId, metadata: { provider: "next29" } }) });
  } else {
    await commercePersistenceRequest(`people?id=eq.${encodeURIComponent(personId)}&organization_id=eq.${encodeURIComponent(context.organizationId)}`, { method: "PATCH", body: JSON.stringify({ display_name: customer.displayName, primary_email: customer.email, primary_phone: customer.phone, last_seen_at: now, updated_at: now }) });
  }
}

async function upsertTransactions(context: ValidationContext, canonicalOrderId: string, expansion: Next29CanonicalExpansion) {
  const orderRows = await commercePersistenceRequest(`platform_orders?organization_id=eq.${encodeURIComponent(context.organizationId)}&canonical_order_id=eq.${encodeURIComponent(canonicalOrderId)}&select=order_id,platform_order_id&limit=1`);
  const providerOrderId = orderRows[0]?.order_id ? String(orderRows[0].order_id) : null;
  for (const tx of expansion.transactions) {
    const body = {
      platform: "next29", transaction_id: tx.providerTransactionId, event_type: tx.type || "transaction", account_id: context.accountId,
      parent_transaction_id: tx.parentTransactionId, order_id: providerOrderId, status: tx.status, amount: tx.amount, currency: tx.currency,
      payment_method: tx.paymentMethod, processor: tx.gatewayName, transaction_ts: tx.occurredAt,
      external_record_id: tx.externalId, transaction_event_code: tx.type, transaction_updated_at: tx.occurredAt,
      workspace_id: context.organizationId, matched_platform_order_id: orderRows[0]?.platform_order_id || null,
      raw_json: { provider: "next29", network_transaction_id: tx.networkTransactionId, auth_code_present: Boolean(tx.authCode), is_disputed: tx.isDisputed, is_external: tx.isExternal, is_test: tx.isTest },
    };
    const existing = await commercePersistenceRequest(`payment_transactions?platform=eq.next29&transaction_id=eq.${encodeURIComponent(tx.providerTransactionId)}&select=id&limit=1`);
    if (existing[0]?.id) await commercePersistenceRequest(`payment_transactions?id=eq.${encodeURIComponent(String(existing[0].id))}`, { method: "PATCH", body: JSON.stringify(body) });
    else await commercePersistenceRequest("payment_transactions", { method: "POST", body: JSON.stringify(body) });
  }
}

async function upsertRefunds(context: ValidationContext, canonicalOrderId: string, evidenceId: string, expansion: Next29CanonicalExpansion) {
  for (const refund of expansion.refunds) {
    await upsertComposite("commerce_refund_events", "connection_id,provider_account_id,provider_refund_id", {
      account_id: context.accountId, organization_id: context.organizationId, connection_id: context.connectionId, provider_account_id: context.providerAccountId,
      canonical_order_id: canonicalOrderId, evidence_id: evidenceId, source_mapping_id: null, provider_refund_id: refund.providerRefundId,
      provider_payment_id: refund.transactionIds[0] || null, amount: refund.amount, amount_gross: refund.amount, occurred_at: refund.occurredAt,
      currency: refund.currency,
    });
  }
}

async function canonicalOrderByProviderId(context: ValidationContext, providerOrderId: string) {
  const rows = await commercePersistenceRequest(`platform_orders?organization_id=eq.${encodeURIComponent(context.organizationId)}&connection_id=eq.${encodeURIComponent(context.connectionId)}&provider_account_id=eq.${encodeURIComponent(context.providerAccountId)}&provider_order_id=eq.${encodeURIComponent(providerOrderId)}&select=canonical_order_id&limit=2`);
  return rows.length === 1 && rows[0].canonical_order_id ? String(rows[0].canonical_order_id) : null;
}

async function upsert(table: string, conflictColumn: string, body: Row) {
  return upsertComposite(table, conflictColumn, body);
}

async function upsertComposite(table: string, conflictColumns: string, body: Row) {
  return commercePersistenceRequest(`${table}?on_conflict=${encodeURIComponent(conflictColumns)}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(body),
  });
}

function text(value: unknown) { const result = String(value ?? "").trim(); return result || null; }
function safeError(value: unknown) { return String(value ?? "29Next live validation failed").replace(/Bearer\s+[^\s]+/gi, "Bearer <redacted>").slice(0, 400); }
