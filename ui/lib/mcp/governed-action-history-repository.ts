import "server-only";
import { supabaseAuthHeaders } from "@/lib/commerce/supabase-auth";
import { certifiedHistoricalEvidence } from "./m3-certification-evidence";
import { projectGovernedActionHistory, type GovernedActionHistory } from "./governed-action-history";

type Row=Record<string,unknown>;
function cfg(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,""),key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error("governed_action_history_unavailable");return{url,key};}
async function read(path:string):Promise<Row[]>{const{url,key}=cfg(),response=await fetch(`${url}/rest/v1/${path}`,{cache:"no-store",headers:supabaseAuthHeaders(key)});if(!response.ok)throw new Error("governed_action_history_unavailable");return response.json();}
const one=(rows:Row[])=>rows[0]||null;

export class GovernedActionHistoryRepository{
  async readForOrganization(organizationId:string,intentId:string):Promise<GovernedActionHistory|null>{
    const intent=one(await read(`mcp_action_intents?organization_id=eq.${encodeURIComponent(organizationId)}&intent_id=eq.${encodeURIComponent(intentId)}&select=intent_id,organization_id,actor_user_id,plan_identity,operation,target_kind,target,plan,audit_correlation_id,issued_at,expires_at&limit=1`));
    if(!intent)return null;
    const correlation=String(intent.audit_correlation_id),actorId=String(intent.actor_user_id);
    const [organizations,actors,confirmations,recoveries,authorizations,auditEvents]=await Promise.all([
      read(`tracekit_organizations?id=eq.${encodeURIComponent(organizationId)}&select=id,name&limit=1`),
      read(`tracekit_users?id=eq.${encodeURIComponent(actorId)}&select=id,display_name&limit=1`),
      read(`mcp_action_confirmations?organization_id=eq.${encodeURIComponent(organizationId)}&intent_id=eq.${encodeURIComponent(intentId)}&select=confirmation_id,intent_id,organization_id,actor_user_id,confirmed_at,expires_at&order=confirmed_at.asc&limit=2`),
      read(`mcp_shopify_mutation_recovery?organization_id=eq.${encodeURIComponent(organizationId)}&intent_id=eq.${encodeURIComponent(intentId)}&select=recovery_id,organization_id,intent_id,plan_identity,state,created_external_id,created_verified,rollback_verified,audit_correlation_id,created_at,updated_at&limit=1`),
      read(`mcp_action_authorizations?organization_id=eq.${encodeURIComponent(organizationId)}&audit_correlation_id=eq.${encodeURIComponent(correlation)}&select=authorization_id,organization_id,envelope_identity,idempotency_key,audit_correlation_id,state,expires_at,envelope_created_at,consumed_at,consumption_id,created_at&order=created_at.asc&limit=2`),
      read(`tracekit_audit_events?organization_id=eq.${encodeURIComponent(organizationId)}&correlation_id=eq.${encodeURIComponent(correlation)}&select=id,action,result,occurred_at,correlation_id&order=occurred_at.asc,id.asc&limit=100`),
    ]);
    const authorization=one(authorizations),envelope=authorization?String(authorization.envelope_identity):null,idempotency=authorization?String(authorization.idempotency_key):null;
    const [executions,mutationAudits]=authorization?await Promise.all([
      read(`mcp_action_execution_results?organization_id=eq.${encodeURIComponent(organizationId)}&envelope_identity=eq.${encodeURIComponent(envelope!)}&idempotency_key=eq.${encodeURIComponent(idempotency!)}&audit_correlation_id=eq.${encodeURIComponent(correlation)}&select=id,organization_id,envelope_identity,idempotency_key,audit_correlation_id,consumption_id,result,created_at&order=created_at.asc&limit=2`),
      read(`mcp_external_mutation_audit?organization_id=eq.${encodeURIComponent(organizationId)}&idempotency_key=eq.${encodeURIComponent(idempotency!)}&audit_correlation_id=eq.${encodeURIComponent(correlation)}&select=execution_id,organization_id,provider,operation,controlled_target,created_external_id,rollback_external_id,create_verified,rollback_verified,net_provider_configuration_mutation,audit_correlation_id,idempotency_key,executed_by,executed_at&limit=2`),
    ]):[[],[]];
    if(confirmations.length>1||recoveries.length>1||authorizations.length>1||executions.length>1||mutationAudits.length>1)throw new Error("governed_action_history_ambiguous");
    return projectGovernedActionHistory({intent,organization:one(organizations)||{id:organizationId,name:"Unknown organization"},actor:one(actors),confirmation:one(confirmations),authorization,execution:one(executions),recovery:one(recoveries),mutationAudit:one(mutationAudits),auditEvents,certification:certifiedHistoricalEvidence(intentId)});
  }
}
