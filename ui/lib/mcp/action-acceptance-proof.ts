import{resolveM12ActionCapability}from"./action-capability-registry";
export function authorizeM12InspectEvidenceAcceptanceProof(input:{operation:string;serverProofFlag:string|undefined}){
 const c=resolveM12ActionCapability(input.operation);
 const allowed=input.serverProofFlag==="m12-inspect-evidence-v1"&&c?.operation==="inspect_evidence"&&c.provider==="tracekit"&&c.targetKind==="journey_evidence"&&c.mutationClass==="none"&&c.exposure==="plan_only"&&c.executionAvailable===false;
 return{allowed,provider:"tracekit" as const,targetKind:"journey_evidence" as const,mutationClass:"none" as const};
}
