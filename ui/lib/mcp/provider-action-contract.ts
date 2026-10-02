import type{GovernedActionCapability}from"./action-capability-registry";

export type GovernedProviderActionContract={
 operation:GovernedActionCapability["operation"];
 provider:GovernedActionCapability["provider"];
 targetKind:GovernedActionCapability["targetKind"];
 mutationClass:GovernedActionCapability["mutationClass"];
 verification:GovernedActionCapability["verification"];
 recovery:GovernedActionCapability["recovery"];
 exposure:GovernedActionCapability["exposure"];
 requiredPermission:GovernedActionCapability["requiredPermission"];
 humanConfirmationRequired:true;
 executionAvailable:boolean;
 targetResolution:"server_resolved_exact_target";
 durableIntent:true;
 durableAuthorization:true;
 durableReplay:true;
};

export const M16_PROVIDER_ACTION_CONTRACTS:readonly GovernedProviderActionContract[]=[
 {operation:"commas.webhook_test_delivery",provider:"commas",targetKind:"commas_webhook_subscription",mutationClass:"external_side_effect",verification:"provider_response",recovery:"not_applicable",exposure:"controlled_proof_only",requiredPermission:"actions.execute",humanConfirmationRequired:true,executionAvailable:true,targetResolution:"server_resolved_exact_target",durableIntent:true,durableAuthorization:true,durableReplay:true},
 {operation:"shopify.controlled_webhook_create_delete_proof",provider:"shopify",targetKind:"shopify_webhook_subscription",mutationClass:"provider_configuration",verification:"provider_read_back",recovery:"reversible",exposure:"controlled_proof_only",requiredPermission:"actions.execute",humanConfirmationRequired:true,executionAvailable:true,targetResolution:"server_resolved_exact_target",durableIntent:true,durableAuthorization:true,durableReplay:true},
] as const;

export function resolveM16ProviderActionContract(operation:string){
 return M16_PROVIDER_ACTION_CONTRACTS.find(contract=>contract.operation===operation)||null;
}

export function validateM16ProviderActionContract(capability:GovernedActionCapability){
 const contract=resolveM16ProviderActionContract(capability.operation);
 if(!contract)return{valid:false,reason:"provider_action_contract_unavailable"} as const;
 const valid=contract.provider===capability.provider&&contract.targetKind===capability.targetKind&&contract.mutationClass===capability.mutationClass&&contract.verification===capability.verification&&contract.recovery===capability.recovery&&contract.exposure===capability.exposure&&contract.requiredPermission===capability.requiredPermission&&contract.humanConfirmationRequired===capability.humanConfirmationRequired&&contract.executionAvailable===capability.executionAvailable;
 return valid?{valid:true,contract} as const:{valid:false,reason:"provider_action_contract_capability_mismatch"} as const;
}

export function assessM16ProviderActionExposure(capability:GovernedActionCapability){const validation=validateM16ProviderActionContract(capability);if(!validation.valid)return{exposed:false,reason:validation.reason} as const;const contract=validation.contract;const exposed=contract.exposure==="controlled_proof_only"&&contract.executionAvailable&&contract.humanConfirmationRequired&&contract.targetResolution==="server_resolved_exact_target"&&contract.durableIntent&&contract.durableAuthorization&&contract.durableReplay;return exposed?{exposed:true,contract} as const:{exposed:false,reason:"provider_action_contract_governance_incomplete"} as const;}
