create table if not exists public.mcp_external_mutation_audit(
 execution_id uuid primary key,organization_id uuid not null,provider text not null,operation text not null,controlled_target text not null,mutation_object_type text not null,created_external_id text not null,rollback_external_id text not null,create_verified boolean not null,rollback_verified boolean not null,net_provider_configuration_mutation boolean not null,audit_correlation_id text not null,idempotency_key text not null,executed_by uuid,executed_at timestamptz not null default now(),evidence jsonb not null default '{}'::jsonb,
 check(provider='shopify'),check(operation='controlled_webhook_create_delete_proof'),check(created_external_id=rollback_external_id),check(create_verified),check(rollback_verified),check(not net_provider_configuration_mutation),unique(organization_id,idempotency_key)
);
alter table public.mcp_external_mutation_audit enable row level security;
revoke all on table public.mcp_external_mutation_audit from anon,authenticated;
grant select,insert on table public.mcp_external_mutation_audit to service_role;
create or replace function public.record_mcp_external_mutation_audit(p_execution_id uuid,p_organization_id uuid,p_provider text,p_operation text,p_controlled_target text,p_mutation_object_type text,p_created_external_id text,p_rollback_external_id text,p_create_verified boolean,p_rollback_verified boolean,p_net_provider_configuration_mutation boolean,p_audit_correlation_id text,p_idempotency_key text,p_executed_by uuid,p_executed_at timestamptz,p_evidence jsonb)
returns uuid language plpgsql security definer set search_path=public as $$ begin
 insert into public.mcp_external_mutation_audit(execution_id,organization_id,provider,operation,controlled_target,mutation_object_type,created_external_id,rollback_external_id,create_verified,rollback_verified,net_provider_configuration_mutation,audit_correlation_id,idempotency_key,executed_by,executed_at,evidence)
 values(p_execution_id,p_organization_id,p_provider,p_operation,p_controlled_target,p_mutation_object_type,p_created_external_id,p_rollback_external_id,p_create_verified,p_rollback_verified,p_net_provider_configuration_mutation,p_audit_correlation_id,p_idempotency_key,p_executed_by,p_executed_at,coalesce(p_evidence,'{}'::jsonb))
 on conflict(organization_id,idempotency_key) do nothing;
 return(select execution_id from public.mcp_external_mutation_audit where organization_id=p_organization_id and idempotency_key=p_idempotency_key);
end $$;
revoke all on function public.record_mcp_external_mutation_audit(uuid,uuid,text,text,text,text,text,text,boolean,boolean,boolean,text,text,uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.record_mcp_external_mutation_audit(uuid,uuid,text,text,text,text,text,text,boolean,boolean,boolean,text,text,uuid,timestamptz,jsonb) to service_role;
