import type { ShopifyPersistedRecord } from "./persistence";

type EvidenceConfig = {
  url: string;
  serviceRoleKey: string;
  fetchImpl?: typeof fetch;
};

export type ShopifyEvidence = {
  id: string;
  payloadHash: string;
  storageReference: string;
};

export function createShopifyEvidenceStore(config: EvidenceConfig) {
  const baseUrl = required(config.url, "Supabase URL").replace(/\/+$/, "");
  const serviceRoleKey = required(config.serviceRoleKey, "Supabase service-role key");
  const fetchImpl = config.fetchImpl || fetch;

  return async function ensureShopifyEvidence(record: ShopifyPersistedRecord, syncRunId: string): Promise<ShopifyEvidence> {
    const runId = required(syncRunId, "Shopify sync run id");
    const payloadText = JSON.stringify(record.payload);
    const payloadBytes = new TextEncoder().encode(payloadText);
    const payloadHash = await sha256Hex(payloadBytes);
    const sourceObjectType = `shopify_${singular(record.resource)}`;

    const query = new URLSearchParams({
      organization_id: `eq.${record.organizationId}`,
      connection_id: `eq.${record.connectionId}`,
      provider_account_id: `eq.${record.providerAccountId}`,
      source_object_type: `eq.${sourceObjectType}`,
      source_object_id: `eq.${record.providerObjectId}`,
      payload_hash: `eq.${payloadHash}`,
      select: "id,payload_hash,storage_reference",
      limit: "1",
    });
    const existingResponse = await authorizedFetch(fetchImpl, serviceRoleKey, `${baseUrl}/rest/v1/commerce_evidence_records?${query}`);
    const existing = await json<Array<{ id: string; payload_hash: string; storage_reference: string }>>(existingResponse);
    if (existing[0]) {
      return { id: existing[0].id, payloadHash: existing[0].payload_hash, storageReference: existing[0].storage_reference };
    }

    const sourceHash = await sha256Hex(new TextEncoder().encode(record.providerObjectId));
    const objectPath = `${record.organizationId}/${record.connectionId}/${record.providerAccountId}/${record.resource}/${sourceHash}/${payloadHash}.json`;
    const storageReference = `commerce-evidence/${objectPath}`;
    const uploadResponse = await authorizedFetch(
      fetchImpl,
      serviceRoleKey,
      `${baseUrl}/storage/v1/object/commerce-evidence/${objectPath}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-upsert": "true" },
        body: payloadText,
      },
    );
    if (!uploadResponse.ok) {
      throw new Error(`Shopify evidence upload failed (${uploadResponse.status}): ${(await uploadResponse.text()).slice(0, 500)}`);
    }

    const evidenceId = crypto.randomUUID();
    const now = new Date().toISOString();
    const evidenceResponse = await authorizedFetch(fetchImpl, serviceRoleKey, `${baseUrl}/rest/v1/commerce_evidence_records`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        id: evidenceId,
        organization_id: record.organizationId,
        connection_id: record.connectionId,
        provider_account_id: record.providerAccountId,
        sync_run_id: runId,
        source_object_type: sourceObjectType,
        source_object_id: record.providerObjectId,
        payload_hash: payloadHash,
        storage_backend: "object_storage",
        storage_reference: storageReference,
        content_type: "application/json",
        byte_size: payloadBytes.byteLength,
        source_created_at: sourceCreatedAt(record.payload),
        source_updated_at: record.providerUpdatedAt,
        observed_at: now,
        normalizer_version: "shopify-v1",
        pii_classification: record.resource === "products" ? "none" : "sensitive",
        retention_policy: "commerce_default",
        metadata: { provider: "shopify", resource: record.resource },
      }),
    });
    if (!evidenceResponse.ok) {
      if (evidenceResponse.status === 409) {
        const retry = await authorizedFetch(fetchImpl, serviceRoleKey, `${baseUrl}/rest/v1/commerce_evidence_records?${query}`);
        const rows = await json<Array<{ id: string; payload_hash: string; storage_reference: string }>>(retry);
        if (rows[0]) return { id: rows[0].id, payloadHash: rows[0].payload_hash, storageReference: rows[0].storage_reference };
      }
      throw new Error(`Shopify evidence metadata insert failed (${evidenceResponse.status}): ${(await evidenceResponse.text()).slice(0, 500)}`);
    }

    return { id: evidenceId, payloadHash, storageReference };
  };
}

async function authorizedFetch(fetchImpl: typeof fetch, key: string, url: string, init: RequestInit = {}) {
  return fetchImpl(url, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(init.headers || {}),
    },
  });
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`Shopify evidence lookup failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  const text = await response.text();
  return (text ? JSON.parse(text) : []) as T;
}

async function sha256Hex(bytes: Uint8Array) {
  const input = bytes.slice().buffer;
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

function singular(resource: ShopifyPersistedRecord["resource"]) {
  if (resource === "orders") return "order";
  if (resource === "products") return "product";
  return "customer";
}

function sourceCreatedAt(payload: unknown) {
  const value = String((payload as { createdAt?: unknown })?.createdAt || "").trim();
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function required(value: unknown, label: string) {
  const result = String(value || "").trim();
  if (!result) throw new Error(`${label} is required.`);
  return result;
}
