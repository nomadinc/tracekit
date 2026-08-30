-- Fixed-scope, operator-authorized canonical catalog foundation for Push Button
-- System. This function creates catalog targets only: it never reads or writes
-- commerce_provider_products or commerce_product_mapping_decisions.

create or replace function public.create_push_button_system_catalog(
  p_actor_user_id uuid,
  p_correlation_id text,
  p_confirmation text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_organization_id constant uuid := '5f1de64a-1b37-40bb-81c8-32197eda0b41'::uuid;
  v_account_id constant uuid := '39d895f9-71ac-44d3-ac33-6e9043f6267e'::uuid;
  v_context_id constant text := 'push-button-system-5f1de64a';
  v_offer_id constant uuid := 'b842611c-9918-40ac-9241-d542a8c6f8b4'::uuid;
  v_existing integer;
begin
  if p_confirmation is distinct from 'create-push-button-system-catalog'
    or nullif(btrim(p_correlation_id), '') is null
  then
    raise exception 'invalid Push Button System catalog confirmation' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.tracekit_memberships m
    where m.user_id = p_actor_user_id
      and m.organization_id = v_organization_id
      and m.status = 'active'
  ) then
    raise exception 'Push Button System catalog actor unavailable' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('catalog:push-button-system:' || v_organization_id::text, 0));

  select count(*) into v_existing
  from public.offer_steps
  where organization_id = v_organization_id
    and canonical_offer_id = v_offer_id
    and id in (
      '8110e951-8ca6-406a-8817-55575fe647ba'::uuid,
      '8d1b5be3-c60c-45ec-baa6-a2e1b6b610d5'::uuid,
      'e215a9be-453c-461f-ab06-7e75742be9f1'::uuid,
      '2df33aef-aee2-459e-ac65-6e3cbd3dbd13'::uuid,
      'a4992adc-57e8-4bb1-9360-f421d2d9322c'::uuid,
      'bf339297-6717-4286-b83c-b9af54b8d0f3'::uuid,
      '155997e9-244b-4547-94e0-4fde658f8c0f'::uuid
    );

  insert into public.tracekit_business_contexts
    (id, account_id, organization_id, name, status, fulfillment_type, metadata)
  values
    (v_context_id, v_account_id, v_organization_id, 'Push Button System', 'active', 'digital',
     jsonb_build_object('catalog_key', 'push-button-system', 'identity_basis', 'operator_authorized'))
  on conflict (id) do nothing;

  insert into public.canonical_offers
    (id, account_id, organization_id, business_context_id, name, status, metadata)
  values
    (v_offer_id, v_account_id, v_organization_id, v_context_id, 'Push Button System', 'active',
     jsonb_build_object('catalog_key', 'push-button-system', 'identity_basis', 'operator_authorized'))
  on conflict (id) do nothing;

  insert into public.offer_steps
    (id, organization_id, canonical_offer_id, role, sequence, label, metadata)
  values
    ('8110e951-8ca6-406a-8817-55575fe647ba', v_organization_id, v_offer_id, 'front_end', 0, 'Front End',
     '{"catalog_key":"front-end","default_price":67,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb),
    ('8d1b5be3-c60c-45ec-baa6-a2e1b6b610d5', v_organization_id, v_offer_id, 'upsell', 1, 'OTO 1 — Gold',
     '{"catalog_key":"oto-1-gold","default_price":297,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb),
    ('e215a9be-453c-461f-ab06-7e75742be9f1', v_organization_id, v_offer_id, 'downsell', 1, 'OTO 1 — Downsell 1',
     '{"catalog_key":"oto-1-downsell-1","parent_step_key":"oto-1-gold","default_price":197,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb),
    ('2df33aef-aee2-459e-ac65-6e3cbd3dbd13', v_organization_id, v_offer_id, 'downsell', 2, 'OTO 1 — Downsell 2',
     '{"catalog_key":"oto-1-downsell-2","parent_step_key":"oto-1-gold","default_price":97,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb),
    ('a4992adc-57e8-4bb1-9360-f421d2d9322c', v_organization_id, v_offer_id, 'upsell', 2, 'OTO 2 — Platinum',
     '{"catalog_key":"oto-2-platinum","default_price":299,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb),
    ('bf339297-6717-4286-b83c-b9af54b8d0f3', v_organization_id, v_offer_id, 'downsell', 3, 'OTO 2 — Downsell 1',
     '{"catalog_key":"oto-2-downsell-1","parent_step_key":"oto-2-platinum","default_price":199,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb),
    ('155997e9-244b-4547-94e0-4fde658f8c0f', v_organization_id, v_offer_id, 'downsell', 4, 'OTO 2 — Downsell 2',
     '{"catalog_key":"oto-2-downsell-2","parent_step_key":"oto-2-platinum","default_price":99,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb)
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.tracekit_business_contexts
    where id = v_context_id and account_id = v_account_id and organization_id = v_organization_id
      and name = 'Push Button System' and status = 'active' and fulfillment_type = 'digital'
  ) or not exists (
    select 1 from public.canonical_offers
    where id = v_offer_id and account_id = v_account_id and organization_id = v_organization_id
      and business_context_id = v_context_id and name = 'Push Button System' and status = 'active'
  ) or (
    select count(*)
    from public.offer_steps s
    join (values
      ('8110e951-8ca6-406a-8817-55575fe647ba'::uuid, 'front_end', 0, 'Front End', 'front-end', null::text, 67::numeric),
      ('8d1b5be3-c60c-45ec-baa6-a2e1b6b610d5'::uuid, 'upsell', 1, 'OTO 1 — Gold', 'oto-1-gold', null::text, 297::numeric),
      ('e215a9be-453c-461f-ab06-7e75742be9f1'::uuid, 'downsell', 1, 'OTO 1 — Downsell 1', 'oto-1-downsell-1', 'oto-1-gold', 197::numeric),
      ('2df33aef-aee2-459e-ac65-6e3cbd3dbd13'::uuid, 'downsell', 2, 'OTO 1 — Downsell 2', 'oto-1-downsell-2', 'oto-1-gold', 97::numeric),
      ('a4992adc-57e8-4bb1-9360-f421d2d9322c'::uuid, 'upsell', 2, 'OTO 2 — Platinum', 'oto-2-platinum', null::text, 299::numeric),
      ('bf339297-6717-4286-b83c-b9af54b8d0f3'::uuid, 'downsell', 3, 'OTO 2 — Downsell 1', 'oto-2-downsell-1', 'oto-2-platinum', 199::numeric),
      ('155997e9-244b-4547-94e0-4fde658f8c0f'::uuid, 'downsell', 4, 'OTO 2 — Downsell 2', 'oto-2-downsell-2', 'oto-2-platinum', 99::numeric)
    ) expected(id, role, sequence, label, catalog_key, parent_step_key, default_price)
      on expected.id = s.id
     and s.organization_id = v_organization_id
     and s.canonical_offer_id = v_offer_id
     and s.role = expected.role
     and s.sequence = expected.sequence
     and s.label = expected.label
     and s.metadata->>'catalog_key' = expected.catalog_key
     and s.metadata->>'parent_step_key' is not distinct from expected.parent_step_key
     and (s.metadata->>'default_price')::numeric = expected.default_price
     and s.metadata->>'currency' = 'USD'
     and s.metadata->>'identity_basis' = 'operator_authorized'
  ) <> 7 then
    raise exception 'Push Button System catalog conflicts with existing canonical state' using errcode = '23505';
  end if;

  insert into public.tracekit_audit_events
    (actor_user_id, account_id, organization_id, action, target_type, target_id,
     result, permission_evaluated, correlation_id, metadata)
  values
    (p_actor_user_id, v_account_id, v_organization_id, 'commerce.catalog.push_button_system_created',
     'canonical_offer', v_offer_id::text, 'success', 'offers.manage', btrim(p_correlation_id),
     jsonb_build_object('business_context_id', v_context_id, 'offer_step_count', 7,
       'variant_count', 0, 'created_step_count', 7 - v_existing));

  return jsonb_build_object(
    'business_context_id', v_context_id,
    'canonical_offer_id', v_offer_id,
    'offer_step_count', 7,
    'variant_count', 0,
    'created_step_count', 7 - v_existing
  );
end;
$$;

revoke all on function public.create_push_button_system_catalog(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.create_push_button_system_catalog(uuid, text, text)
  to service_role;

comment on function public.create_push_button_system_catalog(uuid, text, text) is
  'Fixed-scope, idempotent Push Button System canonical catalog creation; never maps provider Products.';
