import { createShopifyEvidenceStore, type ShopifyEvidence } from "./evidence";
import { normalizeShopifyCustomerRecord, normalizeShopifyOrderRecord, normalizeShopifyProductRecord } from "./normalize";
import { deterministicUuid, shopifyOrderLines, shopifyRefunds } from "./order-details";
import type { ShopifyPersistedRecord } from "./persistence";
import type { ShopifySyncPage } from "./resources";

type Scope = { organizationId: string; connectionId: string; providerAccountId: string };
type WriterConfig = { url: string; serviceRoleKey: string; fetchImpl?: typeof fetch };
type ConnectionContext = Scope & { accountId: string; shopDomain: string };
type EvidenceMap = Map<string, ShopifyEvidence>;
type SourceMapping = { id: string; canonicalObjectId: string };

export function createShopifyNormalizedWriter(config: WriterConfig) {
  const request = createPostgrestRequest(config);
  const ensureEvidence = createShopifyEvidenceStore(config);

  return async function writeShopifyRecords(
    records: ShopifyPersistedRecord[],
    provenance: { syncRunId: string; page: ShopifySyncPage },
  ): Promise<void> {
    if (!records.length) return;
    const scope = commonScope(records);
    const context = await loadShopifyContext(request, scope);
    const evidence: EvidenceMap = new Map();
    for (const record of records) evidence.set(recordKey(record), await ensureEvidence(record, provenance.syncRunId));

    const byResource = new Map<string, ShopifyPersistedRecord[]>();
    for (const record of records) {
      const list = byResource.get(record.resource) || [];
      list.push(record);
      byResource.set(record.resource, list);
    }

    if (byResource.has("orders")) await writeOrders(request, context, byResource.get("orders")!, evidence);
    if (byResource.has("products")) await writeProducts(request, context, byResource.get("products")!, evidence);
    if (byResource.has("customers")) await writeCustomers(request, context, byResource.get("customers")!, evidence);
  };
}

async function loadShopifyContext(request: PostgrestRequest, scope: Scope): Promise<ConnectionContext> {
  const connectionRows = await request<Array<{ account_id: string; provider: string; external_account_id?: string | null }>>(
    `commerce_provider_connections?organization_id=eq.${q(scope.organizationId)}&id=eq.${q(scope.connectionId)}&select=account_id,provider,external_account_id&limit=1`,
  );
  const connection = connectionRows[0];
  if (!connection || connection.provider !== "shopify") throw new Error("Shopify normalized persistence requires a scoped Shopify connection.");

  const accountRows = await request<Array<{ provider_account_external_id: string }>>(
    `commerce_provider_accounts?organization_id=eq.${q(scope.organizationId)}&connection_id=eq.${q(scope.connectionId)}&id=eq.${q(scope.providerAccountId)}&select=provider_account_external_id&limit=1`,
  );
  const providerAccount = accountRows[0];
  if (!providerAccount) throw new Error("Shopify provider account is unavailable for the requested tenant scope.");

  const shopDomain = normalizeShopDomain(providerAccount.provider_account_external_id || connection.external_account_id || "");
  if (!shopDomain) throw new Error("Shopify provider account does not contain a valid shop domain.");
  return { ...scope, accountId: connection.account_id, shopDomain };
}

async function writeOrders(request: PostgrestRequest, context: ConnectionContext, records: ShopifyPersistedRecord[], evidence: EvidenceMap) {
  for (const record of records) {
    const order = normalizeShopifyOrderRecord(record, context.shopDomain);
    const proof = requiredEvidence(evidence, record);
    const mapping = await ensureSourceMapping(request, context, {
      sourceObjectType: "order",
      sourceObjectId: record.providerObjectId,
      canonicalObjectType: "order",
      payloadHash: proof.payloadHash,
      observedAt: record.providerUpdatedAt || order.order_ts,
      mappingVersion: "shopify-order-v1",
    });

    await request("platform_orders?on_conflict=platform_order_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        platform: "shopify",
        platform_order_id: order.platform_order_id,
        platform_store_id: order.platform_store_id,
        provider_order_id: order.provider_order_id,
        order_id: order.order_id,
        order_ts: order.order_ts,
        status: order.status,
        status_norm: order.status_norm,
        currency: order.currency,
        gross_amount: order.gross_amount,
        product_subtotal: order.product_subtotal,
        shipping_amount: order.shipping_amount,
        tax_amount: order.tax_amount,
        email: order.email,
        phone: order.phone,
        transaction_id: order.transaction_id,
        raw: order.raw_json,
        raw_json: order.raw_json,
        workspace_id: context.organizationId,
        canonical_order_id: mapping.canonicalObjectId,
        source_mapping_id: mapping.id,
        evidence_id: proof.id,
        account_id: context.accountId,
        organization_id: context.organizationId,
        connection_id: context.connectionId,
        provider_account_id: context.providerAccountId,
        reconciliation_state: "observed",
        data_quality_state: "observed",
        updated_at: new Date().toISOString(),
      }),
    });

    await writeOrderLines(request, context, record, proof, mapping.canonicalObjectId, order.currency);
    await writeRefunds(request, context, record, proof, mapping.canonicalObjectId, order.currency, order.order_id);
  }
}

async function writeOrderLines(
  request: PostgrestRequest,
  context: ConnectionContext,
  record: ShopifyPersistedRecord,
  proof: ShopifyEvidence,
  canonicalOrderId: string,
  currency: string | null,
) {
  const lines = shopifyOrderLines(record.payload as Record<string, any>, currency);
  if (!lines.length) return;
  const rows: Record<string, unknown>[] = [];
  for (const line of lines) {
    let providerProductRowId: string | null = null;
    if (line.providerProductId) {
      const products = await request<Array<{ id: string }>>(
        `commerce_provider_products?organization_id=eq.${q(context.organizationId)}&connection_id=eq.${q(context.connectionId)}&provider_account_id=eq.${q(context.providerAccountId)}&provider_product_id=eq.${q(line.providerProductId)}&select=id&limit=1`,
      );
      providerProductRowId = products[0]?.id || null;
    }
    rows.push({
      id: await deterministicUuid(`shopify:line:${context.organizationId}:${context.connectionId}:${context.providerAccountId}:${canonicalOrderId}:${line.sourceLineKey}`),
      account_id: context.accountId,
      organization_id: context.organizationId,
      connection_id: context.connectionId,
      provider_account_id: context.providerAccountId,
      canonical_order_id: canonicalOrderId,
      provider_product_id: providerProductRowId,
      evidence_id: proof.id,
      source_line_key: line.sourceLineKey,
      quantity: line.quantity,
      unit_amount: line.unitAmount,
      gross_amount: line.grossAmount,
      currency: line.currency,
      metadata: {
        provider_product_id: line.providerProductId,
        provider_variant_id: line.providerVariantId,
        sku: line.sku,
        title: line.title,
      },
      updated_at: new Date().toISOString(),
    });
  }
  await request("commerce_order_lines?on_conflict=connection_id,provider_account_id,canonical_order_id,source_line_key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
}

async function writeRefunds(
  request: PostgrestRequest,
  context: ConnectionContext,
  record: ShopifyPersistedRecord,
  proof: ShopifyEvidence,
  canonicalOrderId: string,
  currency: string | null,
  orderId: string,
) {
  for (const refund of shopifyRefunds(record.payload as Record<string, any>, currency)) {
    const mapping = await ensureSourceMapping(request, context, {
      sourceObjectType: "refund",
      sourceObjectId: refund.providerRefundId,
      canonicalObjectType: "refund",
      payloadHash: proof.payloadHash,
      observedAt: refund.occurredAt,
      mappingVersion: "shopify-refund-v1",
    });
    await request("commerce_refund_events?on_conflict=connection_id,provider_account_id,provider_refund_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        id: mapping.canonicalObjectId,
        account_id: context.accountId,
        organization_id: context.organizationId,
        connection_id: context.connectionId,
        provider_account_id: context.providerAccountId,
        canonical_order_id: canonicalOrderId,
        evidence_id: proof.id,
        source_mapping_id: mapping.id,
        provider_refund_id: refund.providerRefundId,
        provider_payment_id: refund.providerPaymentId,
        amount: refund.amount,
        amount_gross: refund.amount,
        occurred_at: refund.occurredAt,
        currency: refund.currency,
        updated_at: new Date().toISOString(),
      }),
    });

    if (refund.amount !== null) {
      const idempotencyKey = `refund:${refund.providerRefundId}`;
      const existing = await request<Array<{ id: string }>>(
        `conversions?organization_id=eq.${q(context.organizationId)}&connection_id=eq.${q(context.connectionId)}&provider_account_id=eq.${q(context.providerAccountId)}&idempotency_key=eq.${q(idempotencyKey)}&select=id&limit=1`,
      );
      if (!existing[0]) {
        await request("conversions", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            id: await deterministicUuid(`shopify:refund-event:${context.organizationId}:${context.connectionId}:${context.providerAccountId}:${refund.providerRefundId}`),
            status: "observed",
            amount: -Math.abs(refund.amount),
            currency: refund.currency,
            ledger_type: "refund",
            platform: "shopify",
            workspace_id: context.organizationId,
            occurred_at: refund.occurredAt,
            event_source: "shopify",
            ingestion_method: "shadow_sync",
            connector_id: "shopify",
            account_id: context.accountId,
            organization_id: context.organizationId,
            connection_id: context.connectionId,
            provider_account_id: context.providerAccountId,
            source_mapping_id: mapping.id,
            evidence_id: proof.id,
            canonical_order_id: canonicalOrderId,
            idempotency_key: idempotencyKey,
            reconciliation_state: "observed",
            data_quality_state: "observed",
            transaction_id: refund.providerPaymentId,
            order_id: orderId,
          }),
        });
      }
    }
  }
}

async function writeProducts(request: PostgrestRequest, context: ConnectionContext, records: ShopifyPersistedRecord[], evidence: EvidenceMap) {
  const now = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  for (const record of records) {
    const product = normalizeShopifyProductRecord(record);
    const existing = await request<Array<{ first_seen_at?: string | null }>>(
      `commerce_provider_products?organization_id=eq.${q(context.organizationId)}&connection_id=eq.${q(context.connectionId)}&provider_account_id=eq.${q(context.providerAccountId)}&provider_product_id=eq.${q(product.provider_product_id)}&select=first_seen_at&limit=1`,
    );
    const seenAt = record.providerUpdatedAt || now;
    rows.push({
      organization_id: context.organizationId,
      connection_id: context.connectionId,
      provider_account_id: context.providerAccountId,
      provider_product_id: product.provider_product_id,
      title: product.title,
      description: product.description,
      evidence_id: requiredEvidence(evidence, record).id,
      first_seen_at: existing[0]?.first_seen_at || seenAt,
      last_seen_at: seenAt,
      mapping_status: "observed",
      mapping_version: "shopify-product-v1",
      metadata: { shopify_variants: product.variants },
      updated_at: now,
    });
  }
  await request("commerce_provider_products?on_conflict=connection_id,provider_account_id,provider_product_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
}

async function writeCustomers(request: PostgrestRequest, context: ConnectionContext, records: ShopifyPersistedRecord[], evidence: EvidenceMap) {
  for (const record of records) {
    const customer = normalizeShopifyCustomerRecord(record);
    const seenAt = customer.updated_at || new Date().toISOString();
    const existing = await request<Array<{ id: string; person_id: string; first_seen_at?: string | null }>>(
      `person_source_identities?organization_id=eq.${q(context.organizationId)}&connection_id=eq.${q(context.connectionId)}&provider_account_id=eq.${q(context.providerAccountId)}&source_type=eq.provider_customer_id&source_id=eq.${q(customer.provider_customer_id)}&select=id,person_id,first_seen_at&limit=1`,
    );
    const identity = existing[0] || null;
    const personId = identity?.person_id || crypto.randomUUID();
    const evidenceId = requiredEvidence(evidence, record).id;

    await request("people?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id: personId, workspace_id: context.organizationId, organization_id: context.organizationId, status: "active", display_name: customer.display_name, primary_email: customer.email, primary_phone: customer.phone, first_seen_at: identity?.first_seen_at || seenAt, last_seen_at: seenAt, metadata: {}, updated_at: new Date().toISOString() }),
    });

    const identityBody = { organization_id: context.organizationId, person_id: personId, connection_id: context.connectionId, provider_account_id: context.providerAccountId, source_type: "provider_customer_id", source_id: customer.provider_customer_id, confidence: 1, status: "verified", first_seen_at: identity?.first_seen_at || seenAt, last_seen_at: seenAt, evidence_id: evidenceId, metadata: {}, updated_at: new Date().toISOString() };
    if (identity) {
      await request(`person_source_identities?id=eq.${q(identity.id)}&organization_id=eq.${q(context.organizationId)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(identityBody) });
    } else {
      await request("person_source_identities", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(identityBody) });
    }
  }
}

async function ensureSourceMapping(
  request: PostgrestRequest,
  context: ConnectionContext,
  args: { sourceObjectType: "order" | "refund"; sourceObjectId: string; canonicalObjectType: "order" | "refund"; payloadHash: string; observedAt: string; mappingVersion: string },
): Promise<SourceMapping> {
  const rows = await request<Array<{ id: string; canonical_object_id: string; first_seen_at?: string | null }>>(
    `commerce_source_mappings?organization_id=eq.${q(context.organizationId)}&connection_id=eq.${q(context.connectionId)}&provider_account_id=eq.${q(context.providerAccountId)}&source_object_type=eq.${args.sourceObjectType}&source_object_id=eq.${q(args.sourceObjectId)}&select=id,canonical_object_id,first_seen_at&limit=1`,
  );
  if (rows[0]) {
    await request(`commerce_source_mappings?id=eq.${q(rows[0].id)}&organization_id=eq.${q(context.organizationId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ last_seen_at: args.observedAt, source_updated_at: args.observedAt, payload_hash: args.payloadHash, mapping_version: args.mappingVersion, state: "active", updated_at: new Date().toISOString() }),
    });
    return { id: rows[0].id, canonicalObjectId: rows[0].canonical_object_id };
  }

  const canonicalObjectId = await deterministicUuid(`shopify:${args.canonicalObjectType}:${context.organizationId}:${context.connectionId}:${context.providerAccountId}:${args.sourceObjectId}`);
  const id = crypto.randomUUID();
  await request("commerce_source_mappings", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      id,
      organization_id: context.organizationId,
      connection_id: context.connectionId,
      provider_account_id: context.providerAccountId,
      source_object_type: args.sourceObjectType,
      source_object_id: args.sourceObjectId,
      canonical_object_type: args.canonicalObjectType,
      canonical_object_id: canonicalObjectId,
      first_seen_at: args.observedAt,
      last_seen_at: args.observedAt,
      source_updated_at: args.observedAt,
      payload_hash: args.payloadHash,
      mapping_version: args.mappingVersion,
      state: "active",
      metadata: { provider: "shopify" },
    }),
  });
  return { id, canonicalObjectId };
}

function requiredEvidence(evidence: EvidenceMap, record: ShopifyPersistedRecord) {
  const value = evidence.get(recordKey(record));
  if (!value) throw new Error(`Shopify ${record.resource} evidence is unavailable for ${record.providerObjectId}.`);
  return value;
}
function recordKey(record: ShopifyPersistedRecord) { return `${record.resource}:${record.providerObjectId}`; }

function commonScope(records: ShopifyPersistedRecord[]): Scope {
  const first = records[0];
  const scope = { organizationId: first.organizationId, connectionId: first.connectionId, providerAccountId: first.providerAccountId };
  if (!scope.organizationId || !scope.connectionId || !scope.providerAccountId) throw new Error("Shopify normalized persistence requires tenant scope.");
  if (records.some((record) => record.organizationId !== scope.organizationId || record.connectionId !== scope.connectionId || record.providerAccountId !== scope.providerAccountId)) throw new Error("Shopify normalized persistence cannot mix tenant scopes in one write.");
  return scope;
}

function normalizeShopDomain(value: unknown) {
  const raw = String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(raw) ? raw : "";
}
function q(value: string) { return encodeURIComponent(value); }
type PostgrestRequest = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

function createPostgrestRequest(config: WriterConfig): PostgrestRequest {
  const baseUrl = String(config.url || "").trim().replace(/\/+$/, "");
  const serviceRoleKey = String(config.serviceRoleKey || "").trim();
  if (!baseUrl || !serviceRoleKey) throw new Error("Shopify normalized persistence requires Supabase URL and service-role credentials.");
  const fetchImpl = config.fetchImpl || fetch;
  return async function request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetchImpl(`${baseUrl}/rest/v1/${path}`, { ...init, headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json", ...(init.headers || {}) } });
    if (!response.ok) throw new Error(`Shopify normalized persistence failed (${response.status}): ${(await response.text()).slice(0, 1000)}`);
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  };
}
