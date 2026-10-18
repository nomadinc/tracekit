/**
 * WS-026 M2-A1: bounded read-only historical identity recovery planning.
 * No database writes, provider reimport, person creation, or attribution updates.
 * Each decision must be revalidated at an authorized persistence boundary.
 */
import { decideExactOrderPersonLink, type ScopedOrder, type ScopedCustomerIdentity, type ScopedPerson, type IdentityDecision } from "./exact-order-person-link.ts";

export type HistoricalIdentityCandidate = {
  order: ScopedOrder;
  providerCustomerId: string | null;
};
export type HistoricalIdentityReview = {
  canonicalOrderId: string;
  decision: IdentityDecision;
};
export type HistoricalIdentityPlan = {
  status: "review_only";
  organizationId: string;
  total: number;
  linkable: number;
  alreadyLinked: number;
  unresolved: number;
  decisions: HistoricalIdentityReview[];
};

export function planHistoricalOrderPersonLinks(
  organizationId: string,
  candidates: readonly HistoricalIdentityCandidate[],
  identities: readonly ScopedCustomerIdentity[],
  people: readonly ScopedPerson[],
): HistoricalIdentityPlan {
  if (!organizationId || candidates.length > 1000)
    throw new Error("invalid_historical_identity_plan_scope");
  const seen = new Set<string>();
  const decisions: HistoricalIdentityReview[] = [];
  for (const candidate of candidates) {
    const id = candidate.order.canonicalOrderId;
    if (!id || seen.has(id) || candidate.order.organizationId !== organizationId)
      throw new Error("invalid_historical_identity_plan_scope");
    seen.add(id);
    decisions.push({ canonicalOrderId: id, decision: decideExactOrderPersonLink(candidate.order, candidate.providerCustomerId, identities, people) });
  }
  return {
    status: "review_only", organizationId, total: decisions.length,
    linkable: decisions.filter(x => x.decision.status === "link").length,
    alreadyLinked: decisions.filter(x => x.decision.status === "already_linked").length,
    unresolved: decisions.filter(x => x.decision.status === "unavailable").length,
    decisions,
  };
}
