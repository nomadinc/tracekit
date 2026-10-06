export const PRODUCTION_V1_EVIDENCE_STAGES = [
  "detection", "eligibility", "preparation", "exact_target", "permission",
  "explicit_confirmation", "execution", "verification", "replay_idempotency",
  "durable_audit_history", "safe_failure",
] as const;

export type ProductionV1EvidenceStage = typeof PRODUCTION_V1_EVIDENCE_STAGES[number];
export type ProductionV1Classification = "production_proven" | "engineering_ready_not_live_proven" | "read_only_finding" | "not_supported";

export const PRODUCTION_V1_ACTION_MATRIX = [
  { provider: "shopify", operation: "shopify.controlled_webhook_create_delete_proof", classification: "production_proven", executable: true },
  { provider: "shopify", operation: "repair_ingestion_webhooks", classification: "read_only_finding", executable: false },
  { provider: "everflow", operation: "bounded_manual_sync", classification: "read_only_finding", executable: false },
  { provider: "everflow", operation: "generic_provider_mutation", classification: "not_supported", executable: false },
  { provider: "commas", operation: "commas.webhook_test_delivery", classification: "engineering_ready_not_live_proven", executable: false },
  { provider: "commas", operation: "create_webhook_subscription", classification: "not_supported", executable: false },
] as const satisfies readonly {provider:string;operation:string;classification:ProductionV1Classification;executable:boolean}[];

export type IntelligenceRuntimeEnvironment = Record<string, string | undefined>;
type ToggleState = "enabled" | "disabled" | "unset" | "invalid";

function toggleState(value:string|undefined):ToggleState {
  if(value===undefined||value.trim()==="")return "unset";
  const normalized=value.trim().toLowerCase();
  if(normalized==="enabled"||normalized==="disabled")return normalized;
  return "invalid";
}

export function productionV1ActionEnvironmentKey(operation:string){
  return `TRACEKIT_INTELLIGENCE_ACTION_${operation.replace(/[^a-z0-9]+/gi,"_").toUpperCase()}`;
}

function enabledUnlessDisabledOrInvalid(value:string|undefined){
  const state=toggleState(value);
  return state==="enabled"||state==="unset";
}

export function assessIntelligenceEvaluation(env:IntelligenceRuntimeEnvironment=process.env){
  const state=toggleState(env.TRACEKIT_INTELLIGENCE_EVALUATION);
  if(state==="disabled")return{allowed:false,reason:"intelligence_evaluation_disabled"}as const;
  if(state==="invalid")return{allowed:false,reason:"intelligence_evaluation_setting_invalid"}as const;
  return{allowed:true,reason:"evaluation_enabled"}as const;
}

export function assessIntelligenceAction(operation:string,env:IntelligenceRuntimeEnvironment=process.env){
  const entry=PRODUCTION_V1_ACTION_MATRIX.find(item=>item.operation===operation);
  if(!entry)return{allowed:false,reason:"operation_not_in_production_v1_matrix",entry:null}as const;
  if(!entry.executable)return{allowed:false,reason:`classification_${entry.classification}`,entry}as const;
  if(!enabledUnlessDisabledOrInvalid(env.TRACEKIT_INTELLIGENCE_MUTATIONS)){
    const state=toggleState(env.TRACEKIT_INTELLIGENCE_MUTATIONS);
    return{allowed:false,reason:state==="invalid"?"intelligence_mutations_setting_invalid":"intelligence_mutations_disabled",entry}as const;
  }
  const providerValue=env[`TRACEKIT_INTELLIGENCE_PROVIDER_${entry.provider.toUpperCase()}`];
  if(!enabledUnlessDisabledOrInvalid(providerValue)){
    const state=toggleState(providerValue);
    return{allowed:false,reason:state==="invalid"?"provider_action_family_setting_invalid":"provider_action_family_disabled",entry}as const;
  }
  const actionValue=env[productionV1ActionEnvironmentKey(operation)];
  if(!enabledUnlessDisabledOrInvalid(actionValue)){
    const state=toggleState(actionValue);
    return{allowed:false,reason:state==="invalid"?"provider_action_setting_invalid":"provider_action_disabled",entry}as const;
  }
  return{allowed:true,reason:"production_v1_action_enabled",entry}as const;
}

export const PRODUCTION_V1_GOVERNED_NOTIFICATION_CONTRACT = [
  { event:"awaiting_approval",channel:"notification_center",dedupe:"action_intent_id",priority:"high" },
  { event:"execution_failure",channel:"notification_center",dedupe:"execution_result_identity",priority:"urgent" },
  { event:"verification_failure",channel:"notification_center",dedupe:"recovery_or_intent_identity",priority:"urgent" },
] as const;

export const PRODUCTION_V1_NOTIFICATION_CONTRACT = [
  { event:"important_new_finding",channel:"notification_center",dedupe:"work_item_source_key",priority:"severity" },
  ...PRODUCTION_V1_GOVERNED_NOTIFICATION_CONTRACT,
  { event:"recurrence",channel:"notification_center",dedupe:"work_item_source_key",priority:"severity" },
  { event:"important_evidence_or_provider_health_failure",channel:"notification_center",dedupe:"provider_finding_key",priority:"high" },
] as const;
