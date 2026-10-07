-- WS-019 M4.4 Phase B uses fixed, acceptance-only lifecycle records. These
-- functions are intentionally service-role-only and hard-bound to Stem Labs.
-- They never resolve credentials or invoke an action execution path.

create or replace function public.create_ws019_m44_phase_b_fixture(
  p_organization_id uuid,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_org constant uuid := '8f6bb14b-2126-49b8-bfdb-c60edbc3549b';
  v_a constant uuid := 'b4400000-0000-4000-8000-000000000001';
  v_b constant uuid := 'b4400000-0000-4000-8000-000000000002';
  v_c constant uuid := 'b4400000-0000-4000-8000-000000000003';
  v_confirmation_b constant uuid := 'b4450000-0000-4000-8000-000000000002';
  v_confirmation_c constant uuid := 'b4450000-0000-4000-8000-000000000003';
  v_authorization_b constant uuid := 'b4410000-0000-4000-8000-000000000002';
  v_consumption_b constant uuid := 'b4420000-0000-4000-8000-000000000002';
  v_result_b constant uuid := 'b4430000-0000-4000-8000-000000000002';
  v_recovery_c constant uuid := 'b4440000-0000-4000-8000-000000000003';
  v_now timestamptz := clock_timestamp();
  v_intent_count integer;
  v_compatible boolean;
begin
  if p_organization_id is distinct from v_org or p_actor_user_id is null then
    raise exception 'acceptance fixture unavailable';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ws019.m4.4.phase_b', 0));

  select count(*) into v_intent_count
  from public.mcp_action_intents
  where intent_id in (v_a, v_b, v_c)
     or (organization_id = v_org and audit_correlation_id like 'ws019.m4.4.phase_b:%');

  if v_intent_count = 0 then
    insert into public.mcp_action_intents(
      intent_id, organization_id, actor_user_id, plan_identity, customer_id,
      journey_id, operation, plan, audit_correlation_id, issued_at, expires_at,
      target_kind, target
    ) values
      (v_a, v_org, p_actor_user_id, 'acceptance:ws019.m4.4.phase_b:awaiting', null, null,
       'shopify.controlled_webhook_create_delete_proof',
       '{"acceptance_only":true,"namespace":"ws019.m4.4.phase_b","fixture":"awaiting_approval","dispatchable":false}'::jsonb,
       'ws019.m4.4.phase_b:awaiting', v_now, v_now + interval '24 hours',
       'shopify_webhook_subscription',
       '{"acceptance_only":true,"provider":"shopify","shop_domain":"ws019-m4-4-phase-b.invalid","topic":"APP_UNINSTALLED","dispatchable":false}'::jsonb),
      (v_b, v_org, p_actor_user_id, 'acceptance:ws019.m4.4.phase_b:execution_failure', null, null,
       'shopify.controlled_webhook_create_delete_proof',
       '{"acceptance_only":true,"namespace":"ws019.m4.4.phase_b","fixture":"execution_failure","dispatchable":false}'::jsonb,
       'ws019.m4.4.phase_b:execution_failure', v_now, v_now + interval '24 hours',
       'shopify_webhook_subscription',
       '{"acceptance_only":true,"provider":"shopify","shop_domain":"ws019-m4-4-phase-b.invalid","topic":"APP_UNINSTALLED","dispatchable":false}'::jsonb),
      (v_c, v_org, p_actor_user_id, 'acceptance:ws019.m4.4.phase_b:incomplete_recovery', null, null,
       'shopify.controlled_webhook_create_delete_proof',
       '{"acceptance_only":true,"namespace":"ws019.m4.4.phase_b","fixture":"incomplete_recovery","dispatchable":false}'::jsonb,
       'ws019.m4.4.phase_b:incomplete_recovery', v_now, v_now + interval '24 hours',
       'shopify_webhook_subscription',
       '{"acceptance_only":true,"provider":"shopify","shop_domain":"ws019-m4-4-phase-b.invalid","topic":"APP_UNINSTALLED","dispatchable":false}'::jsonb);

    insert into public.mcp_action_confirmations(
      confirmation_id, intent_id, organization_id, actor_user_id, confirmed_at, expires_at
    ) values
      (v_confirmation_b, v_b, v_org, p_actor_user_id, v_now, v_now + interval '24 hours'),
      (v_confirmation_c, v_c, v_org, p_actor_user_id, v_now, v_now + interval '24 hours');

    insert into public.mcp_action_authorizations(
      authorization_id, organization_id, envelope_identity, idempotency_key,
      audit_correlation_id, state, expires_at, consumed_at, consumption_id,
      created_at, envelope_created_at
    ) values (
      v_authorization_b, v_org, 'acceptance-envelope:ws019.m4.4.phase_b:execution_failure',
      'acceptance-idempotency:ws019.m4.4.phase_b:execution_failure',
      'ws019.m4.4.phase_b:execution_failure', 'consumed', v_now + interval '24 hours',
      v_now, v_consumption_b, v_now, v_now
    );

    insert into public.mcp_action_execution_results(
      id, organization_id, envelope_identity, idempotency_key,
      audit_correlation_id, consumption_id, result, created_at
    ) values (
      v_result_b, v_org, 'acceptance-envelope:ws019.m4.4.phase_b:execution_failure',
      'acceptance-idempotency:ws019.m4.4.phase_b:execution_failure',
      'ws019.m4.4.phase_b:execution_failure', v_consumption_b::text,
      '{"status":"failed","reason":"acceptance_fixture_terminal_failure","acceptance_only":true,"providerMutation":false,"external_request_sent":false}'::jsonb,
      v_now
    );

    insert into public.mcp_shopify_mutation_recovery(
      recovery_id, organization_id, intent_id, plan_identity, shop_domain,
      callback_url, topic, state, created_external_id, created_verified,
      rollback_verified, audit_correlation_id, created_at, updated_at
    ) values (
      v_recovery_c, v_org, v_c, 'acceptance:ws019.m4.4.phase_b:incomplete_recovery',
      'ws019-m4-4-phase-b.invalid', 'https://ws019-m4-4-phase-b.invalid/callback',
      'APP_UNINSTALLED', 'created', 'acceptance-only:no-provider-object', true, false,
      'ws019.m4.4.phase_b:incomplete_recovery', v_now, v_now
    );
  elsif v_intent_count <> 3 then
    raise exception 'acceptance fixture incompatible';
  end if;

  select
    (select count(*) = 3 from public.mcp_action_intents i
      where i.organization_id=v_org and i.intent_id in (v_a,v_b,v_c)
        and i.actor_user_id=p_actor_user_id
        and i.operation='shopify.controlled_webhook_create_delete_proof'
        and i.target_kind='shopify_webhook_subscription'
        and i.plan->>'namespace'='ws019.m4.4.phase_b'
        and i.plan->>'acceptance_only'='true'
        and i.plan->>'dispatchable'='false')
    and (select count(*) = 2 from public.mcp_action_confirmations c
      where c.organization_id=v_org and c.confirmation_id in (v_confirmation_b,v_confirmation_c)
        and c.intent_id in (v_b,v_c) and c.actor_user_id=p_actor_user_id)
    and exists(select 1 from public.mcp_action_authorizations a
      where a.authorization_id=v_authorization_b and a.organization_id=v_org
        and a.audit_correlation_id='ws019.m4.4.phase_b:execution_failure'
        and a.envelope_identity='acceptance-envelope:ws019.m4.4.phase_b:execution_failure'
        and a.idempotency_key='acceptance-idempotency:ws019.m4.4.phase_b:execution_failure'
        and a.state='consumed' and a.consumption_id=v_consumption_b)
    and exists(select 1 from public.mcp_action_execution_results r
      where r.id=v_result_b and r.organization_id=v_org
        and r.audit_correlation_id='ws019.m4.4.phase_b:execution_failure'
        and r.consumption_id=v_consumption_b::text
        and r.result->>'status'='failed'
        and r.result->>'acceptance_only'='true'
        and r.result->>'providerMutation'='false'
        and r.result->>'external_request_sent'='false')
    and exists(select 1 from public.mcp_shopify_mutation_recovery r
      where r.recovery_id=v_recovery_c and r.organization_id=v_org and r.intent_id=v_c
        and r.created_external_id='acceptance-only:no-provider-object'
        and r.created_verified and r.state in ('created','rollback_verified')
        and r.rollback_verified=(r.state='rollback_verified'))
  into v_compatible;

  if not coalesce(v_compatible,false) then
    raise exception 'acceptance fixture incompatible';
  end if;

  return jsonb_build_object(
    'namespace','ws019.m4.4.phase_b','created',v_intent_count=0,
    'intent_ids',jsonb_build_array(v_a,v_b,v_c)
  );
end;
$$;

create or replace function public.resolve_ws019_m44_phase_b_awaiting(
  p_organization_id uuid,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_org constant uuid := '8f6bb14b-2126-49b8-bfdb-c60edbc3549b';
  v_intent constant uuid := 'b4400000-0000-4000-8000-000000000001';
  v_confirmation constant uuid := 'b4450000-0000-4000-8000-000000000001';
  v_now timestamptz := clock_timestamp();
begin
  if p_organization_id is distinct from v_org or p_actor_user_id is null then
    raise exception 'acceptance fixture unavailable';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ws019.m4.4.phase_b', 0));
  if not exists(select 1 from public.mcp_action_intents where intent_id=v_intent
    and organization_id=v_org and actor_user_id=p_actor_user_id
    and plan_identity='acceptance:ws019.m4.4.phase_b:awaiting'
    and plan->>'acceptance_only'='true') then
    raise exception 'acceptance fixture incompatible';
  end if;
  if exists(select 1 from public.mcp_action_confirmations where intent_id=v_intent
    and confirmation_id<>v_confirmation) then
    raise exception 'acceptance fixture incompatible';
  end if;
  insert into public.mcp_action_confirmations(
    confirmation_id,intent_id,organization_id,actor_user_id,confirmed_at,expires_at
  ) values(v_confirmation,v_intent,v_org,p_actor_user_id,v_now,v_now+interval '24 hours')
  on conflict(confirmation_id) do nothing;
  if not exists(select 1 from public.mcp_action_confirmations where confirmation_id=v_confirmation
    and intent_id=v_intent and organization_id=v_org and actor_user_id=p_actor_user_id) then
    raise exception 'acceptance fixture incompatible';
  end if;
  return jsonb_build_object('namespace','ws019.m4.4.phase_b','resolved','awaiting_approval','intent_id',v_intent);
end;
$$;

create or replace function public.resolve_ws019_m44_phase_b_recovery(
  p_organization_id uuid,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_org constant uuid := '8f6bb14b-2126-49b8-bfdb-c60edbc3549b';
  v_recovery constant uuid := 'b4440000-0000-4000-8000-000000000003';
begin
  if p_organization_id is distinct from v_org or p_actor_user_id is null then
    raise exception 'acceptance fixture unavailable';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ws019.m4.4.phase_b', 0));
  if not exists(select 1 from public.mcp_shopify_mutation_recovery
    where recovery_id=v_recovery and organization_id=v_org
      and intent_id='b4400000-0000-4000-8000-000000000003'::uuid
      and created_external_id='acceptance-only:no-provider-object'
      and created_verified and state in ('created','rollback_verified')
      and rollback_verified=(state='rollback_verified')) then
    raise exception 'acceptance fixture incompatible';
  end if;
  update public.mcp_shopify_mutation_recovery
  set state='rollback_verified',rollback_verified=true,updated_at=clock_timestamp()
  where recovery_id=v_recovery and state='created' and rollback_verified=false;
  return jsonb_build_object('namespace','ws019.m4.4.phase_b','resolved','incomplete_recovery','recovery_id',v_recovery);
end;
$$;

revoke all on function public.create_ws019_m44_phase_b_fixture(uuid,uuid) from public,anon,authenticated,authenticator;
revoke all on function public.resolve_ws019_m44_phase_b_awaiting(uuid,uuid) from public,anon,authenticated,authenticator;
revoke all on function public.resolve_ws019_m44_phase_b_recovery(uuid,uuid) from public,anon,authenticated,authenticator;
grant execute on function public.create_ws019_m44_phase_b_fixture(uuid,uuid) to service_role;
grant execute on function public.resolve_ws019_m44_phase_b_awaiting(uuid,uuid) to service_role;
grant execute on function public.resolve_ws019_m44_phase_b_recovery(uuid,uuid) to service_role;

comment on function public.create_ws019_m44_phase_b_fixture(uuid,uuid) is
  'Creates the fixed Stem Labs WS-019 M4.4 Phase B acceptance-only lifecycle fixture without provider access.';
