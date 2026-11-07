import https from "node:https";
import dns from "node:dns/promises";
import { isIP } from "node:net";
import { resolve } from "node:path";
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
  // This unscoped resolver is exclusively for approved local CLI entrypoints.
  const entry = resolve(process.argv[1] || "");
  if (!["inspect-commas-webhooks.ts", "create-commas-dispute-webhook.ts", "test-commas-dispute-webhook.ts"].some(name => entry === resolve(process.cwd(), "scripts", name))) {
    throw new Error("Global Commas credential resolution is CLI-only.");
  }
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

const PROVIDER_ORIGIN = "https://www.fanbasis.com";
const MAX_RESPONSE_BYTES = 262144;
const REQUEST_TIMEOUT_MS = 8000;

/** Only globally routable addresses are eligible; DNS results are pinned to TLS. */
export function isPublicCommasAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a,b,c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) === 6) {
    const first = parseInt(address.split(":")[0],16);
    const second = parseInt(address.split(":")[1] || "0",16);
    return first >= 0x2000 && first <= 0x3fff && first !== 0x2002 && first !== 0x3fff &&
      !(first === 0x2001 && (second <= 0x1ff || second === 0xdb8));
  }
  return false;
}

export function verifiedCommasUrl() {
  try {
    const base = new URL(process.env.COMMAS_BASE_URL || PROVIDER_ORIGIN);
    if (base.origin !== PROVIDER_ORIGIN || base.username || base.password || base.pathname !== "/" || base.search || base.hash) throw new Error();
    return new URL("/public-api/webhook-subscriptions", base);
  } catch { throw new Error("Commas provider origin is not approved."); }
}

async function readProviderSubscriptions(apiKey: string): Promise<unknown> {
  const url = verifiedCommasUrl();
  if (!apiKey || /[\r\n]/.test(apiKey)) throw new Error("Commas credential is invalid.");
  return new Promise((resolvePayload, reject) => {
    let request: ReturnType<typeof https.request> | undefined;
    let finished = false;
    const fail = (message: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      reject(new Error(message));
      request?.destroy();
    };
    const timer = setTimeout(() => fail("Commas subscription request timed out."), REQUEST_TIMEOUT_MS);
    void dns.lookup(url.hostname, {all:true, verbatim:true}).then(addresses => {
      if (finished) return;
      if (!addresses.length || addresses.some(item => !isPublicCommasAddress(item.address))) {
        fail("Commas provider resolved to a prohibited destination."); return;
      }
      const destination = addresses[0];
      // Pin the verified IP, retaining certificate verification against the provider hostname.
      request = https.request({hostname:destination.address, family:destination.family, port:443,
        servername:url.hostname, path:url.pathname, method:"GET", agent:false,
        headers:{Host:url.hostname,"x-api-key":apiKey,Accept:"application/json"}}, response => {
        if (finished) { response.destroy(); return; }
        const status = response.statusCode || 0;
        if (status >= 300 && status < 400) { fail("Commas provider redirects are prohibited."); response.destroy(); return; }
        if (status < 200 || status >= 300) { fail(`Commas webhook subscription read failed (${status}).`); response.destroy(); return; }
        let size = 0;
        const chunks: Buffer[] = [];
        response.on("error", () => fail("Commas subscription response failed."));
        response.on("aborted", () => fail("Commas subscription response failed."));
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_RESPONSE_BYTES) { fail("Commas subscription response exceeded size limit."); response.destroy(); return; }
          chunks.push(Buffer.from(chunk));
        });
        response.on("end", () => {
          if (finished) return;
          try {
            const payload: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            finished = true; clearTimeout(timer); resolvePayload(payload);
          } catch { fail("Commas subscription response was invalid."); }
        });
      });
      request.on("error", () => fail("Commas subscription request failed."));
      request.end();
    }).catch(() => fail("Commas subscription request failed."));
  });
}

export async function listCommasWebhookSubscriptions(apiKey: string) {
  const payload = await readProviderSubscriptions(apiKey) as {data?:unknown} | null;
  if (!payload || !Array.isArray(payload.data)) throw new Error("Commas subscription response was invalid.");
  return payload.data.filter((value): value is WebhookSubscriptionRow => Boolean(value) && typeof value === "object")
    .map(row => summarizeWebhookSubscription(row, [apiKey]));
}

export async function inspectCommasWebhookSubscriptions() {
  const apiKey = await resolveCommasApiKey();
  const subscriptions = await listCommasWebhookSubscriptions(apiKey);
  return { provider: "Commas", subscriptionCount: subscriptions.length, subscriptions, exactTargetMatch: exactTargetMatch(subscriptions, TARGET_URL) };
}

async function main() {
  const report = await inspectCommasWebhookSubscriptions();
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1]?.endsWith("inspect-commas-webhooks.ts")) {
  void main().catch(() => {
    console.error("Commas webhook inspection failed.");
    process.exitCode = 1;
  });
}
