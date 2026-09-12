import "server-only";

import { randomUUID } from "node:crypto";
import { Next29Client } from "../../../api/src/connectors/next29/client.ts";
import { next29OrderEvidence, persistNext29Evidence } from "../../../api/src/connectors/next29/evidence.ts";
import { expandNext29Order, type Next29CanonicalExpansion } from "../../../api/src/connectors/next29/expansion.ts";
import { normalizeNext29Order } from "../../../api/src/connectors/next29/normalize.ts";
import { createNext29HistoricalPersistence, next29PlatformOrderRow } from "../../../api/src/connectors/next29/repository.ts";
import { createNext29WebhookIdempotency, next29WebhookReceiptInsert } from "../../../api/src/connectors/next29/webhook-repository.ts";
import { handleNext29Webhook, parseNext29Webhook, verifyNext29WebhookSignature } from "../../../api/src/connectors/next29/webhook.ts";
import type { Next29EvidenceSink } from "../../../api/src/connectors/next29/types.ts";
import { decryptCommerceCredential, decodeCommerceCredentialKey } from "./credential-crypto";
import { parseNext29ConnectionCredential } from "./next29-verifier";
import { SupabaseCommerceControlRepository, commercePersistenceRequest } from "./supabase-control-repository";
import { SupabaseCommerceEvidenceStore } from "./supabase-evidence-store";

const CANARY_ENVIRONMENTS = new Set(["preview", "staging"]);
const MAX_BODY_BYTES = 256_000;
type Row = Record<string, unknown>;
type Scope = { organizationId: string; connectionId: string; providerAccountId: string };

type CanaryContext = Scope & {
  accountId: string;
  client: Next29Client;
  evidenceSink: Next29EvidenceSink;
};

export type Next29WebhookCanaryResult = {
  accepted: true;
  duplicate: boolean;
  eventId: string;
  orderNumber: string | null;
};

export async function runNext29WebhookCanary(input: {
  connectionId: string;
  rawBody: Uint8Array;
  signature: string | null;
  signingSecret: string;
}): Promise<Next29WebhookCanaryResult> {
  assertCanaryEnvironment();
  if (input.rawBody.byteLength < 1 || input.rawBody.byteLength > MAX_BODY_BYTES) throw new Error("29Next webhook payload size is outside the canary limit.");
  if (!(await verifyNext29WebhookSignature({ rawBody: input.rawBody, signature: input.signature, signingSecret: input.signingSecret }))) {
    throw new Error("29Next webhook signature verification failed.");
  }

  const envelope = parseNext29Webhook(input.rawBody);
  if (envelope.event_type !== "order.created" || envelope.object !== "order") {
    throw new Error("29Next M13 canary accepts only order.created events.");
  }

  const context = await resolveContext(input.connectionId);
  await assertExecutionDisabled(context.connectionId);
  const persistence = createOrderPersistence(context);
  let orderNumber: string | null = null;

  const result = await handleNext29Webhook({
    organizationId: context.organizationId,
    connectionId: context.connectionId,
    providerAccountId: context.providerAccountId,
    rawBody: input.rawBody,
    signature: input.signature,
    signingSecret: input.signingSecret,
    evidenceSink: context.evidenceSink,
    idempotency: createReceiptStore(),
    handlers: {
      order: async (event) => {
        const number = requiredOrderNumber(event.data.number);
        orderNumber = number;
        const detail = await context.client.getOrder(number, { correlationId: `m13-${event.eventId}` });
        const normalized = normalizeNext29Order(detail.item);
        if (normalized.sourceObjectId !== number) throw new Error("29Next webhook order refresh identity mismatch.");

        const orderEvidence = await persistNext29Evidence(
          context.evidenceSink,
          context,
          next29OrderEvidence({ apiVersion: context.client.apiVersion, orderNumber: number, payload: detail.item }),
        );
        const checkpoint = { page: 1, next: null, lastSourceObjectId: number };
        const run = await persistence.beginRun({ ...context, resource: "orders", checkpoint });
        try {
          await persistence.persistOrder({ ...context, syncRunId: run.syncRunId, normalized, evidence: orderEvidence, rawOrder: detail.item });
          await persistence.appendCheckpoint({ ...context, syncRunId: run.syncRunId, checkpoint, recordsSeen: 1 });
          await persistence.completeRun({ ...context, syncRunId: run.syncRunId, checkpoint, pagesCompleted: 1, recordsSeen: 1, hasMore: false });
        } catch (error) {
          try {
            await persistence.failRun({ ...context, syncRunId: run.syncRunId, checkpoint, pagesCompleted: 0, recordsSeen: 0, error: safeError(error) });
          } catch (failureError) {
            console.warn("next29_m13_canary_failure_recording_failed", { eventId: event.eventId, error: safeError(failureError) });
          }
          throw error;
        }
      },
    },
  });

  return { accepted: true, duplicate: result.duplicate, eventId: result.eventId, orderNumber };
}

function assertCanaryEnvironment() {
  const configured = String(process.env.TRACEKIT_NEXT29_WEBHOOK_CANARY_ENV || "").trim().toLowerCase();
  const vercelEnvironment = String(process.env.VERCEL_ENV || "").trim().toLowerCase();
  if (!CANARY_ENVIRONMENTS.has(configured) || vercelEnvironment === "production") {
    throw new Error("29Next webhook canary is unavailable in this environment.");
  }
}

async function resolveContext(connectionId: string): Promise<CanaryContext> {
  if (!/^[0-9a-f-]{36}$/i.test(connectionId)) throw new Error("29Next webhook canary connection is unavailable.");
  const repository = new SupabaseCommerceControlRepository();
  const connection = await repository.connectionById(connectionId);
  if (!connection || connection.provider !== "next29" || connection.status === "disabled" || connection.status === "revoked") {
    throw new Error("29Next webhook canary connection is unavailable.");
  }
  const accounts = (await repository.listProviderAccounts(connection.id, connection.organizationId)).filter((row) => row.status === "active" && !row.provisional);
  if (accounts.length !== 1) throw new Error("29Next webhook canary requires exactly one active provider account.");

  const stored = await repository.activeCredential(connection.id, connection.organizationId);
  if (!stored?.encrypted || stored.revokedAt) throw new Error("29Next webhook canary credential is unavailable.");
  const keyId = String(process.env.COMMERCE_CREDENTIALS_KEY_ID || "");
  if (!keyId || stored.encrypted.keyId !== keyId) throw new Error("29Next webhook canary credential key is unavailable.");
  const secret = await decryptCommerceCredential(stored.encrypted, decodeCommerceCredentialKey(process.env.COMMERCE_CREDENTIALS_ENC_KEY));
  const credential = parseNext29ConnectionCredential(secret);
  const client = new Next29Client({ store: credential.store, accessToken: credential.accessToken, apiVersion: credential.apiVersion });

  const evidenceStore = new SupabaseCommerceEvidenceStore();
  const evidenceSink: Next29EvidenceSink = {
    async putImmutable(item) {
      const storedEvidence = await evidenceStore.putImmutable({
        organizationId: item.organizationId,
        connectionId: item.connectionId,
        providerAccountId: item.providerAccountId,
        sourceObjectType: item.sourceObjectType,
        payload: item.payload,
        contentType: item.contentType,
      });
      return { storageReference: storedEvidence.storageReference, payloadHash: storedEvidence.payloadHash, byteSize: storedEvidence.byteSize };
    },
  };
  return {
    accountId: connection.accountId,
    organizationId: connection.organizationId,
    connectionId: connection.id,
    providerAccountId: accounts[0].id,
    client,
    evidenceSink,
  };
}

async function assertExecutionDisabled(connectionId: string) {
  const encoded = encodeURIComponent(connectionId);
  const schedules = await commercePersistenceRequest(`commerce_sync_schedules?connection_id=eq.${encoded}&enabled=eq.true&select=id&limit=1`).catch(() => []);
  if (schedules.length) throw new Error("29Next M13 canary requires schedules to remain disabled.");
  const runs = await commercePersistenceRequest(`commerce_sync_runs?connection_id=eq.${encoded}&status=in.(queued,running)&select=id&limit=1`);
  if (runs.length) throw new Error("29Next M13 canary will not run while another commerce sync is active.");
}

function createReceiptStore() {
  return createNext29WebhookIdempotency({
    async reserveReceipt(input) {
      const existing = await commercePersistenceRequest(`commerce_webhook_receipts?connection_id=eq.${encodeURIComponent(input.connectionId)}&provider_account_id=eq.${encodeURIComponent(input.providerAccountId)}&provider=eq.next29&provider_event_id=eq.${encodeURIComponent(input.providerEventId)}&select=id,status,delivery_count&limit=1`);
      if (existing[0]) {
        await commercePersistenceRequest(`commerce_webhook_receipts?id=eq.${encodeURIComponent(String(existing[0].id))}`, { method: "PATCH", body: JSON.stringify({ delivery_count: Number(existing[0].delivery_count || 1) + 1, updated_at: new Date().toISOString() }) });
        return { accepted: false };
      }
      const row = next29WebhookReceiptInsert({
        organizationId: input.organizationId,
        connectionId: input.connectionId,
        providerAccountId: input.providerAccountId,
        eventId: input.providerEventId,
        eventType: input.eventType,
        apiVersion: input.apiVersion,
      });
      await commercePersistenceRequest("commerce_webhook_receipts", { method: "POST", body: JSON.stringify(row) });
      return { accepted: true };
    },
    async completeReceipt(input) {
      await commercePersistenceRequest(`commerce_webhook_receipts?connection_id=eq.${encodeURIComponent(input.connectionId)}&provider_account_id=eq.${encodeURIComponent(input.providerAccountId)}&provider=eq.next29&provider_event_id=eq.${encodeURIComponent(input.providerEventId)}`, { method: "PATCH", body: JSON.stringify({ status: "completed", last_error_summary: null, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
    },
    async failReceipt(input) {
      await commercePersistenceRequest(`commerce_webhook_receipts?connection_id=eq.${encodeURIComponent(input.connectionId)}&provider_account_id=eq.${encodeURIComponent(input.providerAccountId)}&provider=eq.next29&provider_event_id=eq.${encodeURIComponent(input.providerEventId)}`, { method: "PATCH", body: JSON.stringify({ status: "failed", last_error_summary: safeError(input.error), updated_at: new Date().toISOString() }) });
    },
  });
}

function createOrderPersistence(context: CanaryContext) {
  const client = {
    async createHistoricalRun(input: Scope) {
      const rows = await commercePersistenceRequest("commerce_sync_runs", { method: "POST", body: JSON.stringify({
        organization_id: input.organizationId,
        connection_id: input.connectionId,
        provider_account_id: input.providerAccountId,
        sync_type: "orders",
        mode: "webhook_canary",
        status: "running",
        started_at: new Date().toISOString(),
        metadata: { provider: "next29", m13_webhook_canary: true, max_records: 1 },
      }) });
      return { id: String(rows[0].id) };
    },
    async appendHistoricalCheckpoint(input: any) {
      await upsertComposite("commerce_sync_checkpoints", "sync_run_id,resource,page,per_page", {
        sync_run_id: input.syncRunId,
        organization_id: input.organizationId,
        connection_id: input.connectionId,
        provider_account_id: input.providerAccountId,
        resource: "orders",
        page: 1,
        per_page: 1,
        state: "completed",
        completed_at: new Date().toISOString(),
        last_source_id: input.checkpoint?.lastSourceObjectId || null,
        metadata: { provider: "next29", m13_webhook_canary: true, records_seen: Number(input.recordsSeen || 0) },
      });
    },
    async finishHistoricalRun(input: any) { await finishRun(input, false); },
    async failHistoricalRun(input: any) { await finishRun(input, true); },
    async ensureOrderEvidence(input: any) {
      const existing = await commercePersistenceRequest(`commerce_evidence_records?connection_id=eq.${encodeURIComponent(input.connectionId)}&provider_account_id=eq.${encodeURIComponent(input.providerAccountId)}&source_object_type=eq.next29_order&source_object_id=eq.${encodeURIComponent(input.sourceObjectId)}&payload_hash=eq.${encodeURIComponent(input.payloadHash)}&select=id&limit=1`);
      if (existing[0]) return { evidenceId: String(existing[0].id) };
      const rows = await commercePersistenceRequest("commerce_evidence_records", { method: "POST", body: JSON.stringify({
        organization_id: input.organizationId,
        connection_id: input.connectionId,
        provider_account_id: input.providerAccountId,
        sync_run_id: input.syncRunId,
        source_object_type: "next29_order",
        source_object_id: input.sourceObjectId,
        payload_hash: input.payloadHash,
        storage_backend: "object_storage",
        storage_reference: input.storageReference,
        content_type: "application/json",
        byte_size: input.byteSize,
        source_updated_at: input.sourceUpdatedAt || null,
        observed_at: new Date().toISOString(),
        normalizer_version: "next29-order-v1",
        mapping_version: "next29-order-v1",
        pii_classification: "sensitive",
        retention_policy: "commerce_evidence_default",
        metadata: { provider: "next29", m13_webhook_canary: true },
      }) });
      return { evidenceId: String(rows[0].id) };
    },
    async ensureOrderSourceMapping(input: any) {
      const query = `commerce_source_mappings?connection_id=eq.${encodeURIComponent(input.connectionId)}&provider_account_id=eq.${encodeURIComponent(input.providerAccountId)}&source_object_type=eq.next29_order&source_object_id=eq.${encodeURIComponent(input.sourceObjectId)}&select=id,canonical_object_id&limit=1`;
      const existing = await commercePersistenceRequest(query);
      if (existing[0]) {
        await commercePersistenceRequest(`commerce_source_mappings?id=eq.${encodeURIComponent(String(existing[0].id))}`, { method: "PATCH", body: JSON.stringify({ last_seen_at: new Date().toISOString(), source_updated_at: input.sourceUpdatedAt || null, payload_hash: input.payloadHash, mapping_version: input.mappingVersion }) });
        return { id: String(existing[0].id), canonicalObjectId: String(existing[0].canonical_object_id) };
      }
      const canonicalObjectId = randomUUID();
      const now = new Date().toISOString();
      const rows = await commercePersistenceRequest("commerce_source_mappings", { method: "POST", body: JSON.stringify({
        organization_id: input.organizationId,
        connection_id: input.connectionId,
        provider_account_id: input.providerAccountId,
        source_object_type: "next29_order",
        source_object_id: input.sourceObjectId,
        canonical_object_type: "order",
        canonical_object_id: canonicalObjectId,
        first_seen_at: now,
        last_seen_at: now,
        source_updated_at: input.sourceUpdatedAt || null,
        payload_hash: input.payloadHash,
        mapping_version: input.mappingVersion,
        state: "active",
        metadata: { provider: "next29", m13_webhook_canary: true },
      }) });
      return { id: String(rows[0].id), canonicalObjectId };
    },
    async upsertPlatformOrder(input: any) {
      await upsertComposite("platform_orders", "platform_order_id", next29PlatformOrderRow({ ...input, accountId: context.accountId }));
    },
    async upsertProducts(input: any) { await upsertProducts(context, input.evidenceId, input.expansion); },
    async upsertOrderLines(input: any) { await upsertOrderLines(context, input.canonicalOrderId, input.evidenceId, input.expansion); },
    async upsertCustomerIdentity(input: any) { await upsertCustomer(context, input.evidenceId, input.expansion); },
    async upsertTransactions(input: any) { await upsertTransactions(context, input.canonicalOrderId, input.expansion); },
    async upsertRefunds(input: any) { await upsertRefunds(context, input.canonicalOrderId, input.evidenceId, input.expansion); },
  };
  return createNext29HistoricalPersistence(client);
}

async function finishRun(input: any, failed: boolean) {
  const body: Row = {
    status: failed ? "failed" : "completed",
    pages_completed: failed ? 0 : 1,
    records_seen: failed ? 0 : 1,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: { provider: "next29", m13_webhook_canary: true },
  };
  if (failed) {
    body.last_error_code = "next29_m13_webhook_canary_failed";
    body.last_error_summary = safeError(input.error);
  }
  await commercePersistenceRequest(`commerce_sync_runs?id=eq.${encodeURIComponent(input.syncRunId)}&organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}`, { method: "PATCH", body: JSON.stringify(body) });
}

async function upsertProducts(context: CanaryContext, evidenceId: string, expansion: Next29CanonicalExpansion) {
  const now = new Date().toISOString();
  for (const product of expansion.products) await upsertComposite("commerce_provider_products", "connection_id,provider_account_id,provider_product_id", {
    organization_id: context.organizationId, connection_id: context.connectionId, provider_account_id: context.providerAccountId,
    provider_product_id: product.providerProductId, title: product.title || `29Next product ${product.providerProductId}`,
    evidence_id: evidenceId, first_seen_at: now, last_seen_at: now, mapping_status: "observed",
    metadata: { provider: "next29", provider_variant_id: product.providerVariantId, sku: product.sku, unit_cost: product.unitCost },
  });
}

async function upsertOrderLines(context: CanaryContext, canonicalOrderId: string, evidenceId: string, expansion: Next29CanonicalExpansion) {
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

async function upsertCustomer(context: CanaryContext, evidenceId: string, expansion: Next29CanonicalExpansion) {
  const customer = expansion.customer;
  if (!customer) return;
  const existing = await commercePersistenceRequest(`person_source_identities?organization_id=eq.${encodeURIComponent(context.organizationId)}&connection_id=eq.${encodeURIComponent(context.connectionId)}&provider_account_id=eq.${encodeURIComponent(context.providerAccountId)}&source_type=eq.provider_customer_id&source_id=eq.${encodeURIComponent(customer.providerCustomerId)}&select=person_id&limit=1`);
  const now = new Date().toISOString();
  let personId = existing[0]?.person_id ? String(existing[0].person_id) : null;
  if (!personId) {
    personId = randomUUID();
    await commercePersistenceRequest("people", { method: "POST", body: JSON.stringify({ id: personId, workspace_id: context.organizationId, organization_id: context.organizationId, status: "active", display_name: customer.displayName, primary_email: customer.email, primary_phone: customer.phone, first_seen_at: now, last_seen_at: now, metadata: { provider: "next29" } }) });
    await commercePersistenceRequest("person_source_identities", { method: "POST", body: JSON.stringify({ organization_id: context.organizationId, person_id: personId, connection_id: context.connectionId, provider_account_id: context.providerAccountId, source_type: "provider_customer_id", source_id: customer.providerCustomerId, confidence: 1, status: "observed", first_seen_at: now, last_seen_at: now, evidence_id: evidenceId, metadata: { provider: "next29" } }) });
  } else {
    await commercePersistenceRequest(`people?id=eq.${encodeURIComponent(personId)}&organization_id=eq.${encodeURIComponent(context.organizationId)}`, { method: "PATCH", body: JSON.stringify({ display_name: customer.displayName, primary_email: customer.email, primary_phone: customer.phone, last_seen_at: now, updated_at: now }) });
  }
}

async function upsertTransactions(context: CanaryContext, canonicalOrderId: string, expansion: Next29CanonicalExpansion) {
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

async function upsertRefunds(context: CanaryContext, canonicalOrderId: string, evidenceId: string, expansion: Next29CanonicalExpansion) {
  for (const refund of expansion.refunds) await upsertComposite("commerce_refund_events", "connection_id,provider_account_id,provider_refund_id", {
    account_id: context.accountId, organization_id: context.organizationId, connection_id: context.connectionId, provider_account_id: context.providerAccountId,
    canonical_order_id: canonicalOrderId, evidence_id: evidenceId, source_mapping_id: null, provider_refund_id: refund.providerRefundId,
    provider_payment_id: refund.transactionIds[0] || null, amount: refund.amount, amount_gross: refund.amount, occurred_at: refund.occurredAt, currency: refund.currency,
  });
}

async function upsertComposite(table: string, conflictColumns: string, body: Row) {
  return commercePersistenceRequest(`${table}?on_conflict=${encodeURIComponent(conflictColumns)}`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(body) });
}

function requiredOrderNumber(value: unknown) {
  const number = String(value ?? "").trim();
  if (!number || number.length > 200) throw new Error("29Next order.created webhook is missing order number.");
  return number;
}

function safeError(value: unknown) {
  return String(value instanceof Error ? value.message : value ?? "29Next M13 webhook canary failed").replace(/Bearer\s+[^\s]+/gi, "Bearer <redacted>").slice(0, 500);
}
