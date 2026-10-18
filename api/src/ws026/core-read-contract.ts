/**
 * WS-026 M2-B3: read-only Core customer detail contract inspection.
 * Never joins orders to journeys using temporal proximity or array position.
 * This adapter intentionally returns unresolved relationships until explicit
 * authoritative order/journey link evidence is available.
 */
export type CoreJourneySummary = { id: string; person_id?: string | null; workspace_id?: string | null };
export type CoreOrderSummary = {
  canonical_order_id?: string | null; id?: string | null;
  person_id?: string | null; workspace_id?: string | null;
};
export type CoreCustomerDetail = {
  customer?: { id?: string; workspace_id?: string | null };
  journeys?: CoreJourneySummary[];
  orders?: CoreOrderSummary[];
  summary?: { total_journeys?: number; total_orders?: number };
};
export type CoreOrderJourneyLink = {
  canonicalOrderId: string; journeyId: string; workspaceId: string;
  status: "verified" | "observed" | "ambiguous"; evidenceId: string;
};
export type CoreReadContractResult =
  | { status: "ready"; personId: string; journeyIds: string[]; orderJourneys: Array<{ canonicalOrderId: string; journeyId: string | null; state: "linked" | "unresolved" }>; gaps: string[] }
  | { status: "unavailable"; reason: "invalid_scope" | "missing_person" | "ambiguous_link" | "duplicate_journey" };

export function inspectCoreCustomerRead(input: {
  workspaceId: string; detail: CoreCustomerDetail; links: readonly CoreOrderJourneyLink[];
}): CoreReadContractResult {
  const { workspaceId, detail, links } = input;
  if (!workspaceId || !detail.customer?.id) return { status: "unavailable", reason: "missing_person" };
  const personId = detail.customer.id;
  const journeys = detail.journeys ?? [];
  const orders = detail.orders ?? [];
  if ((detail.customer.workspace_id && detail.customer.workspace_id !== workspaceId) ||
      journeys.some(j => j.workspace_id && j.workspace_id !== workspaceId || j.person_id && j.person_id !== personId) ||
      orders.some(o => o.workspace_id && o.workspace_id !== workspaceId || o.person_id && o.person_id !== personId) ||
      links.some(l => l.workspaceId !== workspaceId))
    return { status: "unavailable", reason: "invalid_scope" };
  const journeyIds = journeys.map(j => j.id);
  if (journeyIds.some(id => !id) || new Set(journeyIds).size !== journeyIds.length)
    return { status: "unavailable", reason: "duplicate_journey" };
  const allowed = new Set(journeyIds);
  const orderJourneys: Array<{ canonicalOrderId: string; journeyId: string | null; state: "linked" | "unresolved" }> = [];
  for (const order of orders) {
    const id = order.canonical_order_id;
    if (!id) continue; // UI order ID alone is not authoritative commerce identity.
    const matching = links.filter(l => l.canonicalOrderId === id);
    if (matching.some(l => l.status === "ambiguous") ||
        new Set(matching.filter(l => l.status === "verified").map(l => l.journeyId)).size > 1)
      return { status: "unavailable", reason: "ambiguous_link" };
    const verified = matching.filter(l => l.status === "verified" && allowed.has(l.journeyId) && Boolean(l.evidenceId));
    const selected = verified.length === 1 ? verified[0].journeyId : null;
    orderJourneys.push({ canonicalOrderId: id, journeyId: selected, state: selected ? "linked" : "unresolved" });
  }
  const gaps = [
    ...(!journeys.length ? ["no_canonical_journeys"] : []),
    ...(!orders.length ? ["no_orders"] : []),
    ...(orders.some(o => !o.canonical_order_id) ? ["missing_canonical_order_id"] : []),
    ...(orderJourneys.some(o => o.state === "unresolved") ? ["missing_verified_order_journey_link"] : []),
    ...(detail.summary?.total_journeys !== undefined && detail.summary.total_journeys > journeys.length ? ["journey_list_incomplete"] : []),
    ...(detail.summary?.total_orders !== undefined && detail.summary.total_orders > orders.length ? ["order_list_incomplete"] : []),
  ];
  return { status: "ready", personId, journeyIds, orderJourneys, gaps };
}
