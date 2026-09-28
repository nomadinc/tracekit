create table public.mcp_action_execution_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tracekit_organizations(id),
  envelope_identity text not null,
  idempotency_key text not null,
  audit_correlation_id text not null,
  consumption_id text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  constraint mcp_action_execution_results_envelope_identity_check check (length(envelope_identity) between 1 and 200),
  constraint mcp_action_execution_results_idempotency_key_check check (length(idempotency_key) between 1 and 200),
  constraint mcp_action_execution_results_audit_correlation_check check (length(audit_correlation_id) between 1 and 200),
  constraint mcp_action_execution_results_consumption_check check (length(consumption_id) between 1 and 200),
  unique (organization_id,envelope_identity,idempotency_key,audit_correlation_id),
  unique (organization_id,consumption_id)
);
alter table public.mcp_action_execution_results enable row level security;
revoke all on table public.mcp_action_execution_results from public,anon,authenticated,authenticator;
grant select,insert on table public.mcp_action_execution_results to service_role;

create or replace function public.guard_mcp_action_execution_result_immutability()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  raise exception 'mcp action execution results are immutable';
end;
$$;
create trigger guard_mcp_action_execution_result_immutability
before update or delete on public.mcp_action_execution_results
for each row execute function public.guard_mcp_action_execution_result_immutability();

revoke all on function public.guard_mcp_action_execution_result_immutability() from public,anon,authenticated,authenticator;
