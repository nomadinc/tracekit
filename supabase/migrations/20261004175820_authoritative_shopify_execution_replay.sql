-- A current execution must use database time. The caller's requested_at is
-- retained only as immutable envelope metadata and never authorizes work.
create or replace function public.resolve_mcp_shopify_action_confirmation(
 p_confirmation_id uuid,
 p_organization_id uuid,
 p_actor_user_id uuid,
 p_requested_at timestamptz
)
returns table(
 confirmation_id uuid,
 intent_id uuid,
 plan_identity text,
 operation text,
 target_kind text,
 target jsonb,
 plan jsonb,
 audit_correlation_id text,
 confirmed_at timestamptz,
 intent_expires_at timestamptz,
 confirmation_expires_at timestamptz
)
language sql security definer set search_path=public,pg_temp as $$
 select c.confirmation_id,i.intent_id,i.plan_identity,i.operation,i.target_kind,i.target,i.plan,
        i.audit_correlation_id,c.confirmed_at,i.expires_at,c.expires_at
 from public.mcp_action_confirmations c
 join public.mcp_action_intents i on i.intent_id=c.intent_id
 where c.confirmation_id=p_confirmation_id
 and c.organization_id=p_organization_id
 and c.actor_user_id=p_actor_user_id
 and i.organization_id=p_organization_id
 and i.actor_user_id=p_actor_user_id
 and i.operation='shopify.controlled_webhook_create_delete_proof'
 and i.target_kind='shopify_webhook_subscription'
 and i.expires_at>clock_timestamp()
 and c.expires_at>clock_timestamp()
$$;

revoke all on function public.resolve_mcp_shopify_action_confirmation(uuid,uuid,uuid,timestamptz)
 from public,anon,authenticated,authenticator;
grant execute on function public.resolve_mcp_shopify_action_confirmation(uuid,uuid,uuid,timestamptz)
 to service_role;

-- Read-only replay lookup. It can return only an exact, already-consumed,
-- completed result bound to the authenticated actor and organization.
create or replace function public.resolve_completed_mcp_shopify_execution_replay(
 p_confirmation_id uuid,
 p_organization_id uuid,
 p_actor_user_id uuid,
 p_expected_operation text,
 p_expected_target_kind text,
 p_requested_at timestamptz,
 p_idempotency_key text
)
returns table(
 decision text,
 envelope_identity text,
 audit_correlation_id text,
 consumption_id text,
 result jsonb
)
language sql security definer set search_path=public,pg_temp as $$
 select 'replay_same_result'::text,a.envelope_identity,a.audit_correlation_id,
        a.consumption_id,r.result
 from public.mcp_action_confirmations c
 join public.mcp_action_intents i on i.intent_id=c.intent_id
 join public.mcp_action_authorizations a
   on a.organization_id=i.organization_id
  and a.audit_correlation_id=i.audit_correlation_id
  and a.idempotency_key=p_idempotency_key
  and a.envelope_created_at=p_requested_at
  and a.state='consumed'
  and a.consumption_id is not null
 join public.mcp_action_execution_results r
   on r.organization_id=a.organization_id
  and r.envelope_identity=a.envelope_identity
  and r.idempotency_key=a.idempotency_key
  and r.audit_correlation_id=a.audit_correlation_id
  and r.consumption_id=a.consumption_id::text
 where c.confirmation_id=p_confirmation_id
 and c.organization_id=p_organization_id
 and c.actor_user_id=p_actor_user_id
 and i.organization_id=p_organization_id
 and i.actor_user_id=p_actor_user_id
 and i.operation=p_expected_operation
 and i.target_kind=p_expected_target_kind
 and i.operation='shopify.controlled_webhook_create_delete_proof'
 and i.target_kind='shopify_webhook_subscription'
 and i.plan_identity=('provider-plan:'||i.operation||':'||(i.target->>'connectionId')||':'||
                       (i.target->>'shopDomain')||':'||(i.target->>'topic'))
 and i.plan->>'operation'=i.operation
 and i.plan->>'connectionId'=i.target->>'connectionId'
 and i.plan->>'shopDomain'=i.target->>'shopDomain'
 and i.plan->>'callbackUrl'=i.target->>'callbackUrl'
 and i.plan->>'topic'=i.target->>'topic'
 and r.result->>'status'='completed'
 limit 1
$$;

revoke all on function public.resolve_completed_mcp_shopify_execution_replay(uuid,uuid,uuid,text,text,timestamptz,text)
 from public,anon,authenticated,authenticator;
grant execute on function public.resolve_completed_mcp_shopify_execution_replay(uuid,uuid,uuid,text,text,timestamptz,text)
 to service_role;

-- First execution authorization and consumption are one transaction. Advisory
-- serialization covers the absent-row case; row locks cover existing state.
create or replace function public.authorize_mcp_shopify_execution_atomic(
 p_confirmation_id uuid,
 p_organization_id uuid,
 p_actor_user_id uuid,
 p_expected_operation text,
 p_expected_target_kind text,
 p_expected_plan_identity text,
 p_authorization_id uuid,
 p_envelope_identity text,
 p_idempotency_key text,
 p_audit_correlation_id text,
 p_consumption_id uuid,
 p_requested_at timestamptz
)
returns table(decision text,state text,consumption_id uuid,consumed_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_intent public.mcp_action_intents%rowtype;
 v_confirmation public.mcp_action_confirmations%rowtype;
 v_authorization public.mcp_action_authorizations%rowtype;
 v_now timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||p_envelope_identity||':'||p_idempotency_key,0));

 select c.* into v_confirmation from public.mcp_action_confirmations c
  where c.confirmation_id=p_confirmation_id
    and c.organization_id=p_organization_id
    and c.actor_user_id=p_actor_user_id
  for update;
 if not found then return query select 'reject'::text,'unavailable'::text,null::uuid,null::timestamptz; return; end if;

 select i.* into v_intent from public.mcp_action_intents i
  where i.intent_id=v_confirmation.intent_id
    and i.organization_id=p_organization_id
    and i.actor_user_id=p_actor_user_id
  for update;

 -- Capture time only after every potentially blocking lock.
 v_now:=clock_timestamp();
 if not found
    or v_intent.expires_at<=v_now
    or v_confirmation.expires_at<=v_now
    or v_intent.operation is distinct from p_expected_operation
    or v_intent.target_kind is distinct from p_expected_target_kind
    or v_intent.plan_identity is distinct from p_expected_plan_identity
    or v_intent.audit_correlation_id is distinct from p_audit_correlation_id
    or v_intent.operation is distinct from 'shopify.controlled_webhook_create_delete_proof'
    or v_intent.target_kind is distinct from 'shopify_webhook_subscription'
    or v_intent.plan->>'operation' is distinct from v_intent.operation
    or v_intent.plan->>'connectionId' is distinct from v_intent.target->>'connectionId'
    or v_intent.plan->>'shopDomain' is distinct from v_intent.target->>'shopDomain'
    or v_intent.plan->>'callbackUrl' is distinct from v_intent.target->>'callbackUrl'
    or v_intent.plan->>'topic' is distinct from v_intent.target->>'topic'
    or v_intent.plan_identity is distinct from ('provider-plan:'||v_intent.operation||':'||
       (v_intent.target->>'connectionId')||':'||(v_intent.target->>'shopDomain')||':'||(v_intent.target->>'topic')) then
   return query select 'reject'::text,'unavailable'::text,null::uuid,null::timestamptz; return;
 end if;

 select a.* into v_authorization from public.mcp_action_authorizations a
  where a.organization_id=p_organization_id
    and a.envelope_identity=p_envelope_identity
    and a.idempotency_key=p_idempotency_key
    and a.audit_correlation_id=p_audit_correlation_id
  for update;

 if found then
   if v_authorization.state='consumed' then
     return query select 'replay_result_unavailable'::text,v_authorization.state,
       v_authorization.consumption_id,v_authorization.consumed_at;
   end if;
   if v_authorization.state<>'available' or v_authorization.expires_at<=v_now then
     return query select 'reject'::text,v_authorization.state,null::uuid,null::timestamptz; return;
   end if;
 else
   insert into public.mcp_action_authorizations(
    authorization_id,organization_id,envelope_identity,idempotency_key,audit_correlation_id,
    state,expires_at,envelope_created_at
   ) values (
    p_authorization_id,p_organization_id,p_envelope_identity,p_idempotency_key,p_audit_correlation_id,
    'available',v_confirmation.expires_at,p_requested_at
   ) returning * into v_authorization;
 end if;

 update public.mcp_action_authorizations a
 set state='consumed',consumed_at=v_now,consumption_id=p_consumption_id
 where a.authorization_id=v_authorization.authorization_id and a.state='available';
 if not found then return query select 'reject'::text,'unavailable'::text,null::uuid,null::timestamptz; return; end if;
 return query select 'consume'::text,'consumed'::text,p_consumption_id,v_now;
end
$$;

revoke all on function public.authorize_mcp_shopify_execution_atomic(uuid,uuid,uuid,text,text,text,uuid,text,text,text,uuid,timestamptz)
 from public,anon,authenticated,authenticator;
grant execute on function public.authorize_mcp_shopify_execution_atomic(uuid,uuid,uuid,text,text,text,uuid,text,text,text,uuid,timestamptz)
 to service_role;
