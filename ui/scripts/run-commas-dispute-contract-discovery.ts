import { probeCommasDisputeCollections } from "../../api/src/connectors/commas/dispute-discovery.ts";
import { decodeCommerceCredentialKey, decryptCommerceCredential } from "../lib/commerce/credential-crypto";
import { supabaseAuthHeaders } from "../lib/commerce/supabase-auth";

type Row = Record<string, unknown>;

const config = () => ({ url: process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, ""), key: process.env.SUPABASE_SERVICE_ROLE_KEY });
const bytes = (value: unknown) => Uint8Array.from(Buffer.from(String(value).replace(/^\\x/, ""), "hex"));

async function db(path: string): Promise<Row[]> {
  const { url, key } = config();
  if (!url || !key) throw new Error("Supabase persistence configuration unavailable.");
  const response = await fetch(`${url}/rest/v1/${path}`, { headers: { ...supabaseAuthHeaders(key), Accept: "application/json" } });
  if (!response.ok) throw new Error(`Read-only TraceKit scope read failed (${response.status}).`);
  const value = await response.json() as unknown;
  return (Array.isArray(value) ? value : [value]) as Row[];
}

async function main() {
  if (!process.argv.includes("--confirm-commas-dispute-contract-discovery")) {
    throw new Error("Discovery requires --confirm-commas-dispute-contract-discovery.");
  }
  const connections = await db("commerce_provider_connections?provider=eq.commas&status=eq.connected&select=id,organization_id,account_id&limit=2");
  if (connections.length !== 1) throw new Error("Discovery requires exactly one connected Commas connection.");
  const connection = connections[0];
  const accounts = await db(`commerce_provider_accounts?organization_id=eq.${connection.organization_id}&connection_id=eq.${connection.id}&status=eq.active&select=id&limit=2`);
  if (accounts.length !== 1) throw new Error("Discovery requires exactly one active Commas provider account.");
  const schedules = await db(`commerce_sync_schedules?organization_id=eq.${connection.organization_id}&connection_id=eq.${connection.id}&resource=eq.transactions&select=quota_minimum_remaining&limit=1`);
  const quotaFloor = Number(schedules[0]?.quota_minimum_remaining ?? 1000);
  const runs = await db(`commerce_sync_runs?organization_id=eq.${connection.organization_id}&connection_id=eq.${connection.id}&select=metadata&order=created_at.desc&limit=25`);
  const quotaRemaining = runs.map((row) => Number((row.metadata as Row | undefined)?.rate_limit_end)).find((value) => Number.isFinite(value));
  if (!Number.isFinite(quotaRemaining)) throw new Error("Discovery requires known Commas quota.");
  if (Number(quotaRemaining) - 2 < quotaFloor) throw new Error("Discovery blocked by the Commas quota floor.");

  const credentials = await db(`commerce_provider_credentials?organization_id=eq.${connection.organization_id}&connection_id=eq.${connection.id}&revoked_at=is.null&select=encryption_key_id,encryption_version,secret_iv,secret_ciphertext&limit=2`);
  if (credentials.length !== 1) throw new Error("Discovery requires exactly one active encrypted Commas credential.");
  const credential = credentials[0];
  const keyId = process.env.COMMERCE_CREDENTIALS_KEY_ID;
  const version = Number(process.env.COMMERCE_CREDENTIALS_ENCRYPTION_VERSION || "1");
  if (!keyId || String(credential.encryption_key_id) !== keyId || Number(credential.encryption_version) !== version) throw new Error("Credential envelope configuration mismatch.");
  const apiKey = await decryptCommerceCredential({ keyId, encryptionVersion: version, iv: bytes(credential.secret_iv), ciphertext: bytes(credential.secret_ciphertext) }, decodeCommerceCredentialKey(process.env.COMMERCE_CREDENTIALS_ENC_KEY));
  const report = await probeCommasDisputeCollections({ apiKey, baseUrl: process.env.COMMAS_BASE_URL, includeSanitizedFixture: true });
  console.log(JSON.stringify({
    provider: "Commas",
    connectionScope: "single connected connection / single active provider account",
    quota: { observed: Number(quotaRemaining), requestBudget: 2, floor: quotaFloor, allowed: Number(quotaRemaining) - 2 >= quotaFloor },
    providerRequestsMaximum: 2,
    writes: 0,
    checkpointsAdvanced: false,
    schedulerPath: false,
    endpoints: report.results.map((result) => ({
      endpoint: new URL(result.url).pathname,
      supported: result.status >= 200 && result.status < 300,
      httpStatus: result.status,
      recordsObserved: recordsObserved(result.sanitizedFixture),
      pagination: { requestedPage: 1, requestedPerPage: 2, responseKeys: result.paginationKeys },
      fieldPaths: result.bodyStructure,
      contract: result.contract,
      rateLimit: Object.fromEntries(Object.entries(result.responseHeaders).filter(([key]) => /^x-ratelimit-(limit|remaining|reset)$/i.test(key))),
      error: result.redactedErrorMessage,
      sanitizedFixture: result.sanitizedFixture,
    })),
  }, null, 2));
}

function recordsObserved(value: unknown) {
  if (Array.isArray(value)) return value.length;
  if (!value || typeof value !== "object") return 0;
  const root = value as Row;
  const data = root.data && typeof root.data === "object" ? root.data as Row : root;
  for (const key of ["disputes", "chargebacks", "items", "records"]) if (Array.isArray(data[key])) return (data[key] as unknown[]).length;
  return 0;
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : "Commas contract discovery failed." }));
  process.exitCode = 1;
});
