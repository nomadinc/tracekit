import { createShopifyEvidenceStore, type ShopifyEvidence } from "./evidence";
import { normalizeShopifyCustomerRecord, normalizeShopifyOrderRecord, normalizeShopifyProductRecord } from "./normalize";
import type { ShopifyPersistedRecord } from "./persistence";
import type { ShopifySyncPage } from "./resources";

type Scope = { organizationId: string; connectionId: string; providerAccountId: string };

type WriterConfig = {
  url: string;
  serviceRoleKey: string;
  fetchImpl?: typeof fetch;
};

type ConnectionContext = Scope & {
  accountId: string;
  shopDomain: string;
};

type EvidenceMap = Map<string, ShopifyEvidence>;

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
  const rows = records.map((record) => {
    const order = normalizeShopifyOrderRecord(record, context.shopDomain);
    return {
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
      account_id: context.accountId,
      organization_id: context.organizationId,
      connection_id: context.connectionId,
      provider_account_id: context.providerAccountId,
      evidence_id: requiredEvidence(evidence, record).id,
      reconciliation_state: "observed",
      data_quality_state: "observed",
      updated_at: new Date().toISOString(),
    };
  });

  await request("platform_orders?on_conflict=platform_order_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
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
      body: JSON.stringify({
        id: personId,
        workspace_id: context.organizationId,
        organization_id: context.organizationId,
        status: "active",
        display_name: customer.display_name,
        primary_email: customer.email,
        primary_phone: customer.phone,
        first_seen_at: identity?.first_seen_at || seenAt,
        last_seen_at: seenAt,
        metadata: {},
        updated_at: new Date().toISOString(),
      }),
    });

    const identityBody = {
      organization_id: context.organizationId,
      person_id: personId,
      connection_id: context.connectionId,
      provider_account_id: context.providerAccountId,
      source_type: "provider_customer_id",
      source_id: customer.provider_customer_id,
      confidence: 1,
      status: "verified",
      first_seen_at: identity?.first_seen_at || seenAt,
      last_seen_at: seenAt,
      evidence_id: evidenceId,
      metadata: {},
      updated_at: new Date().toISOString(),
    };

    if (identity) {
      await request(`person_source_identities?id=eq.${q(identity.id)}&organization_id=eq.${q(context.organizationId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(identityBody),
      });
    } else {
      await request("person_source_identities", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(identityBody),
      });
    }
  }
}

function requiredEvidence(evidence: EvidenceMap, record: ShopifyPersistedRecord) {
  const value = evidence.get(recordKey(record));
  if (!value) throw new Error(`Shopify ${record.resource} evidence is unavailable for ${record.providerObjectId}.`);
  return value;
}

function recordKey(record: ShopifyPersistedRecord) {
  return `${record.resource}:${record.providerObjectId}`;
}

function commonScope(records: ShopifyPersistedRecord[]): Scope {
  const first = records[0];
  const scope = { organizationId: first.organizationId, connectionId: first.connectionId, providerAccountId: first.providerAccountId };
  if (!scope.organizationId || !scope.connectionId || !scope.providerAccountId) throw new Error("Shopify normalized persistence requires tenant scope.");
  if (records.some((record) => record.organizationId !== scope.organizationId || record.connectionId !== scope.connectionId || record.providerAccountId !== scope.providerAccountId)) {
    throw new Error("Shopify normalized persistence cannot mix tenant scopes in one write.");
  }
  return scope;
}

function normalizeShopDomain(value: unknown) {
  const raw = String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(raw) ? raw : "";
}

function q(value: string) {
  return encodeURIComponent(value);
}

type PostgrestRequest = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

function createPostgrestRequest(config: WriterConfig): PostgrestRequest {
  const baseUrl = String(config.url || "").trim().replace(/\/+$/, "");
  const serviceRoleKey = String(config.serviceRoleKey || "").trim();
  if (!baseUrl || !serviceRoleKey) throw new Error("Shopify normalized persistence requires Supabase URL and service-role credentials.");
  const fetchImpl = config.fetchImpl || fetch;

  return async function request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetchImpl(`${baseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 1000);
      throw new Error(`Shopify normalized persistence failed (${response.status}): ${detail}`);
    }
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  };
}
