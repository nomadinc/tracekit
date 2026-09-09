import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { decodeCommerceCredentialKey, decryptCommerceCredential } from "./credential-crypto";
import { parseShopifyConnectionCredential, normalizeShopifyConnectionDomain } from "./shopify-verifier";
import { runShopifyIncrementalResource } from "./shopify-incremental-runtime";

type WebhookConnection = {
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
  shopDomain: string;
  accessToken: string;
  apiVersion: string;
  appSecret: string;
};

type WebhookReceipt = {
  duplicate: boolean;
  syncRunId: string | null;
  payloadHash: string;
};

export function verifyShopifyWebhookHmac(rawBody: string, providedHmac: string, secret: string) {
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(String(providedHmac || ""), "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function processShopifyWebhook(args: {
  rawBody: string;
  hmac: string;
  shopDomain: string;
  topic: string;
  webhookId: string;
}) {
  const topic = String(args.topic || "").trim().toLowerCase();
  if (!new Set(["orders/create", "refunds/create"]).has(topic)) {
    throw new ShopifyWebhookError(400, "shopify_webhook_topic_unsupported");
  }
  const shopDomain = normalizeShopifyConnectionDomain(args.shopDomain);
  if (!shopDomain) throw new ShopifyWebhookError(400, "shopify_webhook_shop_invalid");
  const webhookId = String(args.webhookId || "").trim();
  if (!webhookId) throw new ShopifyWebhookError(400, "shopify_webhook_id_missing");

  const connection = await resolveWebhookConnection(shopDomain);
  if (!verifyShopifyWebhookHmac(args.rawBody, args.hmac, connection.appSecret)) {
    throw new ShopifyWebhookError(401, "shopify_webhook_hmac_invalid");
  }

  const receipt = await persistWebhookEvidence({
    connection,
    rawBody: args.rawBody,
    topic,
    webhookId,
  });
  if (receipt.duplicate) {
    return { accepted: true, duplicate: true, records: 0, webhookId };
  }

  const result = await runShopifyIncrementalResource({
    organizationId: connection.organizationId,
    connectionId: connection.connectionId,
    providerAccountId: connection.providerAccountId,
    resource: "orders",
    shopDomain: connection.shopDomain,
    accessToken: connection.accessToken,
    apiVersion: connection.apiVersion,
    maxPages: 2,
    pageSize: 25,
  });
  await finishWebhookRun(receipt.syncRunId, connection, result.records);
  return { accepted: true, duplicate: false, records: result.records, webhookId };
}

export class ShopifyWebhookError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = "ShopifyWebhookError";
  }
}

async function resolveWebhookConnection(shopDomain: string): Promise<WebhookConnection> {
  const request = postgrest();
  const accounts = await request<Array<{ id: string; organization_id: string; connection_id: string }>>(
    `commerce_provider_accounts?provider_account_external_id=eq.${q(shopDomain)}&status=eq.active&select=id,organization_id,connection_id&limit=2`,
  );
  if (accounts.length !== 1) throw new ShopifyWebhookError(404, "shopify_webhook_connection_unavailable");
  const account = accounts[0];
  const connections = await request<Array<{ id: string; provider: string; status: string }>>(
    `commerce_provider_connections?id=eq.${q(account.connection_id)}&organization_id=eq.${q(account.organization_id)}&select=id,provider,status&limit=1`,
  );
  const connection = connections[0];
  if (!connection || connection.provider !== "shopify" || !["connected", "degraded"].includes(connection.status)) {
    throw new ShopifyWebhookError(404, "shopify_webhook_connection_unavailable");
  }

  const credentials = await request<Array<{
    encryption_key_id: string;
    encryption_version: number;
    secret_iv: string;
    secret_ciphertext: string;
  }>>(
    `commerce_provider_credentials?connection_id=eq.${q(connection.id)}&organization_id=eq.${q(account.organization_id)}&revoked_at=is.null&select=encryption_key_id,encryption_version,secret_iv,secret_ciphertext&order=created_at.desc&limit=1`,
  );
  const stored = credentials[0];
  if (!stored?.secret_iv || !stored?.secret_ciphertext) throw new ShopifyWebhookError(503, "shopify_webhook_secret_unavailable");
  const plaintext = await decryptCommerceCredential(
    {
      keyId: stored.encryption_key_id,
      encryptionVersion: stored.encryption_version,
      iv: bytea(stored.secret_iv),
      ciphertext: bytea(stored.secret_ciphertext),
    },
    decodeCommerceCredentialKey(process.env.COMMERCE_CREDENTIALS_ENC_KEY),
  );
  const parsed = parseShopifyConnectionCredential(plaintext);
  if (parsed.shopDomain !== shopDomain || !parsed.appSecret) throw new ShopifyWebhookError(503, "shopify_webhook_secret_unavailable");
  return {
    organizationId: account.organization_id,
    connectionId: connection.id,
    providerAccountId: account.id,
    shopDomain,
    accessToken: parsed.adminAccessToken,
    apiVersion: parsed.apiVersion,
    appSecret: parsed.appSecret,
  };
}

async function persistWebhookEvidence(args: {
  connection: WebhookConnection;
  rawBody: string;
  topic: string;
  webhookId: string;
}): Promise<WebhookReceipt> {
  const request = postgrest();
  const payloadHash = createHmac("sha256", "tracekit-shopify-webhook-evidence-v1").update(args.rawBody, "utf8").digest("hex");
  const existing = await request<Array<{ id: string }>>(
    `commerce_evidence_records?organization_id=eq.${q(args.connection.organizationId)}&connection_id=eq.${q(args.connection.connectionId)}&provider_account_id=eq.${q(args.connection.providerAccountId)}&source_object_type=eq.shopify_webhook&source_object_id=eq.${q(args.webhookId)}&payload_hash=eq.${q(payloadHash)}&select=id&limit=1`,
  );
  if (existing[0]) return { duplicate: true, syncRunId: null, payloadHash };

  const runs = await request<Array<{ id: string }>>("commerce_sync_runs?select=id", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: args.connection.organizationId,
      connection_id: args.connection.connectionId,
      provider_account_id: args.connection.providerAccountId,
      sync_type: "shopify_webhook",
      mode: "shadow",
      status: "running",
      started_at: new Date().toISOString(),
      metadata: { webhook_id: args.webhookId, topic: args.topic, shop_domain: args.connection.shopDomain, payload_hash: payloadHash },
    }),
  });
  const runId = runs[0]?.id;
  if (!runId) throw new Error("Shopify webhook receipt run was not created.");

  const baseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
  const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const objectPath = `${args.connection.organizationId}/${args.connection.connectionId}/${args.connection.providerAccountId}/webhooks/${args.webhookId}.json`;
  const upload = await fetch(`${baseUrl}/storage/v1/object/commerce-evidence/${objectPath}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", "x-upsert": "false" },
    body: args.rawBody,
  });
  if (!upload.ok && upload.status !== 409) throw new Error(`Shopify webhook evidence upload failed (${upload.status}).`);

  await request("commerce_evidence_records", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      id: crypto.randomUUID(),
      organization_id: args.connection.organizationId,
      connection_id: args.connection.connectionId,
      provider_account_id: args.connection.providerAccountId,
      sync_run_id: runId,
      source_object_type: "shopify_webhook",
      source_object_id: args.webhookId,
      payload_hash: payloadHash,
      storage_backend: "object_storage",
      storage_reference: `commerce-evidence/${objectPath}`,
      content_type: "application/json",
      byte_size: new TextEncoder().encode(args.rawBody).byteLength,
      observed_at: new Date().toISOString(),
      normalizer_version: "shopify-webhook-v1",
      pii_classification: "sensitive",
      retention_policy: "commerce_default",
      metadata: { provider: "shopify", topic: args.topic, delivery_id: args.webhookId },
    }),
  });
  return { duplicate: false, syncRunId: runId, payloadHash };
}

async function finishWebhookRun(syncRunId: string | null, connection: WebhookConnection, records: number) {
  if (!syncRunId) return;
  await postgrest()(
    `commerce_sync_runs?id=eq.${q(syncRunId)}&organization_id=eq.${q(connection.organizationId)}&connection_id=eq.${q(connection.connectionId)}&provider_account_id=eq.${q(connection.providerAccountId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "completed", completed_at: new Date().toISOString(), pages_completed: 1, records_seen: records, updated_at: new Date().toISOString() }),
    },
  );
}

function postgrest() {
  const baseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
  const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return async function request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Shopify webhook persistence failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  };
}

function bytea(value: string) {
  const text = String(value || "");
  if (text.startsWith("\\x")) return Uint8Array.from(Buffer.from(text.slice(2), "hex"));
  return Uint8Array.from(Buffer.from(text, "base64"));
}

function q(value: string) { return encodeURIComponent(value); }
function requiredEnv(name: string) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is unavailable.`);
  return value;
}
