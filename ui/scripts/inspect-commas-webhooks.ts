import { decodeCommerceCredentialKey, decryptCommerceCredential } from "../lib/commerce/credential-crypto";
import { supabaseAuthHeaders } from "../lib/commerce/supabase-auth";
import { exactTargetMatch, summarizeWebhookSubscription, type WebhookSubscriptionRow } from "../lib/commerce/commas-webhook-inspector";

export const TARGET_URL = "https://webhooks.trace-kit.io/v1/connectors/commas/webhooks";
type Row = Record<string, unknown>;

function configuration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration unavailable.");
  return { url, key };
}

async function readSupabase(path: string): Promise<Row[]> {
  const { url, key } = configuration();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: { ...supabaseAuthHeaders(key), Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Supabase read failed (${response.status}).`);
  const value = await response.json() as unknown;
  return (Array.isArray(value) ? value : [value]) as Row[];
}

function bytes(value: unknown) {
  const hex = String(value).replace(/^\\x/, "");
  if (!/^(?:[0-9a-f]{2})*$/i.test(hex)) throw new Error("Credential envelope is invalid.");
  const output = new Uint8Array(hex.length / 2);
  for (let index = 0; index < output.length; index += 1) output[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return output;
}

export async function resolveCommasApiKey() {
  const connections = await readSupabase("commerce_provider_connections?provider=eq.commas&status=eq.connected&select=id,organization_id&limit=2");
  if (connections.length !== 1) throw new Error("Expected exactly one connected Commas connection.");
  const connection = connections[0];
  const accounts = await readSupabase(`commerce_provider_accounts?organization_id=eq.${connection.organization_id}&connection_id=eq.${connection.id}&status=eq.active&select=id&limit=2`);
  if (accounts.length !== 1) throw new Error("Expected exactly one active Commas provider account.");
  const credentials = await readSupabase(`commerce_provider_credentials?organization_id=eq.${connection.organization_id}&connection_id=eq.${connection.id}&revoked_at=is.null&select=encryption_key_id,encryption_version,secret_iv,secret_ciphertext&limit=2`);
  if (credentials.length !== 1) throw new Error("Expected exactly one active encrypted Commas credential.");
  const credential = credentials[0];
  const keyId = process.env.COMMERCE_CREDENTIALS_KEY_ID;
  const version = Number(process.env.COMMERCE_CREDENTIALS_ENCRYPTION_VERSION || "1");
  if (!keyId || String(credential.encryption_key_id) !== keyId || Number(credential.encryption_version) !== version) throw new Error("Credential envelope configuration mismatch.");
  return decryptCommerceCredential({ keyId, encryptionVersion: version, iv: bytes(credential.secret_iv), ciphertext: bytes(credential.secret_ciphertext) }, decodeCommerceCredentialKey(process.env.COMMERCE_CREDENTIALS_ENC_KEY));
}

export async function listCommasWebhookSubscriptions(apiKey: string, fetchImpl: typeof fetch = fetch) {
  const baseUrl = (process.env.COMMAS_BASE_URL || "https://www.fanbasis.com").replace(/\/$/, "");
  const response = await fetchImpl(`${baseUrl}/public-api/webhook-subscriptions`, {
    headers: { "x-api-key": apiKey, Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Commas webhook subscription read failed (${response.status}).`);
  const payload = await response.json() as { data?: unknown };
  const rows = Array.isArray(payload.data) ? payload.data.filter((value): value is WebhookSubscriptionRow => Boolean(value) && typeof value === "object") : [];
  return rows.map(summarizeWebhookSubscription);
}

export async function inspectCommasWebhookSubscriptions(fetchImpl: typeof fetch = fetch) {
  const apiKey = await resolveCommasApiKey();
  const subscriptions = await listCommasWebhookSubscriptions(apiKey, fetchImpl);
  return { provider: "Commas", subscriptionCount: subscriptions.length, subscriptions, exactTargetMatch: exactTargetMatch(subscriptions, TARGET_URL) };
}

async function main() {
  const report = await inspectCommasWebhookSubscriptions();
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1]?.endsWith("inspect-commas-webhooks.ts")) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Commas webhook inspection failed.");
    process.exitCode = 1;
  });
}
