import "server-only";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";

type EvidenceRow = {
  provider_account_id?: unknown;
  source_identity?: unknown;
  payload_hash?: unknown;
};

const PAGE_SIZE = 1000;
const keyFor = (row: EvidenceRow) => `${String(row.provider_account_id || "")}\u0000${String(row.source_identity || "")}`;

async function loadAllEvidenceRows(path: string) {
  const rows: EvidenceRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const separator = path.includes("?") ? "&" : "?";
    const page = await commercePersistenceRequest(`${path}${separator}limit=${PAGE_SIZE}&offset=${offset}`) as EvidenceRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function captureEverflowConversionBaseline(connectionId: string) {
  const rows = await loadAllEvidenceRows(
    `everflow_conversion_events?connection_id=eq.${encodeURIComponent(connectionId)}&ingestion_method=eq.api&select=provider_account_id,source_identity,payload_hash&order=id.asc`,
  );
  return new Map(rows.map((row) => [keyFor(row), String(row.payload_hash || "")]));
}

export async function finalizeEverflowConversionRunMetrics(input: {
  connectionId: string;
  syncRunId: string;
  baseline: Map<string, string>;
}) {
  const observed = await loadAllEvidenceRows(
    `everflow_conversion_events?connection_id=eq.${encodeURIComponent(input.connectionId)}&sync_run_id=eq.${encodeURIComponent(input.syncRunId)}&ingestion_method=eq.api&select=provider_account_id,source_identity,payload_hash&order=id.asc`,
  );

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  for (const row of observed) {
    const priorHash = input.baseline.get(keyFor(row));
    const currentHash = String(row.payload_hash || "");
    if (priorHash === undefined) created += 1;
    else if (priorHash === currentHash) unchanged += 1;
    else updated += 1;
  }

  await commercePersistenceRequest(
    `commerce_sync_runs?id=eq.${encodeURIComponent(input.syncRunId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ records_created: created, records_updated: updated, records_unchanged: unchanged }),
    },
  );
  return { created, updated, unchanged };
}
