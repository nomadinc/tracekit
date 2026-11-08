/** Dry-run only. No provider client, credential lookup, persistence or financial aggregation. */
export const STEM_PAYPAL_MERCHANT = "3ZHEND749V92J";
type Candidate = { id:string; organizationId:string; connectionId:string; providerAccountId:string; externalReference:string|null; amount:number|null; currency:string|null; status:string; eventType:string };
type Observation = { id:string; organizationId:string; merchantId:string; transactionId:string; amount:number|null; currency:string|null; status:string; kind:"capture"|"refund"|"adjustment"|"attempt" };
export function reconcileStemPaypalReferences(scope: {organizationId:string;connectionId:string;providerAccountId:string;merchantId:string;merchantValidated:boolean}, candidates:Candidate[], observations:Observation[]) {
  return candidates.map(candidate => {
    const base = {candidateId:candidate.id,observationIds:[] as string[]};
    if (candidate.organizationId !== scope.organizationId || candidate.connectionId !== scope.connectionId || candidate.providerAccountId !== scope.providerAccountId) return {...base,state:"scope_conflict" as const};
    if (scope.merchantId !== STEM_PAYPAL_MERCHANT || !scope.merchantValidated) return {...base,state:"merchant_validation_required" as const};
    if (!candidate.externalReference || candidate.eventType !== "debit" || candidate.status !== "succeeded") return {...base,state:"unresolved" as const};
    const exact = observations.filter(o => o.organizationId === scope.organizationId && o.merchantId === STEM_PAYPAL_MERCHANT && o.transactionId === candidate.externalReference && o.kind === "capture" && o.status === "succeeded");
    if (!exact.length) return {...base,state:"unresolved" as const};
    if (exact.length !== 1 || candidate.amount === null || !Number.isFinite(candidate.amount) || !candidate.currency || !/^[A-Z]{3}$/.test(candidate.currency) || exact[0].amount !== candidate.amount || exact[0].currency !== candidate.currency) return {...base,state:"evidence_conflict" as const};
    return {...base,state:"exact_candidate" as const,observationIds:[exact[0].id]};
  });
}
