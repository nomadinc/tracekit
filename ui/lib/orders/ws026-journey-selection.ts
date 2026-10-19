/** WS-026 M2-C: fail-closed journey selection for an existing order.
 * A journey is selectable only when an explicit canonical-order reference
 * appears on the scoped order or an authoritative relationship row.
 * Attribution and event timestamps are never order relationship evidence.
 */
export type OrderJourneyCandidate = { id: string; organization_id?: string | null; workspace_id?: string | null };
export type OrderJourneyReference = { canonical_order_id: string; journey_id: string; organization_id?: string | null; workspace_id?: string | null; status?: string | null; evidence_id?: string | null };
export type OrderJourneyResolution =
  | { status: "linked"; journeyId: string }
  | { status: "unresolved"; reason: "missing_order_id" | "missing_link" | "missing_journey" | "ambiguous_link" | "foreign_scope" };
export function resolveOrderJourney(input: {
  canonicalOrderId: string | null; organizationId: string | null; workspaceId: string;
  journeys: readonly OrderJourneyCandidate[]; references: readonly OrderJourneyReference[];
}): OrderJourneyResolution {
  if (!input.canonicalOrderId) return { status: "unresolved", reason: "missing_order_id" };
  if (!input.workspaceId || !input.organizationId) return { status: "unresolved", reason: "foreign_scope" };
  const scoped = (r: { organization_id?: string | null; workspace_id?: string | null }) =>
    (!r.organization_id || r.organization_id === input.organizationId) &&
    (!r.workspace_id || r.workspace_id === input.workspaceId);
  const candidates = input.references.filter(r => r.canonical_order_id === input.canonicalOrderId);
  if (candidates.some(r => !scoped(r))) return { status: "unresolved", reason: "foreign_scope" };
  if (candidates.some(r => r.status === "ambiguous")) return { status: "unresolved", reason: "ambiguous_link" };
  const verified = candidates.filter(r => r.status === "verified" && Boolean(r.journey_id) && Boolean(r.evidence_id?.trim()));
  const ids = Array.from(new Set(verified.map(r => r.journey_id)));
  if (ids.length > 1) return { status: "unresolved", reason: "ambiguous_link" };
  if (!ids.length) return { status: "unresolved", reason: "missing_link" };
  const matches = input.journeys.filter(j => j.id === ids[0]);
  if (matches.length !== 1 || !scoped(matches[0])) return { status: "unresolved", reason: "missing_journey" };
  return { status: "linked", journeyId: ids[0] };
}
