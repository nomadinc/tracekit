import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { inspectResolutionCenterWorkbook, parseResolutionCenterWorkbook, type HistoricalDisputeRow } from "../../api/src/connectors/commas/resolution-center-import";
import { SupabaseCommerceEvidenceStore } from "../lib/commerce/supabase-evidence-store-core";
import { supabaseAuthHeaders } from "../lib/commerce/supabase-auth";

type Row = Record<string, unknown>;
const WORKBOOK = process.env.COMMAS_DISPUTE_WORKBOOK_PATH;
const MAX_ROWS = Math.min(100_000, Math.max(1, Number(process.env.COMMAS_DISPUTE_MAX_ROWS || 25_000)));
const PREVIEW = process.argv.includes("--preview");

function uuid(namespace: string, value: string) {
  const hash = createHash("sha256").update(`${namespace}\0${value}`).digest("hex").slice(0, 32).split("");
  hash[12] = "5"; hash[16] = ((parseInt(hash[16], 16) & 3) | 8).toString(16);
  return `${hash.slice(0, 8).join("")}-${hash.slice(8, 12).join("")}-${hash.slice(12, 16).join("")}-${hash.slice(16, 20).join("")}-${hash.slice(20).join("")}`;
}

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Historical import persistence unavailable.");
  return { url, key };
}

async function db(path: string, init: RequestInit = {}) {
  const { url, key } = config();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { ...supabaseAuthHeaders(key), "Content-Type": "application/json", Prefer: "return=representation", ...init.headers },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Historical import persistence failed (${response.status}).`);
  if (!text) return [] as Row[];
  const value = JSON.parse(text) as unknown;
  return (Array.isArray(value) ? value : [value]) as Row[];
}

async function main() {
  if (!process.argv.includes("--confirm-historical-import")) throw new Error("Historical import requires explicit confirmation.");
  if (!WORKBOOK) throw new Error("COMMAS_DISPUTE_WORKBOOK_PATH must reference the approved local workbook.");

  // Parse and validate the complete workbook before any persistence or object
  // storage mutation. Malformed rows are retained as rejected diagnostics.
  const rows: HistoricalDisputeRow[] = [];
  const rejected: Array<{ rowNumber: number; codes: string[] }> = [];
  let summary;
  try {
    summary = await parseResolutionCenterWorkbook({
      filePath: WORKBOOK,
      maxRows: MAX_ROWS,
      onAccepted: (row) => { rows.push(row); },
      onRejected: (finding) => { rejected.push(finding); },
    });
  } catch (error) {
    if (!PREVIEW) throw error;
    const shape = await inspectResolutionCenterWorkbook(WORKBOOK);
    const duplicateWorkbook = await findDuplicateWorkbook(shape.workbookHash);
    console.log(JSON.stringify({
      event: "historical_disputes_preview",
      writes: 0,
      providerRequests: 0,
      reconciliationCalls: 0,
      schedulerActivity: false,
      workbookRecognized: false,
      approvedContract: false,
      workbookHash: shape.workbookHash,
      worksheetNames: shape.worksheetNames,
      headers: shape.headers,
      totalDataRows: shape.totalDataRows,
      acceptedRows: 0,
      rejectedRows: null,
      rejectionCounts: { invalid_workbook_headers: 1 },
      rowValidation: "not_run_after_contract_failure",
      validationError: "Workbook headers do not match the approved Resolution Center schema.",
      duplicateWorkbook,
      dateRange: null,
      stateDistribution: {},
      statusDistribution: {},
      currencies: { present: [], source: "Currency is not a column in the approved Resolution Center workbook contract." },
      disputedAmountsWithoutCurrency: { amount: null, fee: null, safeToAggregate: false },
      productCounts: {},
    }, null, 2));
    return;
  }
  if (summary.workbookHash.length !== 64) throw new Error("Workbook hash validation failed.");

  if (PREVIEW) {
    const connections = await db("commerce_provider_connections?provider=eq.commas&status=eq.connected&select=id,organization_id&limit=2");
    const duplicateWorkbook = await findDuplicateWorkbook(summary.workbookHash);
    console.log(JSON.stringify(buildPreviewReport({ summary, rows, rejected, duplicateWorkbook }), null, 2));
    return;
  }

  const connections = await db("commerce_provider_connections?provider=eq.commas&status=eq.connected&select=id,organization_id,account_id&limit=2");
  if (connections.length !== 1) throw new Error("Historical import requires one connected Commas Connection.");
  const connectionId = String(connections[0].id);
  const organizationId = String(connections[0].organization_id);
  const accountId = String(connections[0].account_id);
  const accounts = await db(`commerce_provider_accounts?connection_id=eq.${connectionId}&organization_id=eq.${organizationId}&status=eq.active&select=id&limit=2`);
  if (accounts.length !== 1) throw new Error("Historical import requires one Provider Account.");
  const providerAccountId = String(accounts[0].id);

  const priorImport = await db(`commerce_historical_dispute_imports?organization_id=eq.${organizationId}&connection_id=eq.${connectionId}&provider_account_id=eq.${providerAccountId}&workbook_hash=eq.${summary.workbookHash}&select=id,sync_run_id,evidence_id,accepted_rows,rejected_rows&limit=1`);
  if (priorImport[0]) {
    console.log(JSON.stringify({ event: "historical_disputes_duplicate", workbookHash: summary.workbookHash, accepted: Number(priorImport[0].accepted_rows || 0), rejected: Number(priorImport[0].rejected_rows || 0), writes: 0 }));
    return;
  }

  const payload = new Uint8Array(await readFile(WORKBOOK));
  const store = new SupabaseCommerceEvidenceStore();
  const stored = await store.putImmutable({ organizationId, connectionId, providerAccountId, sourceObjectType: "historical_dispute_workbook", payload, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  if (!await store.verifyHash({ organizationId, storageReference: stored.storageReference, payloadHash: stored.payloadHash })) throw new Error("Workbook Evidence verification failed.");

  const [run] = await db("commerce_sync_runs", { method: "POST", body: JSON.stringify({ organization_id: organizationId, connection_id: connectionId, provider_account_id: providerAccountId, sync_type: "historical_disputes", mode: "historical_backfill", metadata: { source: "resolution_center_export", workbook_hash: summary.workbookHash, accepted_rows: summary.accepted, rejected_rows: summary.rejected, algorithm_version: "historical-v1" } }) });
  const runId = String(run.id);
  const [evidence] = await db("commerce_evidence_records", { method: "POST", body: JSON.stringify({ organization_id: organizationId, connection_id: connectionId, provider_account_id: providerAccountId, sync_run_id: runId, source_object_type: "historical_dispute_workbook", source_object_id: `workbook:${stored.payloadHash}`, payload_hash: stored.payloadHash, storage_backend: "object_storage", storage_reference: stored.storageReference, content_type: stored.contentType, byte_size: stored.byteSize, observed_at: new Date().toISOString(), normalizer_version: "resolution-center-v1", mapping_version: "historical-v1", pii_classification: "restricted", retention_policy: "commerce-provider-raw-v1", metadata: { immutable: true } }) });
  const evidenceId = String(evidence.id);
  const importId = uuid("commas-dispute-import", summary.workbookHash);
  await db("commerce_historical_dispute_imports?on_conflict=connection_id,provider_account_id,workbook_hash", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ id: importId, account_id: accountId, organization_id: organizationId, connection_id: connectionId, provider_account_id: providerAccountId, sync_run_id: runId, evidence_id: evidenceId, import_identity: `resolution-center:${summary.workbookHash}`, workbook_hash: summary.workbookHash, source_filename: "resolution_center_disputes.xlsx", accepted_rows: summary.accepted, rejected_rows: summary.rejected, metadata: { schema_version: "resolution-center-v1" } }) });

  for (let offset = 0; offset < rows.length; offset += 250) {
    const batch = rows.slice(offset, offset + 250).map((row) => ({ id: uuid("commas-historical-dispute", row.sourceId), account_id: accountId, organization_id: organizationId, connection_id: connectionId, provider_account_id: providerAccountId, import_id: importId, evidence_id: evidenceId, source_row_identity: row.sourceId, source_row_number: row.rowNumber, state: row.state, status: row.status, transaction_date: row.transactionDate.slice(0, 10), dispute_date: row.disputeDate.slice(0, 10), closed_date: row.closedDate?.slice(0, 10) ?? null, customer_email_normalized: row.normalizedEmail, product_evidence: row.product, amount: row.amount, dispute_fee: row.fee, payment_method: row.paymentMethod, reason: row.reason }));
    await db("commerce_historical_disputes?on_conflict=import_id,source_row_identity", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(batch) });
  }
  const reconciliation = await db("rpc/reconcile_commerce_historical_disputes_v1", { method: "POST", body: JSON.stringify({ p_organization_id: organizationId, p_connection_id: connectionId }) });
  await db(`commerce_sync_runs?id=eq.${runId}`, { method: "PATCH", body: JSON.stringify({ status: "completed", started_at: new Date().toISOString(), completed_at: new Date().toISOString(), records_seen: summary.accepted, records_created: summary.accepted, metadata: { source: "resolution_center_export", workbook_hash: summary.workbookHash, algorithm_version: "historical-v1", accepted_rows: summary.accepted, rejected_rows: summary.rejected } }) });
  console.log(JSON.stringify({ event: "historical_disputes_completed", runId, accepted: summary.accepted, rejected: summary.rejected, rejectedFindings: rejected, reconciliation: reconciliation[0] }));
}

async function findDuplicateWorkbook(workbookHash: string): Promise<boolean | "not_checked_scope_unavailable" | "not_checked_database_unavailable"> {
  try {
    const connections = await db("commerce_provider_connections?provider=eq.commas&status=eq.connected&select=id,organization_id&limit=2");
    if (connections.length !== 1) return "not_checked_scope_unavailable";
    const connection = connections[0];
    const accounts = await db(`commerce_provider_accounts?connection_id=eq.${connection.id}&organization_id=eq.${connection.organization_id}&status=eq.active&select=id&limit=2`);
    if (accounts.length !== 1) return "not_checked_scope_unavailable";
    const prior = await db(`commerce_historical_dispute_imports?organization_id=eq.${connection.organization_id}&connection_id=eq.${connection.id}&provider_account_id=eq.${accounts[0].id}&workbook_hash=eq.${workbookHash}&select=id&limit=1`);
    return prior.length > 0;
  } catch {
    return "not_checked_database_unavailable";
  }
}


export function buildPreviewReport(input: { summary: { workbookHash: string; accepted: number; rejected: number; headers: string[] }; rows: HistoricalDisputeRow[]; rejected: Array<{ rowNumber: number; codes: string[] }>; duplicateWorkbook: boolean }) {
  const dates = input.rows.flatMap((row) => [row.transactionDate, row.disputeDate, row.closedDate].filter((value): value is string => Boolean(value))).sort();
  const distribution = (field: "state" | "status") => Object.fromEntries([...input.rows.reduce((counts, row) => counts.set(row[field], (counts.get(row[field]) || 0) + 1), new Map<string, number>())].sort(([a], [b]) => a.localeCompare(b)));
  const productCounts = Object.fromEntries([...input.rows.reduce((counts, row) => counts.set(row.product, (counts.get(row.product) || 0) + 1), new Map<string, number>())].sort(([a], [b]) => a.localeCompare(b)));
  const rejectionCounts = Object.fromEntries([...input.rejected.flatMap((finding) => finding.codes).reduce((counts, code) => counts.set(code, (counts.get(code) || 0) + 1), new Map<string, number>())].sort(([a], [b]) => a.localeCompare(b)));
  const sum = (field: "amount" | "fee") => input.rows.reduce((total, row) => total + (row[field] ? Number(row[field]) : 0), 0).toFixed(2);
  return {
    event: "historical_disputes_preview",
    writes: 0,
    providerRequests: 0,
    reconciliationCalls: 0,
    schedulerActivity: false,
    workbookRecognized: input.summary.headers.length > 0,
    approvedContract: input.summary.headers.length === 12,
    workbookHash: input.summary.workbookHash,
    totalDataRows: input.summary.accepted + input.summary.rejected,
    acceptedRows: input.summary.accepted,
    rejectedRows: input.summary.rejected,
    rejectionCounts,
    duplicateWorkbook: input.duplicateWorkbook,
    dateRange: dates.length ? { first: dates[0], last: dates[dates.length - 1] } : null,
    stateDistribution: distribution("state"),
    statusDistribution: distribution("status"),
    currencies: { present: [], source: "Currency is not a column in the approved Resolution Center workbook contract." },
    disputedAmountsWithoutCurrency: { amount: sum("amount"), fee: sum("fee"), safeToAggregate: false },
    productCounts,
  };
}

if (process.argv[1]?.endsWith("import-commas-historical-disputes.ts")) void main();
