export type GovernedActionCapability={
 operation:"inspect_evidence"|"commas.webhook_test_delivery"|"shopify.controlled_webhook_create_delete_proof";
 provider:"tracekit"|"commas"|"shopify";
 mutationClass:"none"|"external_side_effect"|"provider_configuration";
 targetKind:"journey_evidence"|"commas_webhook_subscription"|"shopify_webhook_subscription";
 requiredPermission:"customers.view"|"actions.execute";
 humanConfirmationRequired:boolean;
 verification:"retained_evidence"|"provider_response"|"provider_read_back";
 recovery:"not_applicable"|"reversible";
 exposure:"plan_only"|"controlled_proof_only";
 executionAvailable:false;
 evidence:string[];
};
export const M12_ACTION_CAPABILITIES:readonly GovernedActionCapability[]=[
 {operation:"inspect_evidence",provider:"tracekit",mutationClass:"none",targetKind:"journey_evidence",requiredPermission:"customers.view",humanConfirmationRequired:true,verification:"retained_evidence",recovery:"not_applicable",exposure:"plan_only",executionAvailable:false,evidence:["M9 plans map eligible diagnostic recommendations to inspect_evidence.","M10 bounded adapter proved execution and independent verification semantics."]},
 {operation:"commas.webhook_test_delivery",provider:"commas",mutationClass:"external_side_effect",targetKind:"commas_webhook_subscription",requiredPermission:"actions.execute",humanConfirmationRequired:true,verification:"provider_response",recovery:"not_applicable",exposure:"controlled_proof_only",executionAvailable:false,evidence:["M11 proved governed external transport execution without provider configuration mutation."]},
 {operation:"shopify.controlled_webhook_create_delete_proof",provider:"shopify",mutationClass:"provider_configuration",targetKind:"shopify_webhook_subscription",requiredPermission:"actions.execute",humanConfirmationRequired:true,verification:"provider_read_back",recovery:"reversible",exposure:"controlled_proof_only",executionAvailable:false,evidence:["M11 Production proof verified create/read-back/delete/absence and durable net-zero audit evidence."]}
] as const;
export function resolveM12ActionCapability(operation:string){return M12_ACTION_CAPABILITIES.find(c=>c.operation===operation)||null;}
export function assessM12ActionBinding(operation:string){
 const capability=resolveM12ActionCapability(operation);
 if(!capability)return{bound:false,executionAvailable:false,reason:"No governed operation-specific capability is registered."} as const;
 return{bound:true,executionAvailable:false,capability,reason:capability.exposure==="plan_only"?"Capability is bound for planning but execution exposure is not enabled.":"Capability is retained as controlled proof evidence and is not exposed as a reusable action."} as const;
}
