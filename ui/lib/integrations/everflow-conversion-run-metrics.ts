import "server-only";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";

type EvidenceRow = {
  id?: unknown;
  sync_run_id?: unknown;
  evidence_id?: unknown;
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

export async function mergeEverflowSyncRunMetadata(input: {
  connectionId: string;
  syncRunId: string;
  values: Record<string, unknown>;
}) {
  const rows = await commercePersistenceRequest(
    `commerce_sync_runs?id=eq.${encodeURIComponent(input.syncRunId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&select=metadata&limit=1`,
  ) as Array<{ metadata?: unknown }>;
  const metadata = rows[0]?.metadata && typeof rows[0].metadata === "object" && !Array.isArray(rows[0].metadata)
    ? rows[0].metadata as Record<string, unknown>
    : {};
  const currentEverflow = metadata.everflow && typeof metadata.everflow === "object" && !Array.isArray(metadata.everflow)
    ? metadata.everflow as Record<string, unknown>
    : {};

  await commercePersistenceRequest(
    `commerce_sync_runs?id=eq.${encodeURIComponent(input.syncRunId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        metadata: {
          ...metadata,
          everflow: {
            ...currentEverflow,
            ...input.values,
          },
        },
      }),
    },
  );
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
    `everflow_conversion_events?connection_id=eq.${encodeURIComponent(input.connectionId)}&sync_run_id=eq.${encodeURIComponent(input.syncRunId)}&ingestion_method=eq.api&select=provider_account_id,source_identity,payload_hash,evidence_id&order=id.asc`,
  );
  const evidence = await loadAllEvidenceRows(
    `commerce_evidence_records?connection_id=eq.${encodeURIComponent(input.connectionId)}&source_object_type=eq.everflow_conversion&select=id,sync_run_id&order=id.asc`,
  );
  const evidenceRunById = new Map(evidence.map((row) => [String(row.id || ""), String(row.sync_run_id || "")]));

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let evidenceWrites = 0;
  let evidenceReuses = 0;
  for (const row of observed) {
    const priorHash = input.baseline.get(keyFor(row));
    const currentHash = String(row.payload_hash || "");
    if (priorHash === undefined) created += 1;
    else if (priorHash === currentHash) unchanged += 1;
    else updated += 1;

    const evidenceId = String(row.evidence_id || "");
    const evidenceSyncRunId = evidenceRunById.get(evidenceId);
    if (!evidenceId || evidenceSyncRunId === undefined) {
      throw new Error("Everflow conversion evidence metrics could not resolve evidence ownership.");
    }
    if (evidenceSyncRunId === input.syncRunId) evidenceWrites += 1;
    else evidenceReuses += 1;
  }

  if (evidenceWrites + evidenceReuses !== observed.length) {
    throw new Error("Everflow conversion evidence metrics were inconsistent.");
  }

  await commercePersistenceRequest(
    `commerce_sync_runs?id=eq.${encodeURIComponent(input.syncRunId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        records_created: created,
        records_updated: updated,
        records_unchanged: unchanged,
        evidence_writes: evidenceWrites,
        evidence_reuses: evidenceReuses,
      }),
    },
  );
  return { created, updated, unchanged, evidenceWrites, evidenceReuses };
}
