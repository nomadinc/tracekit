import { decodeCommerceCredentialKey, decryptCommerceCredential } from "../lib/commerce/credential-crypto";
import { SupabaseCommerceEvidenceStore } from "../lib/commerce/supabase-evidence-store-core";

type Row = Record<string, unknown>;

function configuration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Local Evidence proof configuration is unavailable.");
  return { url, key };
}

async function request(path: string, init: RequestInit = {}) {
  const { url, key } = configuration();
  const response = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation", ...init.headers } });
  if (!response.ok) throw new Error(`Local persistence operation failed (${response.status}).`);
  if (response.status === 204) return [] as Row[];
  const parsed = await response.json() as unknown;
  return (Array.isArray(parsed) ? parsed : [parsed]) as Row[];
}

const bytea = (value: unknown) => Uint8Array.from(Buffer.from(String(value).replace(/^\\x/, ""), "hex"));

async function main() {
  if (!process.argv.includes("--confirm-bounded-live-proof")) throw new Error("Bounded live Evidence proof requires explicit confirmation.");
  const store = new SupabaseCommerceEvidenceStore();
  const owner = `evidence-proof-${crypto.randomUUID()}`;
  let run: Row | null = null;
  let checkpoint: Row | null = null;
  let stage = "connection_lookup";

  try {
    const connections = await request("commerce_provider_connections?provider=eq.commas&status=eq.connected&select=id,organization_id&limit=2");
    if (connections.length !== 1) throw new Error("Evidence proof requires exactly one connected local Commas Connection.");
    const connectionId = String(connections[0].id); const organizationId = String(connections[0].organization_id);
    const accounts = await request(`commerce_provider_accounts?connection_id=eq.${connectionId}&organization_id=eq.${organizationId}&status=eq.active&select=id&limit=2`);
    if (accounts.length !== 1) throw new Error("Evidence proof requires exactly one active Provider Account.");
    const providerAccountId = String(accounts[0].id);
    const credentials = await request(`commerce_provider_credentials?connection_id=eq.${connectionId}&organization_id=eq.${organizationId}&revoked_at=is.null&select=encryption_key_id,encryption_version,secret_iv,secret_ciphertext&limit=2`);
    if (credentials.length !== 1) throw new Error("Evidence proof credential is unavailable.");
    const credential = credentials[0];
    const keyId = process.env.COMMERCE_CREDENTIALS_KEY_ID; const version = Number(process.env.COMMERCE_CREDENTIALS_ENCRYPTION_VERSION || "1");
    if (!keyId || credential.encryption_key_id !== keyId || Number(credential.encryption_version) !== version) throw new Error("Evidence proof encryption configuration does not match the active credential.");
    stage = "credential_resolution";
    const secret = await decryptCommerceCredential({ keyId, encryptionVersion: version, iv: bytea(credential.secret_iv), ciphertext: bytea(credential.secret_ciphertext) }, decodeCommerceCredentialKey(process.env.COMMERCE_CREDENTIALS_ENC_KEY));

    stage = "sync_setup";
    [run] = await request("commerce_sync_runs", { method: "POST", body: JSON.stringify({ organization_id: organizationId, connection_id: connectionId, provider_account_id: providerAccountId, sync_type: "transaction_evidence_proof", mode: "shadow" }) });
    const claimed = await request("rpc/claim_commerce_sync_run", { method: "POST", body: JSON.stringify({ p_run_id: run.id, p_organization_id: organizationId, p_connection_id: connectionId, p_lease_owner: owner, p_lease_seconds: 120 }) });
    if (!claimed[0]) throw new Error("Evidence proof could not acquire its Sync Run lease.");
    [checkpoint] = await request("commerce_sync_checkpoints", { method: "POST", body: JSON.stringify({ sync_run_id: run.id, organization_id: organizationId, connection_id: connectionId, provider_account_id: providerAccountId, resource: "transactions", page: 1, per_page: 2, state: "running" }) });

    stage = "provider_fetch";
    const response = await fetch("https://www.fanbasis.com/public-api/checkout-sessions/transactions?page=1&per_page=2", { headers: { "x-api-key": secret, Accept: "application/json", "x-correlation-id": owner }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) { stage = `provider_http_${response.status}`; throw new Error("Bounded Commas Evidence proof request failed."); }
    stage = "provider_response_validation";
    const payload = new Uint8Array(await response.arrayBuffer());
    const parsed = JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;
    const nested = parsed.data && typeof parsed.data === "object" && !Array.isArray(parsed.data) ? parsed.data as Record<string, unknown> : null;
    const items = [parsed.transactions, parsed.data, parsed.items, nested?.transactions, nested?.data].find(Array.isArray) as unknown[] | undefined;
    if (!items || items.length > 2) throw new Error("Bounded Commas Evidence proof returned an unexpected page shape.");

    stage = "object_persistence";
    const stored = await store.putImmutable({ organizationId, connectionId, providerAccountId, sourceObjectType: "transaction_page", payload, contentType: response.headers.get("content-type")?.split(";")[0] || "application/json" });
    stage = "metadata_persistence";
    await request("commerce_evidence_records", { method: "POST", body: JSON.stringify({ organization_id: organizationId, connection_id: connectionId, provider_account_id: providerAccountId, sync_run_id: run.id, source_object_type: "transaction_page", source_object_id: "page:1:per_page:2", payload_hash: stored.payloadHash, storage_backend: "object_storage", storage_reference: stored.storageReference, content_type: stored.contentType, byte_size: stored.byteSize, observed_at: new Date().toISOString(), normalizer_version: "evidence-proof-v1", mapping_version: "unmapped-v1", pii_classification: "sensitive", retention_policy: "commerce-provider-raw-v1", metadata: { proof: true } }) });
    stage = "hash_verification";
    if (!await store.verifyHash({ organizationId, storageReference: stored.storageReference, payloadHash: stored.payloadHash })) throw new Error("Evidence proof hash verification failed.");
    const replay = await store.getAuthorized({ organizationId, storageReference: stored.storageReference });
    if (!replay || replay.byteLength !== payload.byteLength) throw new Error("Evidence proof replay failed.");

    stage = "checkpoint_completion";
    await request(`commerce_sync_checkpoints?id=eq.${checkpoint.id}`, { method: "PATCH", body: JSON.stringify({ state: "completed", page_fingerprint: stored.payloadHash, completed_at: new Date().toISOString() }) });
    await request("rpc/transition_commerce_sync_run", { method: "POST", body: JSON.stringify({ p_run_id: run.id, p_organization_id: organizationId, p_connection_id: connectionId, p_lease_owner: owner, p_transition: "completed", p_error_code: null, p_error_summary: null }) });
    console.log(JSON.stringify({ transactionsFetched: items.length, evidenceObjectsPersisted: 1, evidenceMetadataPersisted: 1, hashesVerified: 1, replayReads: 1, checkpointsCompleted: 1, syncRunsCompleted: 1 }));
  } catch {
    if (checkpoint) await request(`commerce_sync_checkpoints?id=eq.${checkpoint.id}`, { method: "PATCH", body: JSON.stringify({ state: "failed", retry_count: Number(checkpoint.retry_count || 0) + 1 }) }).catch(() => {});
    if (run) await request("rpc/transition_commerce_sync_run", { method: "POST", body: JSON.stringify({ p_run_id: run.id, p_organization_id: run.organization_id, p_connection_id: run.connection_id, p_lease_owner: owner, p_transition: "failed", p_error_code: "evidence_proof_failed", p_error_summary: "Bounded Evidence proof failed safely." }) }).catch(() => {});
    throw new Error(`Bounded Commerce Evidence proof failed safely at ${stage}.`);
  }
}

void main();
