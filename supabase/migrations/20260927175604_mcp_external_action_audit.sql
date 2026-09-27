create table if not exists public.mcp_external_action_audit (
  execution_id uuid primary key,
  organization_id uuid not null,
  provider text not null,
  operation text not null,
  event_type text,
  request_id uuid not null unique,
  subscription_id text,
  verification_status text not null check(verification_status in('verified','failed','unresolved')),
  provider_http_status integer,
  provider_api_status text,
  provider_event_sent boolean,
  target_response_status integer,
  provider_configuration_mutation boolean not null default false,
  executed_by uuid,
  executed_at timestamptz not null default now(),
  evidence jsonb not null default '{}'::jsonb
);
alter table public.mcp_external_action_audit enable row level security;
revoke all on table public.mcp_external_action_audit from anon,authenticated;
grant select,insert on table public.mcp_external_action_audit to service_role;
create or replace function public.record_mcp_external_action_audit(
 p_execution_id uuid,p_organization_id uuid,p_provider text,p_operation text,p_event_type text,p_request_id uuid,p_subscription_id text,p_verification_status text,p_provider_http_status integer,p_provider_api_status text,p_provider_event_sent boolean,p_target_response_status integer,p_provider_configuration_mutation boolean,p_executed_by uuid,p_executed_at timestamptz,p_evidence jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
begin
 if p_provider_configuration_mutation then raise exception 'configuration mutation audit requires a mutation-specific contract'; end if;
 insert into public.mcp_external_action_audit(execution_id,organization_id,provider,operation,event_type,request_id,subscription_id,verification_status,provider_http_status,provider_api_status,provider_event_sent,target_response_status,provider_configuration_mutation,executed_by,executed_at,evidence)
 values(p_execution_id,p_organization_id,p_provider,p_operation,p_event_type,p_request_id,p_subscription_id,p_verification_status,p_provider_http_status,p_provider_api_status,p_provider_event_sent,p_target_response_status,false,p_executed_by,p_executed_at,coalesce(p_evidence,'{}'::jsonb))
 on conflict(request_id) do nothing;
 return(select execution_id from public.mcp_external_action_audit where request_id=p_request_id);
end $$;
revoke all on function public.record_mcp_external_action_audit(uuid,uuid,text,text,text,uuid,text,text,integer,text,boolean,integer,boolean,uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.record_mcp_external_action_audit(uuid,uuid,text,text,text,uuid,text,text,integer,text,boolean,integer,boolean,uuid,timestamptz,jsonb) to service_role;
