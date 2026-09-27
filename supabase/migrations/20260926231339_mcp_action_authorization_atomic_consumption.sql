create table if not exists public.mcp_action_authorizations (
  authorization_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  envelope_identity text not null,
  idempotency_key text not null,
  audit_correlation_id text not null,
  state text not null default 'available' check (state in ('available','consumed','expired','invalidated')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumption_id uuid,
  created_at timestamptz not null default now(),
  unique (organization_id,envelope_identity,idempotency_key)
);
alter table public.mcp_action_authorizations enable row level security;
revoke all on table public.mcp_action_authorizations from anon, authenticated;
grant select,insert,update on table public.mcp_action_authorizations to service_role;

create or replace function public.consume_mcp_action_authorization(
  p_authorization_id uuid,p_organization_id uuid,p_envelope_identity text,p_idempotency_key text,p_audit_correlation_id text,p_consumption_id uuid,p_requested_at timestamptz
) returns table(decision text,state text,consumption_id uuid,consumed_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare r public.mcp_action_authorizations%rowtype;
begin
  select * into r from public.mcp_action_authorizations where authorization_id=p_authorization_id and organization_id=p_organization_id for update;
  if not found then return query select 'reject'::text,'unavailable'::text,null::uuid,null::timestamptz; return; end if;
  if r.state='consumed' then
    if r.envelope_identity=p_envelope_identity and r.idempotency_key=p_idempotency_key and r.audit_correlation_id=p_audit_correlation_id then return query select 'replay_same_result'::text,r.state,r.consumption_id,r.consumed_at;
    else return query select 'reject'::text,r.state,r.consumption_id,r.consumed_at; end if; return;
  end if;
  if r.state<>'available' or r.expires_at<=p_requested_at or r.envelope_identity<>p_envelope_identity or r.idempotency_key<>p_idempotency_key or r.audit_correlation_id<>p_audit_correlation_id then
    update public.mcp_action_authorizations set state=case when expires_at<=p_requested_at then 'expired' else 'invalidated' end where authorization_id=r.authorization_id;
    return query select 'reject'::text,(case when r.expires_at<=p_requested_at then 'expired' else 'invalidated' end)::text,null::uuid,null::timestamptz; return;
  end if;
  update public.mcp_action_authorizations set state='consumed',consumed_at=p_requested_at,consumption_id=p_consumption_id where authorization_id=r.authorization_id and state='available';
  return query select 'consume'::text,'consumed'::text,p_consumption_id,p_requested_at;
end $$;
revoke all on function public.consume_mcp_action_authorization(uuid,uuid,text,text,text,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.consume_mcp_action_authorization(uuid,uuid,text,text,text,uuid,timestamptz) to service_role;
