/** WS-026 M2-B1: read-only, source-preserving customer journey assembly. */
export type JourneyEventKind = "purchase" | "upsell" | "refund" | "reversal" | "subscription" | "rebill" | "other";
export type JourneyEvent = {
  id: string; organizationId: string; journeyId: string; source: string; sourceEventId: string;
  occurredAt: string; kind: JourneyEventKind; commerceOrderId: string | null;
  parentEventId: string | null; attributionId: string | null; evidenceId: string;
};
export type JourneyRecord = { id: string; organizationId: string; personId: string; startedAt: string };
export type JourneyOrderLink = {
  organizationId: string; canonicalOrderId: string; journeyId: string; evidenceId: string;
  status: "verified" | "observed" | "ambiguous";
};
export type JourneyReadResult =
  | { status: "ready"; journeys: Array<{ journey: JourneyRecord; events: JourneyEvent[] }>; nextCursor: string | null; unresolved: string[] }
  | { status: "unresolved"; reason: "missing_person" | "ambiguous_order_link" | "conflicting_source_event" | "stale_source" | "invalid_scope" };

export function assembleJourneys(input: {
  organizationId: string; personId: string | null; journeys: readonly JourneyRecord[];
  links: readonly JourneyOrderLink[]; events: readonly JourneyEvent[];
  orderId?: string; cursor?: string; pageSize?: number; sourceCurrent: boolean;
}): JourneyReadResult {
  const { organizationId, personId } = input;
  if (!organizationId || input.journeys.some(j => j.organizationId !== organizationId) ||
      input.links.some(l => l.organizationId !== organizationId) ||
      input.events.some(e => e.organizationId !== organizationId)) return { status: "unresolved", reason: "invalid_scope" };
  if (!personId) return { status: "unresolved", reason: "missing_person" };
  if (!input.sourceCurrent) return { status: "unresolved", reason: "stale_source" };
  const journeys = input.journeys.filter(j => j.personId === personId);
  const journeyIds = new Set(journeys.map(j => j.id));
  if (journeyIds.size !== journeys.length) return { status: "unresolved", reason: "invalid_scope" };
  let selected = journeys;
  if (input.orderId) {
    const matches = input.links.filter(l => l.canonicalOrderId === input.orderId && journeyIds.has(l.journeyId) && l.status !== "ambiguous");
    if (input.links.some(l => l.canonicalOrderId === input.orderId && l.status === "ambiguous") ||
        new Set(matches.map(l => l.journeyId)).size > 1) return { status: "unresolved", reason: "ambiguous_order_link" };
    selected = journeys.filter(j => matches.some(m => m.journeyId === j.id));
  }
  const ids = new Map<string, JourneyEvent>();
  for (const event of input.events) {
    if (!journeyIds.has(event.journeyId)) continue;
    const key = event.source + ":" + event.sourceEventId;
    const existing = ids.get(key);
    if (existing && JSON.stringify(existing) !== JSON.stringify(event))
      return { status: "unresolved", reason: "conflicting_source_event" };
    ids.set(key, event);
  }
  const allowed = new Set(selected.map(j => j.id));
  const sorted = [...ids.values()].filter(e => allowed.has(e.journeyId)).sort((a, b) =>
    a.occurredAt.localeCompare(b.occurredAt) || a.source.localeCompare(b.source) || a.sourceEventId.localeCompare(b.sourceEventId));
  const size = input.pageSize ?? 50;
  if (!Number.isSafeInteger(size) || size < 1 || size > 100) return { status: "unresolved", reason: "invalid_scope" };
  const start = input.cursor ? sorted.findIndex(e => e.id === input.cursor) + 1 : 0;
  if (input.cursor && start === 0) return { status: "unresolved", reason: "invalid_scope" };
  const page = sorted.slice(start, start + size);
  const pageIds = new Set(page.map(e => e.id));
  return {
    status: "ready",
    journeys: selected.map(j => ({ journey: j, events: page.filter(e => e.journeyId === j.id) })),
    nextCursor: start + size < sorted.length ? page.at(-1)?.id ?? null : null,
    unresolved: input.orderId && !selected.length ? ["missing_order_journey_link"] : [],
  };
}
