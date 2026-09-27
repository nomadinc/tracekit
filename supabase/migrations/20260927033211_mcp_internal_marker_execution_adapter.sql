create table if not exists public.mcp_action_execution_markers (
  organization_id uuid not null,
  envelope_identity text not null,
  idempotency_key text not null,
  consumption_id uuid not null,
  marker_value text not null,
  audit_correlation_id text not null,
  created_at timestamptz not null default now(),
  reverted_at timestamptz,
  primary key (organization_id,envelope_identity),
  unique (organization_id,idempotency_key)
);
alter table public.mcp_action_execution_markers enable row level security;
revoke all on table public.mcp_action_execution_markers from anon,authenticated;
grant select,insert,update on table public.mcp_action_execution_markers to service_role;

create or replace function public.execute_mcp_internal_marker(
 p_authorization_id uuid,p_organization_id uuid,p_envelope_identity text,p_idempotency_key text,p_audit_correlation_id text,p_consumption_id uuid,p_marker_value text,p_requested_at timestamptz
) returns table(decision text,marker_value text,created_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare a public.mcp_action_authorizations%rowtype; m public.mcp_action_execution_markers%rowtype;
begin
 select x.* into a from public.mcp_action_authorizations x where x.authorization_id=p_authorization_id and x.organization_id=p_organization_id for update;
 if not found or a.state<>'consumed' or a.envelope_identity<>p_envelope_identity or a.idempotency_key<>p_idempotency_key or a.audit_correlation_id<>p_audit_correlation_id or a.consumption_id<>p_consumption_id then
   return query select 'reject'::text,null::text,null::timestamptz; return;
 end if;
 select x.* into m from public.mcp_action_execution_markers x where x.organization_id=p_organization_id and x.envelope_identity=p_envelope_identity;
 if found then
   if m.idempotency_key=p_idempotency_key and m.consumption_id=p_consumption_id and m.marker_value=p_marker_value and m.reverted_at is null then return query select 'replay_same_result'::text,m.marker_value,m.created_at;
   else return query select 'reject'::text,null::text,null::timestamptz; end if; return;
 end if;
 insert into public.mcp_action_execution_markers(organization_id,envelope_identity,idempotency_key,consumption_id,marker_value,audit_correlation_id,created_at)
 values(p_organization_id,p_envelope_identity,p_idempotency_key,p_consumption_id,p_marker_value,p_audit_correlation_id,p_requested_at)
 returning * into m;
 return query select 'mutated'::text,m.marker_value,m.created_at;
end $$;
revoke all on function public.execute_mcp_internal_marker(uuid,uuid,text,text,text,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.execute_mcp_internal_marker(uuid,uuid,text,text,text,uuid,text,timestamptz) to service_role;

create or replace function public.revert_mcp_internal_marker(p_organization_id uuid,p_envelope_identity text,p_consumption_id uuid,p_reverted_at timestamptz)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 update public.mcp_action_execution_markers x set reverted_at=p_reverted_at where x.organization_id=p_organization_id and x.envelope_identity=p_envelope_identity and x.consumption_id=p_consumption_id and x.reverted_at is null;
 return found;
end $$;
revoke all on function public.revert_mcp_internal_marker(uuid,text,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.revert_mcp_internal_marker(uuid,text,uuid,timestamptz) to service_role;
