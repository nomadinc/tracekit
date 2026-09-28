import{resolveM12ActionCapability}from"./action-capability-registry";
export type M12EnablementReadiness={operation:string;ready:boolean;executionAvailable:false;checks:{registered:boolean;planOnly:boolean;nonMutating:boolean;permissionBound:boolean;confirmationRequired:boolean;verificationDefined:boolean;recoveryDefined:boolean;boundedTarget:boolean;adapterRegistryGated:boolean;governedChainAcceptanceProven:boolean;callerSafeOrchestrationImplemented:boolean;durableAuthorizationImplemented:boolean;durableReplayImplemented:boolean};blockers:string[]};
export function assessInspectEvidenceEnablementReadiness():M12EnablementReadiness{
 const c=resolveM12ActionCapability("inspect_evidence");
 const checks={registered:Boolean(c),planOnly:c?.exposure==="plan_only",nonMutating:c?.mutationClass==="none",permissionBound:c?.requiredPermission==="customers.view",confirmationRequired:c?.humanConfirmationRequired===true,verificationDefined:c?.verification==="retained_evidence",recoveryDefined:c?.recovery==="not_applicable",boundedTarget:c?.targetKind==="journey_evidence",adapterRegistryGated:true,governedChainAcceptanceProven:true,callerSafeOrchestrationImplemented:true,durableAuthorizationImplemented:true,durableReplayImplemented:true};
 const blockers:string[]=[];for(const[k,v]of Object.entries(checks))if(!v)blockers.push(`Readiness check failed: ${k}.`);
 blockers.push("No authenticated MCP protocol/tool surface currently accepts a confirmation-bearing inspect_evidence execution request and invokes the governed orchestration.");
 blockers.push("The full durable orchestration chain has not yet been acceptance-proven through that MCP tool surface with execution exposure enabled in a bounded non-provider-mutating proof.");
 return{operation:"inspect_evidence",ready:false,executionAvailable:false,checks,blockers};
}
