-- Confirm a governed action only while its durable intent is valid at database time.
-- The intent row lock serializes concurrent confirmation attempts and expiry checks.
create or replace function public.confirm_mcp_action_intent_atomic(
  p_intent_id uuid,
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_expected_operation text,
  p_expected_target_kind text default null
)
returns table(decision text, confirmation_id uuid, confirmed_at timestamptz, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_intent public.mcp_action_intents%rowtype;
  v_existing public.mcp_action_confirmations%rowtype;
  v_confirmation_id uuid;
  v_now timestamptz;
  v_expires_at timestamptz;
  v_expected_plan_identity text;
begin
  select i.* into v_intent
    from public.mcp_action_intents i
   where i.intent_id = p_intent_id
     and i.organization_id = p_organization_id
     and i.actor_user_id = p_actor_user_id
   for update;

  -- Capture authoritative time after any row-lock wait. A request that entered
  -- before expiry but acquired the lock afterward must not confirm stale state.
  v_now := clock_timestamp();

  if not found
     or v_intent.operation is distinct from p_expected_operation
     or v_intent.target_kind is distinct from p_expected_target_kind
     or v_intent.expires_at <= v_now then
    return query select 'reject'::text, null::uuid, null::timestamptz, null::timestamptz;
    return;
  end if;

  if v_intent.operation = 'inspect_evidence' then
    if v_intent.customer_id is null
       or v_intent.plan->>'recommendationId' is null
       or v_intent.plan#>>'{proposedOperation,type}' is distinct from 'inspect_evidence'
       or v_intent.plan#>>'{target,customerId}' is distinct from v_intent.customer_id
       or nullif(v_intent.plan#>>'{target,journeyId}', '') is distinct from v_intent.journey_id then
      return query select 'reject'::text, null::uuid, null::timestamptz, null::timestamptz;
      return;
    end if;
    v_expected_plan_identity := 'plan:' || (v_intent.plan->>'recommendationId') || ':' ||
      v_intent.customer_id || ':' || coalesce(v_intent.journey_id, '');
  elsif v_intent.operation = 'commas.webhook_test_delivery' then
    if v_intent.target->>'subscriptionId' is null
       or v_intent.target->>'eventType' is null
       or v_intent.plan->>'operation' is distinct from v_intent.operation
       or v_intent.plan->>'subscriptionId' is distinct from v_intent.target->>'subscriptionId'
       or v_intent.plan->>'eventType' is distinct from v_intent.target->>'eventType' then
      return query select 'reject'::text, null::uuid, null::timestamptz, null::timestamptz;
      return;
    end if;
    v_expected_plan_identity := 'provider-plan:' || v_intent.operation || ':' ||
      (v_intent.target->>'subscriptionId') || ':' || (v_intent.target->>'eventType');
  elsif v_intent.operation = 'shopify.controlled_webhook_create_delete_proof' then
    if v_intent.target->>'connectionId' is null
       or v_intent.target->>'shopDomain' is null
       or v_intent.target->>'callbackUrl' is null
       or v_intent.target->>'topic' is null
       or v_intent.plan->>'operation' is distinct from v_intent.operation
       or v_intent.plan->>'connectionId' is distinct from v_intent.target->>'connectionId'
       or v_intent.plan->>'shopDomain' is distinct from v_intent.target->>'shopDomain'
       or v_intent.plan->>'callbackUrl' is distinct from v_intent.target->>'callbackUrl'
       or v_intent.plan->>'topic' is distinct from v_intent.target->>'topic' then
      return query select 'reject'::text, null::uuid, null::timestamptz, null::timestamptz;
      return;
    end if;
    v_expected_plan_identity := 'provider-plan:' || v_intent.operation || ':' ||
      (v_intent.target->>'connectionId') || ':' || (v_intent.target->>'shopDomain') || ':' ||
      (v_intent.target->>'topic');
  else
    return query select 'reject'::text, null::uuid, null::timestamptz, null::timestamptz;
    return;
  end if;

  if v_intent.plan_identity is distinct from v_expected_plan_identity then
    return query select 'reject'::text, null::uuid, null::timestamptz, null::timestamptz;
    return;
  end if;

  select c.* into v_existing
    from public.mcp_action_confirmations c
   where c.intent_id = v_intent.intent_id
     and c.actor_user_id = p_actor_user_id;

  if found then
    if v_existing.organization_id = p_organization_id and v_existing.expires_at > v_now then
      return query select 'replay_same_confirmation'::text, v_existing.confirmation_id,
        v_existing.confirmed_at, v_existing.expires_at;
    else
      return query select 'reject'::text, null::uuid, null::timestamptz, null::timestamptz;
    end if;
    return;
  end if;

  v_confirmation_id := gen_random_uuid();
  v_expires_at := least(v_now + interval '5 minutes', v_intent.expires_at);
  insert into public.mcp_action_confirmations(
    confirmation_id, intent_id, organization_id, actor_user_id, confirmed_at, expires_at
  ) values (
    v_confirmation_id, v_intent.intent_id, p_organization_id, p_actor_user_id, v_now, v_expires_at
  );
  return query select 'confirmed'::text, v_confirmation_id, v_now, v_expires_at;
end
$$;

revoke all on function public.confirm_mcp_action_intent_atomic(uuid, uuid, uuid, text, text)
  from public, anon, authenticated, authenticator;
grant execute on function public.confirm_mcp_action_intent_atomic(uuid, uuid, uuid, text, text)
  to service_role;

-- The SECURITY DEFINER RPC is the only confirmation write boundary. Retain
-- server-side reads, but remove the legacy direct-insert bypass.
revoke insert on table public.mcp_action_confirmations from service_role;
