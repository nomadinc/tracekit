create table if not exists public.mcp_action_authorizations (
 authorization_id uuid primary key default gen_random_uuid(), organization_id uuid not null, envelope_identity text not null, idempotency_key text not null, audit_correlation_id text not null,
 state text not null default 'available' check(state in ('available','consumed','expired','invalidated')), expires_at timestamptz not null, consumed_at timestamptz, consumption_id uuid,
 created_at timestamptz not null default now(), envelope_created_at timestamptz, unique(organization_id,envelope_identity,idempotency_key)
);
alter table public.mcp_action_authorizations enable row level security;
revoke all on table public.mcp_action_authorizations from public,anon,authenticated,authenticator,service_role;
grant select,insert,update on table public.mcp_action_authorizations to service_role;

create or replace function public.consume_mcp_action_authorization(p_authorization_id uuid,p_organization_id uuid,p_envelope_identity text,p_idempotency_key text,p_audit_correlation_id text,p_consumption_id uuid,p_requested_at timestamptz)
returns table(decision text,state text,consumption_id uuid,consumed_at timestamptz) language plpgsql security definer set search_path=public as $$
declare r public.mcp_action_authorizations%rowtype;
begin
 select a.* into r from public.mcp_action_authorizations a where a.authorization_id=p_authorization_id and a.organization_id=p_organization_id for update;
 if not found then return query select 'reject'::text,'unavailable'::text,null::uuid,null::timestamptz; return; end if;
 if r.state='consumed' then if r.envelope_identity=p_envelope_identity and r.idempotency_key=p_idempotency_key and r.audit_correlation_id=p_audit_correlation_id then return query select 'replay_same_result'::text,r.state,r.consumption_id,r.consumed_at; else return query select 'reject'::text,r.state,r.consumption_id,r.consumed_at; end if; return; end if;
 if r.state<>'available' or r.expires_at<=p_requested_at or r.envelope_identity<>p_envelope_identity or r.idempotency_key<>p_idempotency_key or r.audit_correlation_id<>p_audit_correlation_id then update public.mcp_action_authorizations a set state=case when a.expires_at<=p_requested_at then 'expired' else 'invalidated' end where a.authorization_id=r.authorization_id; return query select 'reject'::text,(case when r.expires_at<=p_requested_at then 'expired' else 'invalidated' end)::text,null::uuid,null::timestamptz; return; end if;
 update public.mcp_action_authorizations a set state='consumed',consumed_at=p_requested_at,consumption_id=p_consumption_id where a.authorization_id=r.authorization_id and a.state='available';
 return query select 'consume'::text,'consumed'::text,p_consumption_id,p_requested_at;
end $$;
revoke all on function public.consume_mcp_action_authorization(uuid,uuid,text,text,text,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.consume_mcp_action_authorization(uuid,uuid,text,text,text,uuid,timestamptz) to service_role;

create table if not exists public.mcp_action_execution_results (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.tracekit_organizations(id), envelope_identity text not null, idempotency_key text not null, audit_correlation_id text not null, consumption_id text not null, result jsonb not null, created_at timestamptz not null default now(),
 unique(organization_id,envelope_identity,idempotency_key,audit_correlation_id), unique(organization_id,consumption_id)
);
alter table public.mcp_action_execution_results enable row level security;
revoke all on table public.mcp_action_execution_results from public,anon,authenticated,authenticator,service_role;
grant select,insert on table public.mcp_action_execution_results to service_role;
create or replace function public.guard_mcp_action_execution_result_immutability() returns trigger language plpgsql security invoker set search_path=public,pg_temp as 'BEGIN RAISE EXCEPTION ''mcp action execution results are immutable''; END;';
drop trigger if exists guard_mcp_action_execution_result_immutability on public.mcp_action_execution_results;
create trigger guard_mcp_action_execution_result_immutability before update or delete on public.mcp_action_execution_results for each row execute function public.guard_mcp_action_execution_result_immutability();
revoke all on function public.guard_mcp_action_execution_result_immutability() from public,anon,authenticated,authenticator;

create table if not exists public.mcp_action_intents(
 intent_id uuid primary key default gen_random_uuid(),organization_id uuid not null,actor_user_id uuid not null,plan_identity text not null,customer_id text,journey_id text,operation text not null,plan jsonb not null,audit_correlation_id text not null,issued_at timestamptz not null default now(),expires_at timestamptz not null,target_kind text,target jsonb,
 check(expires_at>issued_at),unique(organization_id,plan_identity,audit_correlation_id),
 constraint mcp_action_intents_operation_check check(operation in ('inspect_evidence','commas.webhook_test_delivery')),
 constraint mcp_action_intents_target_shape_check check((operation='inspect_evidence' and customer_id is not null) or (operation='commas.webhook_test_delivery' and target_kind='commas_webhook_subscription' and target is not null and customer_id is null and journey_id is null))
);
alter table public.mcp_action_intents enable row level security;
revoke all on table public.mcp_action_intents from public,anon,authenticated,authenticator,service_role;
grant select,insert on table public.mcp_action_intents to service_role;

create table if not exists public.mcp_action_confirmations(
 confirmation_id uuid primary key default gen_random_uuid(),intent_id uuid not null references public.mcp_action_intents(intent_id) on delete restrict,organization_id uuid not null,actor_user_id uuid not null,confirmed_at timestamptz not null default now(),expires_at timestamptz not null,check(expires_at>confirmed_at),unique(intent_id,actor_user_id)
);
alter table public.mcp_action_confirmations enable row level security;
revoke all on table public.mcp_action_confirmations from public,anon,authenticated,authenticator,service_role;
grant select,insert on table public.mcp_action_confirmations to service_role;

create or replace function public.resolve_mcp_action_confirmation(p_confirmation_id uuid,p_organization_id uuid,p_actor_user_id uuid,p_requested_at timestamptz)
returns table(confirmation_id uuid,intent_id uuid,plan_identity text,customer_id text,journey_id text,operation text,plan jsonb,audit_correlation_id text,confirmed_at timestamptz,intent_expires_at timestamptz,confirmation_expires_at timestamptz)
language sql security definer set search_path=public as $$ select c.confirmation_id,i.intent_id,i.plan_identity,i.customer_id,i.journey_id,i.operation,i.plan,i.audit_correlation_id,c.confirmed_at,i.expires_at,c.expires_at from public.mcp_action_confirmations c join public.mcp_action_intents i on i.intent_id=c.intent_id where c.confirmation_id=p_confirmation_id and c.organization_id=p_organization_id and c.actor_user_id=p_actor_user_id and i.organization_id=p_organization_id and i.actor_user_id=p_actor_user_id and i.expires_at>p_requested_at and c.expires_at>p_requested_at $$;
revoke all on function public.resolve_mcp_action_confirmation(uuid,uuid,uuid,timestamptz) from public,anon,authenticated; grant execute on function public.resolve_mcp_action_confirmation(uuid,uuid,uuid,timestamptz) to service_role;

create or replace function public.resolve_mcp_provider_action_confirmation(p_confirmation_id uuid,p_organization_id uuid,p_actor_user_id uuid,p_requested_at timestamptz)
returns table(confirmation_id uuid,intent_id uuid,plan_identity text,operation text,target_kind text,target jsonb,plan jsonb,audit_correlation_id text,confirmed_at timestamptz,intent_expires_at timestamptz,confirmation_expires_at timestamptz)
language sql security definer set search_path=public as $$ select c.confirmation_id,i.intent_id,i.plan_identity,i.operation,i.target_kind,i.target,i.plan,i.audit_correlation_id,c.confirmed_at,i.expires_at,c.expires_at from public.mcp_action_confirmations c join public.mcp_action_intents i on i.intent_id=c.intent_id where c.confirmation_id=p_confirmation_id and c.organization_id=p_organization_id and c.actor_user_id=p_actor_user_id and i.organization_id=p_organization_id and i.actor_user_id=p_actor_user_id and i.operation='commas.webhook_test_delivery' and i.expires_at>p_requested_at and c.expires_at>p_requested_at $$;
revoke all on function public.resolve_mcp_provider_action_confirmation(uuid,uuid,uuid,timestamptz) from public,anon,authenticated; grant execute on function public.resolve_mcp_provider_action_confirmation(uuid,uuid,uuid,timestamptz) to service_role;
