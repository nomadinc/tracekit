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
const disabled = (value: string | undefined) => value?.trim().toLowerCase() === "disabled";
const enabled = (value: string | undefined) => value?.trim().toLowerCase() === "enabled";
const actionKey = (operation: string) => `TRACEKIT_INTELLIGENCE_ACTION_${operation.replace(/[^a-z0-9]+/gi, "_").toUpperCase()}`;

export function assessIntelligenceEvaluation(env: IntelligenceRuntimeEnvironment = process.env) {
  const allowed = !disabled(env.TRACEKIT_INTELLIGENCE_EVALUATION);
  return { allowed, reason: allowed ? "evaluation_enabled" : "intelligence_evaluation_disabled" } as const;
}

export function assessIntelligenceAction(operation: string, env: IntelligenceRuntimeEnvironment = process.env) {
  const entry = PRODUCTION_V1_ACTION_MATRIX.find((item) => item.operation === operation);
  if (!entry) return { allowed: false, reason: "operation_not_in_production_v1_matrix", entry: null } as const;
  if (!entry.executable) {
    const evidenceOverride = entry.classification === "engineering_ready_not_live_proven" && enabled(env[actionKey(operation)]);
    if (!evidenceOverride) return { allowed: false, reason: `classification_${entry.classification}`, entry } as const;
  }
  if (disabled(env.TRACEKIT_INTELLIGENCE_MUTATIONS)) return { allowed: false, reason: "intelligence_mutations_disabled", entry } as const;
  if (disabled(env[`TRACEKIT_INTELLIGENCE_PROVIDER_${entry.provider.toUpperCase()}`])) return { allowed: false, reason: "provider_action_family_disabled", entry } as const;
  if (disabled(env[actionKey(operation)])) return { allowed: false, reason: "provider_action_disabled", entry } as const;
  return { allowed: true, reason: "production_v1_action_enabled", entry } as const;
}

export const PRODUCTION_V1_NOTIFICATION_CONTRACT = [
  { event: "important_new_finding", channel: "notification_center", dedupe: "work_item_source_key", priority: "severity" },
  { event: "awaiting_approval", channel: "notification_center", dedupe: "action_intent_id", priority: "high" },
  { event: "execution_failure", channel: "notification_center", dedupe: "execution_or_intent_id", priority: "urgent" },
  { event: "verification_failure", channel: "notification_center", dedupe: "execution_id", priority: "urgent" },
  { event: "recurrence", channel: "notification_center", dedupe: "work_item_source_key", priority: "severity" },
  { event: "important_evidence_or_provider_health_failure", channel: "notification_center", dedupe: "provider_finding_key", priority: "high" },
] as const;

