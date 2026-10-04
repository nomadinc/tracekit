import { PRODUCTION_V1_EVIDENCE_STAGES, type ProductionV1EvidenceStage } from "./production-v1-policy";

export const PRODUCTION_V1_SCENARIOS = [
  "organization_context", "current_evidence_evaluation", "healthy_no_action", "actionable_finding",
  "unsupported_action_suppression", "confirmation_rbac", "execute_exactly_once", "verification",
  "durable_lifecycle_history", "replay", "failure_path", "tenant_negative_access", "operational_telemetry",
] as const;
export type ProductionV1Scenario = typeof PRODUCTION_V1_SCENARIOS[number];
export type AcceptanceEvidence = { scenario: ProductionV1Scenario; passed: boolean; evidenceRefs: string[]; observedAt: string };

export function evaluateProductionV1Acceptance(input:{organizationId:string;actionOperation:string;stages:Partial<Record<ProductionV1EvidenceStage,string[]>>;scenarios:AcceptanceEvidence[]}) {
  const missingStages = PRODUCTION_V1_EVIDENCE_STAGES.filter((stage) => !input.stages[stage]?.length);
  const byScenario = new Map(input.scenarios.map((row) => [row.scenario, row]));
  const missingScenarios = PRODUCTION_V1_SCENARIOS.filter((scenario) => !byScenario.has(scenario));
  const failedScenarios = input.scenarios.filter((row) => !row.passed || row.evidenceRefs.length === 0).map((row) => row.scenario);
  const certifiable = Boolean(input.organizationId && input.actionOperation && missingStages.length === 0 && missingScenarios.length === 0 && failedScenarios.length === 0);
  return { version:"production_v1_acceptance_v1", organizationId:input.organizationId, actionOperation:input.actionOperation, certifiable, missingStages, missingScenarios, failedScenarios, evidenceProducedAt:new Date().toISOString() };
}

export type IntelligenceLifecycleRecord = {kind:"finding"|"recommendation"|"intent"|"confirmation"|"execution"|"verification"|"resolution"|"failure";id:string;occurredAt:string;evidenceRef:string};
export function projectIntelligenceLifecycle(records:IntelligenceLifecycleRecord[]) {
  return [...records].sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt));
}

