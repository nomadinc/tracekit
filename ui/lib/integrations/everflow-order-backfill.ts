import "server-only";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";

type Row = Record<string, unknown>;

export type EverflowOrderBackfillBatch = {
  connectionId: string;
  processed: number;
  matched: number;
  ambiguous: number;
  unmatched: number;
  remaining: number;
};

function integer(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

export async function runEverflowOrderBackfillBatches(options: {
  batchSize?: number;
  connectionLimit?: number;
} = {}) {
  const batchSize = Math.min(500, Math.max(1, Math.trunc(Number(options.batchSize ?? 250))));
  const connectionLimit = Math.min(25, Math.max(1, Math.trunc(Number(options.connectionLimit ?? 10))));
  const connections = await commercePersistenceRequest(
    `commerce_provider_connections?provider=eq.everflow&status=eq.connected&select=id&order=created_at.asc&limit=${connectionLimit}`,
  ) as Row[];

  const results: EverflowOrderBackfillBatch[] = [];
  for (const connection of connections) {
    const connectionId = String(connection.id || "").trim();
    if (!connectionId) continue;
    const rows = await commercePersistenceRequest("rpc/run_everflow_order_reconciliation_batch_v1", {
      method: "POST",
      body: JSON.stringify({ p_connection_id: connectionId, p_limit: batchSize }),
    }) as Row[];
    const row = rows[0] || {};
    results.push({
      connectionId,
      processed: integer(row.processed),
      matched: integer(row.matched),
      ambiguous: integer(row.ambiguous),
      unmatched: integer(row.unmatched),
      remaining: integer(row.remaining),
    });
  }

  return {
    processed: results.reduce((sum, item) => sum + item.processed, 0),
    matched: results.reduce((sum, item) => sum + item.matched, 0),
    ambiguous: results.reduce((sum, item) => sum + item.ambiguous, 0),
    unmatched: results.reduce((sum, item) => sum + item.unmatched, 0),
    remaining: results.reduce((sum, item) => sum + item.remaining, 0),
    results,
  };
}
