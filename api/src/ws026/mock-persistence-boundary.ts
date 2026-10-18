/**
 * WS-026 M2-A3 mock-only boundary orchestration.
 * These interfaces describe agreed calls, NOT deployed or authoritative writers.
 * Never pass these adapters production database credentials.
 */
import { decideExactOrderPersonLink, type ScopedOrder, type ScopedCustomerIdentity, type ScopedPerson } from "./exact-order-person-link.ts";
import { calculateLandedCogs, type CostLine, type CostRule } from "./landed-cogs.ts";

export type AuthorizedScope = { organizationId: string; connectionId: string; providerAccountId: string; actorId: string };
export type IdentityRequest = {
  authorizedScope: AuthorizedScope;
  canonicalOrderId: string;
  providerOrderId: string;
  providerCustomerId: string;
  evidenceId: string;
  idempotencyKey: string;
  recoveryAuthorizationId?: string;
};
export type IdentityOutcome =
  | { status: "linked" | "unchanged"; personId: string }
  | { status: "unresolved"; reason: "missing_identity" | "missing_person" | "invalid_input" }
  | { status: "conflict"; reason: "ambiguous_identity" | "foreign_scope" | "conflicting_person" | "idempotency_conflict" | "authorization_denied" };

export type CostRulePublishRequest = {
  authorizedScope: AuthorizedScope;
  exactProductReference: string;
  currency: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  unitCostDecimal: string;
  quantityBasis: "package";
  provenance: string;
  idempotencyKey: string;
};
export type CostRulePublishOutcome =
  | { status: "published" | "unchanged"; ruleVersionId: string }
  | { status: "unresolved" | "conflict"; reason: string };
export type LineCostApplyRequest = {
  authorizedScope: AuthorizedScope;
  canonicalOrderId: string;
  orderLineId: string;
  expectedLineVersion: string;
  ruleVersionId: string;
  idempotencyKey: string;
  correctionAuthorizationId?: string;
  supersedesApplicationId?: string;
};
export type LineCostApplyOutcome =
  | { status: "applied" | "unchanged"; applicationId: string }
  | { status: "unresolved" | "conflict"; reason: string };
export type PersistenceBoundary = {
  resolveAndAttachNext29OrderPerson(input: IdentityRequest): Promise<IdentityOutcome>;
  publishCostRuleVersion(input: CostRulePublishRequest): Promise<CostRulePublishOutcome>;
  applyOrderLineCostVersion(input: LineCostApplyRequest): Promise<LineCostApplyOutcome>;
};
export type IdentityEvidence = { order: ScopedOrder; identities: readonly ScopedCustomerIdentity[]; people: readonly ScopedPerson[] };
export type IdentityAdapterResult =
  | IdentityOutcome
  | { status: "unresolved"; reason: "missing_identity" | "missing_person" | "invalid_input" }
  | { status: "conflict"; reason: "ambiguous_identity" | "foreign_scope" | "conflicting_person" };

export async function requestExactIdentityLink(
  boundary: PersistenceBoundary, request: IdentityRequest, evidence: IdentityEvidence,
): Promise<IdentityAdapterResult> {
  if (evidence.order.organizationId !== request.authorizedScope.organizationId ||
      evidence.order.connectionId !== request.authorizedScope.connectionId ||
      evidence.order.providerAccountId !== request.authorizedScope.providerAccountId ||
      evidence.order.canonicalOrderId !== request.canonicalOrderId ||
      !request.providerOrderId || !request.evidenceId || !request.idempotencyKey ||
      !request.authorizedScope.actorId) return { status: "conflict", reason: "foreign_scope" };
  const decision = decideExactOrderPersonLink(evidence.order, request.providerCustomerId, evidence.identities, evidence.people);
  if (decision.status === "unavailable") {
    if (decision.reason === "missing_identity" || decision.reason === "missing_person" || decision.reason === "invalid_input")
      return { status: "unresolved", reason: decision.reason };
    return { status: "conflict", reason: decision.reason };
  }
  // Revalidate at the authoritative writer even when advisory decision says already_linked.
  const outcome = await boundary.resolveAndAttachNext29OrderPerson(request);
  if (outcome.status === "linked" && decision.status === "already_linked")
    return { status: "conflict", reason: "conflicting_person" };
  return outcome;
}
export function previewCostLine(line: CostLine, rules: readonly CostRule[]) {
  return calculateLandedCogs(line, rules);
}
