import{resolveM12ActionCapability}from"./action-capability-registry";
export type M12AcceptanceProofAuthorization={allowed:boolean;operation:"inspect_evidence";provider:"tracekit";targetKind:"journey_evidence";mutationClass:"none";reason:string};
export function authorizeM12AcceptanceProof(input:{operation:string;proofFlag:string|undefined}):M12AcceptanceProofAuthorization{
 const c=resolveM12ActionCapability(input.operation);
 const allowed=input.proofFlag==="m12-inspect-evidence-v1"&&c?.operation==="inspect_evidence"&&c.provider==="tracekit"&&c.targetKind==="journey_evidence"&&c.mutationClass==="none"&&c.exposure==="plan_only"&&c.executionAvailable===false;
 return{allowed,operation:"inspect_evidence",provider:"tracekit",targetKind:"journey_evidence",mutationClass:"none",reason:allowed?"Bounded M12 acceptance proof is authorized without changing reusable registry exposure.":"Acceptance proof authorization failed closed."};
}
