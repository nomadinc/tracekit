export type EvidenceAvailability = "available" | "partial" | "unavailable" | "certification_artifact_only";

export type LifecycleEvidence = {
  availability: EvidenceAvailability;
  sourceType: string;
  sourceIds: string[];
  timestamp: string | null;
  note?: string;
};

export type GovernedActionHistory = {
  organization: { id: string; name: string };
  intent: {
    id: string; operation: string; provider: string; actor: { id: string; name: string | null };
    targetKind: string | null; target: Record<string, string | null>; planIdentity: string;
    issuedAt: string; expiresAt: string; auditCorrelationId: string;
  };
  confirmation: null | { id: string; actor: { id: string; name: string | null }; confirmedAt: string; expiresAt: string };
  authorization: null | { id: string; state: string; expiresAt: string; envelopeCreatedAt: string | null; consumptionId: string | null; consumedAt: string | null };
  execution: null | { persistenceId: string; executionId: string | null; status: string | null; createdAt: string; providerObjectId: string | null; createVerified: boolean | null; rollbackObjectId: string | null; rollbackVerified: boolean | null; netProviderConfigurationMutation: boolean | null };
  recovery: null | { id: string; state: string; providerObjectId: string | null; createVerified: boolean; rollbackVerified: boolean; updatedAt: string };
  replay: {
    envelopeIdentity: string | null; idempotencyKey: string | null; durableResultReusable: boolean;
    observedReplay: LifecycleEvidence;
  };
  independentProviderReadBack: LifecycleEvidence;
  readiness: LifecycleEvidence;
  durableAuditEvents: Array<{ id: string; action: string; result: string; occurredAt: string; correlationId: string }>;
  stages: Record<string, LifecycleEvidence>;
  finalStatus: "prepared" | "confirmed" | "authorized" | "executed" | "rollback_verified" | "failed";
};

const text = (value: unknown) => typeof value === "string" && value ? value : null;
const bool = (value: unknown) => typeof value === "boolean" ? value : null;
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export type GovernedActionHistoryRows = {
  intent: Record<string, unknown>; organization: Record<string, unknown>; actor: Record<string, unknown> | null;
  confirmation: Record<string, unknown> | null; authorization: Record<string, unknown> | null;
  execution: Record<string, unknown> | null; recovery: Record<string, unknown> | null;
  mutationAudit: Record<string, unknown> | null; auditEvents: Record<string, unknown>[];
  certification: { providerReadBack: LifecycleEvidence; replayOccurrence: LifecycleEvidence } | null;
};

export function projectGovernedActionHistory(rows: GovernedActionHistoryRows): GovernedActionHistory {
  const i=rows.intent,c=rows.confirmation,a=rows.authorization,e=rows.execution,r=rows.recovery,m=rows.mutationAudit;
  const result=object(e?.result), executionId=text(result.executionId)||text(object(result.audit).executionId)||text(m?.execution_id);
  const createdExternalId=text(result.createdExternalId)||text(r?.created_external_id)||text(m?.created_external_id);
  const rollbackExternalId=text(result.rollbackExternalId)||text(m?.rollback_external_id);
  const target=object(i.target);
  const provider=text(object(i.plan).provider)||String(i.operation||"").split(".")[0]||"unknown";
  const available=(sourceType:string,sourceIds:string[],timestamp:string|null,note?:string):LifecycleEvidence=>({availability:"available",sourceType,sourceIds,timestamp,...(note?{note}:{})});
  const unavailable=(note:string):LifecycleEvidence=>({availability:"unavailable",sourceType:"none",sourceIds:[],timestamp:null,note});
  const stages:Record<string,LifecycleEvidence>={
    readiness:{availability:"partial",sourceType:"tracekit_audit_events",sourceIds:[],timestamp:null,note:"A readiness observation exists for the certified organization, but it is not deterministically linked to this intent."},
    preparation:available("mcp_action_intents",[String(i.intent_id)],text(i.issued_at)),
    target_binding:available("mcp_action_intents",[String(i.intent_id),String(i.plan_identity)],text(i.issued_at)),
    confirmation:c?available("mcp_action_confirmations",[String(c.confirmation_id)],text(c.confirmed_at)):unavailable("No durable confirmation."),
    authorization:a?available("mcp_action_authorizations",[String(a.authorization_id)],text(a.created_at)||text(a.envelope_created_at)):unavailable("No durable authorization."),
    consumption:a?.consumption_id?available("mcp_action_authorizations",[String(a.authorization_id),String(a.consumption_id)],text(a.consumed_at)):unavailable("Authorization was not consumed."),
    execution:e?available("mcp_action_execution_results",[String(e.id),...(executionId?[executionId]:[])],text(e.created_at)):unavailable("No durable execution result."),
    verification:(e||r||m)?available("governed_action_verification",Array.from(new Set([text(e?.id),text(r?.recovery_id),text(m?.execution_id)].filter(Boolean) as string[])),text(m?.executed_at)||text(r?.updated_at)||text(e?.created_at)):unavailable("No durable verification evidence."),
    rollback:r?.rollback_verified?available("mcp_shopify_mutation_recovery",[String(r.recovery_id)],text(r.updated_at)):unavailable("Rollback verification is unavailable."),
    independent_provider_read_back:rows.certification?.providerReadBack||unavailable("No independently linked provider read-back record."),
    replay:rows.certification?.replayOccurrence||(a?.state==="consumed"&&e?available("durable_replay_contract",[String(a.authorization_id),String(e.id)],text(e.created_at),"The durable result is replayable; no observed replay event is stored."):unavailable("No durable replay evidence.")),
    idempotency:a?available("mcp_action_authorizations",[String(a.authorization_id),String(a.idempotency_key)],text(a.created_at)||text(a.envelope_created_at)):unavailable("No durable idempotency identity."),
    durable_audit_history:(m||rows.auditEvents.length)?available("durable_audit",[...rows.auditEvents.map(x=>String(x.id)),...(m?[String(m.execution_id)]:[])],text(m?.executed_at)||text(rows.auditEvents.at(-1)?.occurred_at)):unavailable("No deterministically correlated audit record."),
  };
  const finalStatus:GovernedActionHistory["finalStatus"]=r?.rollback_verified?"rollback_verified":e?(text(result.status)==="completed"?"executed":"failed"):a?.state==="consumed"?"authorized":c?"confirmed":"prepared";
  return {
    organization:{id:String(i.organization_id),name:String(rows.organization.name||"Unknown organization")},
    intent:{id:String(i.intent_id),operation:String(i.operation),provider,actor:{id:String(i.actor_user_id),name:rows.actor?text(rows.actor.display_name):null},targetKind:text(i.target_kind),target:{connectionId:text(target.connectionId),shopDomain:text(target.shopDomain),callbackUrl:text(target.callbackUrl),topic:text(target.topic)},planIdentity:String(i.plan_identity),issuedAt:String(i.issued_at),expiresAt:String(i.expires_at),auditCorrelationId:String(i.audit_correlation_id)},
    confirmation:c?{id:String(c.confirmation_id),actor:{id:String(c.actor_user_id),name:String(c.actor_user_id)===String(i.actor_user_id)&&rows.actor?text(rows.actor.display_name):null},confirmedAt:String(c.confirmed_at),expiresAt:String(c.expires_at)}:null,
    authorization:a?{id:String(a.authorization_id),state:String(a.state),expiresAt:String(a.expires_at),envelopeCreatedAt:text(a.envelope_created_at),consumptionId:text(a.consumption_id),consumedAt:text(a.consumed_at)}:null,
    execution:e?{persistenceId:String(e.id),executionId,status:text(result.status),createdAt:String(e.created_at),providerObjectId:createdExternalId,createVerified:bool(result.createVerified)??bool(r?.created_verified)??bool(m?.create_verified),rollbackObjectId:rollbackExternalId,rollbackVerified:bool(result.rollbackVerified)??bool(r?.rollback_verified)??bool(m?.rollback_verified),netProviderConfigurationMutation:bool(result.netProviderConfigurationMutation)??bool(m?.net_provider_configuration_mutation)}:null,
    recovery:r?{id:String(r.recovery_id),state:String(r.state),providerObjectId:text(r.created_external_id),createVerified:Boolean(r.created_verified),rollbackVerified:Boolean(r.rollback_verified),updatedAt:String(r.updated_at)}:null,
    replay:{envelopeIdentity:text(a?.envelope_identity),idempotencyKey:text(a?.idempotency_key),durableResultReusable:Boolean(a?.state==="consumed"&&e&&text(result.status)==="completed"),observedReplay:rows.certification?.replayOccurrence||unavailable("No durable action-level replay occurrence was recorded.")},
    independentProviderReadBack:rows.certification?.providerReadBack||unavailable("No independently linked provider read-back record."),
    readiness:stages.readiness,
    durableAuditEvents:[...rows.auditEvents].sort((x,y)=>String(x.occurred_at).localeCompare(String(y.occurred_at))||String(x.id).localeCompare(String(y.id))).map(x=>({id:String(x.id),action:String(x.action),result:String(x.result),occurredAt:String(x.occurred_at),correlationId:String(x.correlation_id)})),
    stages,finalStatus,
  };
}
