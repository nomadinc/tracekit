/** WS-026 M2-C: bounded read-only Core timeline cursor collector.
 * Core provides keyset next_cursor, not a stable source snapshot watermark.
 * Never label this as snapshot-stable; explicitly surface that limitation.
 */
export type CoreTimelinePage = { events?: unknown[]; next_cursor?: string | null };
export type CoreTimelineCollection =
 | { status: "complete" | "limited"; events: unknown[]; nextCursor: string | null; limitation: string | null }
 | { status: "unavailable"; reason: "invalid_page" | "cursor_cycle" | "duplicate_conflict"; events: [] };
export async function collectCoreTimelinePages(
 fetchPage: (cursor: string | null) => Promise<CoreTimelinePage>,
 maxPages = 5,
): Promise<CoreTimelineCollection> {
 if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 20)
  return { status: "unavailable", reason: "invalid_page", events: [] };
 const cursors = new Set<string>();
 const seen = new Map<string, unknown>();
 let cursor: string | null = null;
 for (let i = 0; i < maxPages; i++) {
  const page = await fetchPage(cursor);
  if (!page || !Array.isArray(page.events) ||
      (page.next_cursor !== null && page.next_cursor !== undefined && typeof page.next_cursor !== "string"))
   return { status: "unavailable", reason: "invalid_page", events: [] };
  for (const item of page.events) {
   if (!item || typeof item !== "object") return { status: "unavailable", reason: "invalid_page", events: [] };
   const record = item as Record<string, unknown>;
   if (typeof record.id !== "string" || !record.id) return { status: "unavailable", reason: "invalid_page", events: [] };
   const previous = seen.get(record.id);
   if (previous && JSON.stringify(previous) !== JSON.stringify(item))
    return { status: "unavailable", reason: "duplicate_conflict", events: [] };
   seen.set(record.id, item);
  }
  const next = page.next_cursor || null;
  if (!next) return { status: "complete", events: Array.from(seen.values()), nextCursor: null, limitation: "No snapshot watermark; late source changes may alter later pages." };
  if (next === cursor || cursors.has(next)) return { status: "unavailable", reason: "cursor_cycle", events: [] };
  cursors.add(next);
  cursor = next;
 }
 return { status: "limited", events: Array.from(seen.values()), nextCursor: cursor,
  limitation: "Page budget reached; Core cursor is not a stable snapshot." };
}
