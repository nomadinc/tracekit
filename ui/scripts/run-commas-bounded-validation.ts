import { CommasClient } from "../../api/src/connectors/commas/client.ts";
import { decodeCommerceCredentialKey, decryptCommerceCredential } from "../lib/commerce/credential-crypto";
import { normalizeCommasTransaction } from "../lib/commerce/commas-shadow-normalizer";
import { SupabaseCommerceEvidenceStore } from "../lib/commerce/supabase-evidence-store-core";
import { assertRuntimeSafe, parseBoundedArgs, selectBoundedTransactions, HARD_TRANSACTION_MAX } from "../lib/commerce/commas-bounded-validation";
import { supabaseAuthHeaders } from "../lib/commerce/supabase-auth";

type Row = Record<string, unknown>;
type CommasTransaction = Row & { id: string | number };
const owner = `commas-bounded-validation-${crypto.randomUUID()}`;
const config = () => ({ url: process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, ""), key: process.env.SUPABASE_SERVICE_ROLE_KEY });

async function db(path: string, init: RequestInit = {}, writes = false): Promise<Row[]> {
  if (writes && process.argv.includes("--preflight")) throw new Error("Preflight attempted a write.");
  const { url, key } = config();
  if (!url || !key) throw new Error("Supabase persistence configuration unavailable.");
  const response = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...supabaseAuthHeaders(key), "Content-Type": "application/json", Prefer: "return=representation", ...init.headers } });
  if (!response.ok) throw new Error(`Bounded validation persistence failed (${response.status}).`);
  if (response.status === 204) return [];
  const value = await response.json() as unknown;
  return (Array.isArray(value) ? value : [value]) as Row[];
}

const bytes = (value: unknown) => Uint8Array.from(Buffer.from(String(value).replace(/^\\x/, ""), "hex"));
const jsonObject = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};

async function scope() {
  const connections = await db("commerce_provider_connections?provider=eq.commas&status=eq.connected&select=id,organization_id,account_id&limit=2");
  if (connections.length !== 1) throw new Error("Expected exactly one connected Commas connection.");
  const connection = connections[0];
  const accounts = await db(`commerce_provider_accounts?connection_id=eq.${connection.id}&organization_id=eq.${connection.organization_id}&status=eq.active&select=id,provider_account_external_id&limit=2`);
  if (accounts.length !== 1) throw new Error("Expected exactly one active Commas provider account.");
  const schedules = await db(`commerce_sync_schedules?connection_id=eq.${connection.id}&organization_id=eq.${connection.organization_id}&resource=eq.transactions&select=enabled,activation_state&limit=1`);
  const controls = await db(`tracekit_production_controls?organization_id=eq.${connection.organization_id}&capability=eq.commerce_scheduler&select=activation_state&limit=1`);
  const pauses = await db(`commerce_connection_pauses?connection_id=eq.${connection.id}&organization_id=eq.${connection.organization_id}&select=paused&limit=1`);
  const activation = await db(`commerce_repository_activation?organization_id=eq.${connection.organization_id}&workspace=eq.orders&select=mode&limit=1`);
  const activeRuns = await db(`commerce_sync_runs?connection_id=eq.${connection.id}&provider_account_id=eq.${accounts[0].id}&status=in.(queued,running,paused)&select=id&limit=11`);
  assertRuntimeSafe({ schedulerEnv: process.env.TRACEKIT_COMMERCE_SCHEDULER_ENABLED, killSwitchEnv: process.env.TRACEKIT_COMMERCE_KILL_SWITCH, productionControlState: controls[0]?.activation_state ? String(controls[0].activation_state) : null, scheduleEnabled: schedules[0]?.enabled == null ? null : Boolean(schedules[0].enabled), scheduleActivationState: schedules[0]?.activation_state ? String(schedules[0].activation_state) : null, connectionPaused: Boolean(pauses[0]?.paused), activationMode: activation[0]?.mode ? String(activation[0].mode) : null, activeRunCount: activeRuns.length });
  return { organizationId: String(connection.organization_id), accountId: String(connection.account_id), connectionId: String(connection.id), providerAccountId: String(accounts[0].id), providerExternalId: String(accounts[0].provider_account_external_id) };
}

async function credential(scopeValue: Awaited<ReturnType<typeof scope>>) {
  const rows = await db(`commerce_provider_credentials?connection_id=eq.${scopeValue.connectionId}&organization_id=eq.${scopeValue.organizationId}&revoked_at=is.null&select=encryption_key_id,encryption_version,secret_iv,secret_ciphertext&limit=2`);
  if (rows.length !== 1) throw new Error("Expected exactly one active encrypted Commas credential.");
  const row = rows[0]; const keyId = process.env.COMMERCE_CREDENTIALS_KEY_ID; const version = Number(process.env.COMMERCE_CREDENTIALS_ENCRYPTION_VERSION || "1");
  if (!keyId || String(row.encryption_key_id) !== keyId || Number(row.encryption_version) !== version) throw new Error("Credential envelope configuration mismatch.");
  return decryptCommerceCredential({ keyId, encryptionVersion: version, iv: bytes(row.secret_iv), ciphertext: bytes(row.secret_ciphertext) }, decodeCommerceCredentialKey(process.env.COMMERCE_CREDENTIALS_ENC_KEY));
}

async function main() {
  const args = parseBoundedArgs(process.argv.slice(2));
  if (!args.confirmed) throw new Error("--confirm-production-shadow-validation is required.");
  const selectedScope = await scope();
  const requestedCount = args.transactionIds.length || args.maxTransactions!;
  console.log(JSON.stringify({ provider: "Commas", selectedTransactionCount: requestedCount, scheduler: "off", continuousSync: "off", mode: "bounded production shadow validation", preflight: args.preflight }));

  // Preflight is deliberately TraceKit-only: no credential lookup and no provider
  // transaction/detail request occurs before this return.
  if (args.preflight) {
    console.log(JSON.stringify({ event: "bounded_preflight", sourceTransactions: requestedCount, providerRequests: 0, writes: 0, historicalCheckpointAdvanced: false }));
    return;
  }

  const secret = await credential(selectedScope);
  const client = new CommasClient({ apiKey: secret, environment: "production" });
  const requested = args.transactionIds.length ? await Promise.all(args.transactionIds.map((id) => client.getTransaction(id, { correlationId: owner }))) : [await client.listTransactions({ page: 1, perPage: args.maxTransactions ?? HARD_TRANSACTION_MAX }, { correlationId: owner })];
  const items = requested.flatMap((result) => "item" in result ? [result.item] : (result as { items: CommasTransaction[] }).items);
  const selected = selectBoundedTransactions(items, args);
  if (selected.length > HARD_TRANSACTION_MAX) throw new Error("Selected transaction count exceeds the hard maximum.");
  console.log(JSON.stringify({ event: "bounded_preflight", sourceTransactions: selected.length, providerPagesFetched: 1 }));
  const run = (await db("commerce_sync_runs", { method: "POST", body: JSON.stringify({ organization_id: selectedScope.organizationId, connection_id: selectedScope.connectionId, provider_account_id: selectedScope.providerAccountId, sync_type: "bounded_transaction_validation", mode: "shadow", metadata: { validation: "commas_bounded_shadow", selected_count: selected.length, historical_checkpoint_advanced: false } }) }, true))[0];
  const store = new SupabaseCommerceEvidenceStore(); let created = 0;
  for (const transaction of selected) {
    const payload = new TextEncoder().encode(JSON.stringify(transaction));
    const stored = await store.putImmutable({ organizationId: selectedScope.organizationId, connectionId: selectedScope.connectionId, providerAccountId: selectedScope.providerAccountId, sourceObjectType: "transaction", payload, contentType: "application/json" });
    const evidenceBody = { organization_id: selectedScope.organizationId, connection_id: selectedScope.connectionId, provider_account_id: selectedScope.providerAccountId, sync_run_id: run.id, source_object_type: "transaction", source_object_id: String(transaction.id), payload_hash: stored.payloadHash, storage_backend: "object_storage", storage_reference: stored.storageReference, content_type: stored.contentType, byte_size: stored.byteSize, observed_at: new Date().toISOString(), normalizer_version: "commas-transaction-v1", mapping_version: "bounded-validation-v1", pii_classification: "sensitive", retention_policy: "commerce-provider-raw-v1", metadata: { immutable: true, validation: true } };
    let evidence = (await db("commerce_evidence_records?on_conflict=connection_id,provider_account_id,source_object_type,source_object_id,payload_hash", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(evidenceBody) }, true))[0];
    if (!evidence) evidence = (await db(`commerce_evidence_records?connection_id=eq.${selectedScope.connectionId}&provider_account_id=eq.${selectedScope.providerAccountId}&source_object_type=eq.transaction&source_object_id=eq.${encodeURIComponent(String(transaction.id))}&payload_hash=eq.${stored.payloadHash}&select=id&limit=1`))[0];
    if (!evidence) throw new Error("Existing bounded Evidence could not be resolved idempotently.");
    await db("rpc/normalize_commerce_transaction_page_v2", { method: "POST", body: JSON.stringify({ p_organization_id: selectedScope.organizationId, p_account_id: selectedScope.accountId, p_connection_id: selectedScope.connectionId, p_provider_account_id: selectedScope.providerAccountId, p_evidence_id: evidence.id, p_records: [normalizeCommasTransaction(jsonObject(transaction), { connectionId: selectedScope.connectionId, providerAccountId: selectedScope.providerAccountId })] }) }, true);
    created += 1;
  }
  await db(`commerce_sync_runs?id=eq.${run.id}`, { method: "PATCH", body: JSON.stringify({ status: "completed", source_total_items: selected.length, records_seen: selected.length, records_created: created, completed_at: new Date().toISOString(), metadata: { validation: "commas_bounded_shadow", historical_checkpoint_advanced: false } }) }, true);
  console.log(JSON.stringify({ event: "bounded_validation_completed", sourceTransactions: selected.length, providerPagesFetched: 1, historicalCheckpointAdvanced: false }));
}
void main().catch((error) => { console.error(error instanceof Error ? error.message : "Bounded validation failed."); process.exitCode = 1; });
