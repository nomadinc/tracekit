/**
 * WS-026 M2-A4 — exact WS-001 development candidate interface compatibility.
 * Type-only contract: no runtime dependency, credentials, database writes or activation.
 * Align with b566427506ac5c84808f34d25a38ca221fea1de3.
 */
export type Ws001AuthorizedScope = Readonly<{ organizationId: string; connectionId: string; providerAccountId: string }>;
export type Ws001IdentityRequest = {
  authorizedScope: Ws001AuthorizedScope; canonicalOrderId: string; providerOrderId: string;
  providerCustomerId: string | null; evidenceId: string; idempotencyKey: string;
  recoveryAuthorizationId?: string;
};
export type Ws001PublishCostRequest = {
  authorizedScope: Ws001AuthorizedScope; exactProductReference: string; currency: string;
  effectiveFrom: string; effectiveUntil: string | null; unitCostDecimal: string;
  quantityBasis: "per_unit"; provenanceEvidenceId: string; idempotencyKey: string;
  supersedesRuleVersionId?: string; ruleCorrectionAuthorizationId?: string;
};
export type Ws001ApplyCostRequest = {
  authorizedScope: Ws001AuthorizedScope; canonicalOrderId: string; orderLineId: string;
  expectedLineVersion: string; ruleVersionId: string; idempotencyKey: string;
  correctionAuthorizationId?: string; supersedesApplicationId?: string;
};
export type Ws001IdentityResult =
  | { outcome: "linked" | "unchanged"; personId: string }
  | { outcome: "unresolved"; reason: string };
export type Ws001WriteErrorCode = "denied" | "conflict" | "invalid" | "unavailable";
export interface Ws001PersistencePort {
  resolveAndAttachNext29OrderPerson(input: Ws001IdentityRequest): Promise<Ws001IdentityResult>;
  publishCostRuleVersion(input: Ws001PublishCostRequest): Promise<{ outcome: "published"; ruleVersionId: string }>;
  readOrderLineCostVersion(input: { authorizedScope: Ws001AuthorizedScope; canonicalOrderId: string; orderLineId: string }): Promise<{ expectedLineVersion: string }>;
  applyOrderLineCostVersion(input: Ws001ApplyCostRequest): Promise<{ outcome: "applied"; applicationId: string; totalCostDecimal: string; currency: string }>;
}
export type Ws026BoundaryOutcome =
  | { status: "linked" | "unchanged"; personId: string }
  | { status: "unresolved"; reason: string }
  | { status: "blocked"; reason: Ws001WriteErrorCode };

/** Preserve the actual writer's outcome/error semantics; never convert conflicts into retries. */
export async function invokeWs001IdentityPort(port: Ws001PersistencePort, input: Ws001IdentityRequest): Promise<Ws026BoundaryOutcome> {
  try {
    const result = await port.resolveAndAttachNext29OrderPerson(input);
    if (result.outcome === "unresolved") return { status: "unresolved", reason: result.reason };
    return { status: result.outcome, personId: result.personId };
  } catch (error) {
    const code = (error as { code?: unknown })?.code;
    if (code === "denied" || code === "conflict" || code === "invalid" || code === "unavailable")
      return { status: "blocked", reason: code };
    throw error;
  }
}
/** Version must be obtained from server reader, never computed from JS timestamps. */
export async function applyWithServerLineVersion(
  port: Ws001PersistencePort,
  input: Omit<Ws001ApplyCostRequest, "expectedLineVersion">,
) {
  const version = await port.readOrderLineCostVersion({
    authorizedScope: input.authorizedScope, canonicalOrderId: input.canonicalOrderId, orderLineId: input.orderLineId,
  });
  return port.applyOrderLineCostVersion({ ...input, expectedLineVersion: version.expectedLineVersion });
}
