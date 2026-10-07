create table if not exists public.mcp_action_intents(
 intent_id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 actor_user_id uuid not null,
 plan_identity text not null,
 customer_id text not null,
 journey_id text,
 operation text not null check(operation='inspect_evidence'),
 plan jsonb not null,
 audit_correlation_id text not null,
 issued_at timestamptz not null default now(),
 expires_at timestamptz not null,
 check(expires_at>issued_at),
 unique(organization_id,plan_identity,audit_correlation_id)
);
alter table public.mcp_action_intents enable row level security;
revoke all on table public.mcp_action_intents from anon,authenticated;
grant select,insert on table public.mcp_action_intents to service_role;

create table if not exists public.mcp_action_confirmations(
 confirmation_id uuid primary key default gen_random_uuid(),
 intent_id uuid not null references public.mcp_action_intents(intent_id) on delete restrict,
 organization_id uuid not null,
 actor_user_id uuid not null,
 confirmed_at timestamptz not null default now(),
 expires_at timestamptz not null,
 check(expires_at>confirmed_at),
 unique(intent_id,actor_user_id)
);
alter table public.mcp_action_confirmations enable row level security;
revoke all on table public.mcp_action_confirmations from anon,authenticated;
grant select,insert on table public.mcp_action_confirmations to service_role;

create or replace function public.resolve_mcp_action_confirmation(p_confirmation_id uuid,p_organization_id uuid,p_actor_user_id uuid,p_requested_at timestamptz)
returns table(confirmation_id uuid,intent_id uuid,plan_identity text,customer_id text,journey_id text,operation text,plan jsonb,audit_correlation_id text,confirmed_at timestamptz,intent_expires_at timestamptz,confirmation_expires_at timestamptz)
language sql security definer set search_path=public as $$
 select c.confirmation_id,i.intent_id,i.plan_identity,i.customer_id,i.journey_id,i.operation,i.plan,i.audit_correlation_id,c.confirmed_at,i.expires_at,c.expires_at
 from public.mcp_action_confirmations c join public.mcp_action_intents i on i.intent_id=c.intent_id
 where c.confirmation_id=p_confirmation_id and c.organization_id=p_organization_id and c.actor_user_id=p_actor_user_id
 and i.organization_id=p_organization_id and i.actor_user_id=p_actor_user_id
 and i.expires_at>p_requested_at and c.expires_at>p_requested_at
$$;
revoke all on function public.resolve_mcp_action_confirmation(uuid,uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.resolve_mcp_action_confirmation(uuid,uuid,uuid,timestamptz) to service_role;
