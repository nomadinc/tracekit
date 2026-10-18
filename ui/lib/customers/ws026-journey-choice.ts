/** WS-026 M2-C: deterministic read-only customer journey selection.
 * No arbitrary first-journey fallback, no inferred commerce relationships.
 */
export type CustomerJourneyChoice = {
  id: string; status: "ready" | "unresolved" | "stale";
  eventCount: number; nextCursor: string | null; explanation: string;
};
export function selectCustomerJourney(
  journeys: readonly CustomerJourneyChoice[], requestedId: string | null,
): { selectedId: string | null; reason: string } {
  const ids = journeys.map(j => j.id);
  if (new Set(ids).size !== ids.length || ids.some(id => !id))
    return { selectedId: null, reason: "Ambiguous canonical journey records" };
  if (requestedId) {
    const match = journeys.find(j => j.id === requestedId);
    return match && match.status === "ready"
      ? { selectedId: match.id, reason: "Explicit journey selection" }
      : { selectedId: null, reason: "Requested journey unavailable or unresolved" };
  }
  const ready = journeys.filter(j => j.status === "ready");
  return ready.length === 1
    ? { selectedId: ready[0].id, reason: "Only verified journey" }
    : { selectedId: null, reason: ready.length ? "Select a journey to inspect" : "No verified canonical journey" };
}
