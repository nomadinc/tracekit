import type{TraceKitSessionContext}from"@/lib/identity/persistent-types";import{inspectCommasTestDeliveryReadiness}from"./m14-commas-target-resolver";import{inspectShopifyControlledProofReadiness}from"./m15-shopify-controlled-proof-readiness";import{resolveM12ActionCapability}from"./action-capability-registry";import{assessM16ProviderActionExposure,resolveM16ProviderActionContract}from"./provider-action-contract";

export type ProviderActionDiscoveryItem={operation:string;provider:string;available:boolean;state:"available"|"not_ready"|"contract_blocked";requiredPermission:string;humanConfirmationRequired:boolean;verification:string;recovery:string;targetResolution:"server_resolved_exact_target";reason:string};

export async function discoverGovernedProviderActions(session:TraceKitSessionContext,appOrigin?:string):Promise<{organizationId:string;actions:ProviderActionDiscoveryItem[]}>{
 const specs=[
  {operation:"commas.webhook_test_delivery",readiness:()=>inspectCommasTestDeliveryReadiness(session)},
  {operation:"shopify.controlled_webhook_create_delete_proof",readiness:()=>inspectShopifyControlledProofReadiness(session,appOrigin)},
 ] as const;
 const actions:ProviderActionDiscoveryItem[]=[];
 for(const spec of specs){
  const capability=resolveM12ActionCapability(spec.operation),contract=resolveM16ProviderActionContract(spec.operation),exposure=capability?assessM16ProviderActionExposure(capability):null;
  if(!capability||!contract||!exposure?.exposed){actions.push({operation:spec.operation,provider:capability?.provider||contract?.provider||"unknown",available:false,state:"contract_blocked",requiredPermission:capability?.requiredPermission||contract?.requiredPermission||"actions.execute",humanConfirmationRequired:true,verification:capability?.verification||contract?.verification||"unknown",recovery:capability?.recovery||contract?.recovery||"unknown",targetResolution:"server_resolved_exact_target",reason:"Governed provider-action contract is unavailable or does not match capability metadata."});continue;}
  if(!session.effectivePermissions.includes(contract.requiredPermission)){actions.push({operation:contract.operation,provider:contract.provider,available:false,state:"not_ready",requiredPermission:contract.requiredPermission,humanConfirmationRequired:contract.humanConfirmationRequired,verification:contract.verification,recovery:contract.recovery,targetResolution:contract.targetResolution,reason:"Required action permission is not granted in the active organization."});continue;}
  const readiness=await spec.readiness();
  actions.push({operation:contract.operation,provider:contract.provider,available:Boolean(readiness.ready),state:readiness.ready?"available":"not_ready",requiredPermission:contract.requiredPermission,humanConfirmationRequired:contract.humanConfirmationRequired,verification:contract.verification,recovery:contract.recovery,targetResolution:contract.targetResolution,reason:readiness.ready?"Exact server-resolved provider target is ready; prepare and fresh human confirmation are still required before execution.":"Exact server-resolved provider target is not currently ready."});
 }
 return{organizationId:session.activeOrganization!.id,actions};
}
