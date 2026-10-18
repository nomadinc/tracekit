/**
 * WS-026 M2-B1: stable read-only timeline pagination against an explicit snapshot.
 * Snapshot token is a trusted source watermark; caller must enforce scope and
 * retrieve data consistently at that watermark. No live DB access here.
 */
export type TimelineRow = {
  id: string; organizationId: string; journeyId: string; source: string;
  sourceEventId: string; occurredAt: string; observedSequence: number;
  kind: "purchase" | "upsell" | "refund" | "reversal" | "subscription" | "rebill" | "other";
  commerceOrderId: string | null; parentEventId: string | null;
  attributionId: string | null; evidenceId: string;
};
export type TimelinePage =
  | { status: "ready"; snapshotSequence: number; rows: TimelineRow[]; nextCursor: string | null }
  | { status: "unavailable"; reason: "invalid_scope" | "invalid_cursor" | "conflicting_event" | "stale_snapshot" };

function key(row: TimelineRow): string {
  return JSON.stringify([row.occurredAt, row.source, row.sourceEventId, row.id]);
}
function encodeCursor(row: TimelineRow): string { return key(row); }
export function pageJourneySnapshot(input: {
  organizationId: string; journeyIds: readonly string[]; rows: readonly TimelineRow[];
  snapshotSequence: number; cursor?: string; pageSize: number;
}): TimelinePage {
  const { organizationId, snapshotSequence, pageSize } = input;
  if (!organizationId || !Number.isSafeInteger(snapshotSequence) || snapshotSequence < 0 ||
      !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100 ||
      new Set(input.journeyIds).size !== input.journeyIds.length ||
      input.rows.some(r => r.organizationId !== organizationId))
    return { status: "unavailable", reason: "invalid_scope" };
  if (input.rows.some(r => !Number.isSafeInteger(r.observedSequence) || r.observedSequence < 0 ||
      !r.id || !r.source || !r.sourceEventId || !r.evidenceId || !Number.isFinite(Date.parse(r.occurredAt))))
    return { status: "unavailable", reason: "invalid_scope" };
  const permitted = new Set(input.journeyIds);
  const seen = new Map<string, TimelineRow>();
  for (const row of input.rows) {
    if (!permitted.has(row.journeyId) || row.observedSequence > snapshotSequence) continue;
    const identity = JSON.stringify([row.source, row.sourceEventId]);
    const prior = seen.get(identity);
    if (prior && JSON.stringify(prior) !== JSON.stringify(row))
      return { status: "unavailable", reason: "conflicting_event" };
    seen.set(identity, row);
  }
  const sorted = [...seen.values()].sort((a, b) => key(a).localeCompare(key(b)));
  let start = 0;
  if (input.cursor !== undefined) {
    const index = sorted.findIndex(r => encodeCursor(r) === input.cursor);
    if (index < 0) return { status: "unavailable", reason: "invalid_cursor" };
    start = index + 1;
  }
  const rows = sorted.slice(start, start + pageSize);
  return { status: "ready", snapshotSequence, rows,
    nextCursor: start + pageSize < sorted.length ? encodeCursor(rows[rows.length - 1]) : null };
}
