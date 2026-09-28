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
 executionAvailable:boolean;
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
export type M12PlanCapabilityInput={proposedOperation:{type:string}|null;requiredPermission:string;confirmation:{required:boolean}};
export function resolveM12PlanCapability(plan:M12PlanCapabilityInput){
 if(!plan.proposedOperation)return{bound:false,executionAvailable:false,reason:"Plan has no proposed operation."} as const;
 const binding=assessM12ActionBinding(plan.proposedOperation.type);
 if(!binding.bound)return binding;
 const capability=binding.capability;
 if(capability.exposure!=="plan_only")return{bound:false,executionAvailable:false,reason:"Controlled proof capabilities cannot be resolved from reusable action plans."} as const;
 if(plan.requiredPermission!==capability.requiredPermission)return{bound:false,executionAvailable:false,reason:"Plan permission does not match the registered capability."} as const;
 if(plan.confirmation.required!==capability.humanConfirmationRequired)return{bound:false,executionAvailable:false,reason:"Plan confirmation requirement does not match the registered capability."} as const;
 return{bound:true,executionAvailable:false,capability,reason:"Plan is bound to its exact governed capability; execution exposure remains disabled."} as const;
}
export type M12RegistryBackedEligibilityInput={plan:M12PlanCapabilityInput;planUnchanged:boolean;actionPermissionGranted:boolean;prerequisitesSatisfied:boolean;humanConfirmationValid:boolean};
export function evaluateM12RegistryBackedEligibility(input:M12RegistryBackedEligibilityInput){
 const binding=resolveM12PlanCapability(input.plan),checks={planUnchanged:input.planUnchanged,actionPermissionGranted:input.actionPermissionGranted,prerequisitesSatisfied:input.prerequisitesSatisfied,humanConfirmationValid:input.humanConfirmationValid,capabilityBound:binding.bound,executionCapabilityEnabled:binding.executionAvailable};
 const governanceSatisfied=checks.planUnchanged&&checks.actionPermissionGranted&&checks.prerequisitesSatisfied&&checks.humanConfirmationValid&&checks.capabilityBound;
 const reasons:string[]=[];if(!checks.planUnchanged)reasons.push("Plan identity changed.");if(!checks.actionPermissionGranted)reasons.push("Required action permission is not granted.");if(!checks.prerequisitesSatisfied)reasons.push("Plan prerequisites are not satisfied.");if(!checks.humanConfirmationValid)reasons.push("Fresh confirmation bound to the exact plan and target is required.");if(!checks.capabilityBound)reasons.push(binding.reason);if(!checks.executionCapabilityEnabled)reasons.push("Registered capability does not expose execution.");
 return{state:governanceSatisfied&&checks.executionCapabilityEnabled?"eligible":"blocked" as const,eligible:false,checks,reasons,executionAvailable:false as const};
}
