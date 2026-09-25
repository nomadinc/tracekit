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

-- Expand the operator-authorized Push Button System catalog and seed the
-- tenant-scoped mapping intelligence registry with facts confirmed during the
-- production catalog audit. This migration creates canonical targets and
-- recommendation rules only. It does not append mapping decisions and does not
-- mutate historical platform_orders revenue.

begin;

-- Explicit boundary for the historically tenant-scoped PBS transitions.
-- A completely absent tenant is the normal state of a fresh installation.
-- Partial or conflicting reuse of the fixed Production identities fails closed.
create or replace function public.pbs_historical_tenant_prerequisite_v1()
returns boolean
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_account_exists boolean;
  v_organization_exists boolean;
begin
  select exists (
    select 1 from public.tracekit_accounts
    where id = '39d895f9-71ac-44d3-ac33-6e9043f6267e'::uuid
  ) into v_account_exists;
  select exists (
    select 1 from public.tracekit_organizations
    where id = '5f1de64a-1b37-40bb-81c8-32197eda0b41'::uuid
  ) into v_organization_exists;

  if not v_account_exists and not v_organization_exists then return false; end if;
  if not exists (
    select 1 from public.tracekit_accounts
    where id = '39d895f9-71ac-44d3-ac33-6e9043f6267e'::uuid
      and account_type = 'client' and name = 'TraceKit' and status = 'active'
      and white_label_configuration = '{}'::jsonb
  ) or not exists (
    select 1 from public.tracekit_organizations
    where id = '5f1de64a-1b37-40bb-81c8-32197eda0b41'::uuid
      and owning_account_id = '39d895f9-71ac-44d3-ac33-6e9043f6267e'::uuid
      and agency_id is null and workos_organization_id is null
      and name = 'TraceKit' and status = 'active'
  ) then
    raise exception 'PBS historical tenant prerequisite conflicts with fixed scope'
      using errcode = '23505';
  end if;
  return true;
end;
$$;

revoke all on function public.pbs_historical_tenant_prerequisite_v1()
  from public, anon, authenticated;
grant execute on function public.pbs_historical_tenant_prerequisite_v1()
  to service_role;

-- When the exact tenant exists, require the separately operator-authorized
-- seven-step catalog foundation before applying any expansion DML.
do $pbs_foundation_validation$
begin
  if public.pbs_historical_tenant_prerequisite_v1() then
    if not exists (
      select 1 from public.tracekit_business_contexts
      where id = 'push-button-system-5f1de64a'
        and account_id = '39d895f9-71ac-44d3-ac33-6e9043f6267e'
        and organization_id = '5f1de64a-1b37-40bb-81c8-32197eda0b41'
        and name = 'Push Button System' and status = 'active' and fulfillment_type = 'digital'
        and metadata = '{"catalog_key":"push-button-system","identity_basis":"operator_authorized"}'::jsonb
    ) then raise exception 'Push Button System business context conflicts with approved foundation' using errcode = '23505'; end if;
    if not exists (
      select 1 from public.canonical_offers
      where id = 'b842611c-9918-40ac-9241-d542a8c6f8b4'
        and account_id = '39d895f9-71ac-44d3-ac33-6e9043f6267e'
        and organization_id = '5f1de64a-1b37-40bb-81c8-32197eda0b41'
        and business_context_id = 'push-button-system-5f1de64a'
        and name = 'Push Button System' and status = 'active'
        and metadata = '{"catalog_key":"push-button-system","identity_basis":"operator_authorized"}'::jsonb
    ) then raise exception 'Push Button System canonical offer conflicts with approved foundation' using errcode = '23505'; end if;
    if (
      select count(*) from public.offer_steps s
      join (values
        ('8110e951-8ca6-406a-8817-55575fe647ba'::uuid, 'front_end', 0, 'Front End', '{"catalog_key":"front-end","default_price":67,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb),
        ('8d1b5be3-c60c-45ec-baa6-a2e1b6b610d5'::uuid, 'upsell', 1, 'OTO 1 — Gold', '{"catalog_key":"oto-1-gold","default_price":297,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb),
        ('e215a9be-453c-461f-ab06-7e75742be9f1'::uuid, 'downsell', 1, 'OTO 1 — Downsell 1', '{"catalog_key":"oto-1-downsell-1","parent_step_key":"oto-1-gold","default_price":197,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb),
        ('2df33aef-aee2-459e-ac65-6e3cbd3dbd13'::uuid, 'downsell', 2, 'OTO 1 — Downsell 2', '{"catalog_key":"oto-1-downsell-2","parent_step_key":"oto-1-gold","default_price":97,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb),
        ('a4992adc-57e8-4bb1-9360-f421d2d9322c'::uuid, 'upsell', 2, 'OTO 2 — Platinum', '{"catalog_key":"oto-2-platinum","default_price":299,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb),
        ('bf339297-6717-4286-b83c-b9af54b8d0f3'::uuid, 'downsell', 3, 'OTO 2 — Downsell 1', '{"catalog_key":"oto-2-downsell-1","parent_step_key":"oto-2-platinum","default_price":199,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb),
        ('155997e9-244b-4547-94e0-4fde658f8c0f'::uuid, 'downsell', 4, 'OTO 2 — Downsell 2', '{"catalog_key":"oto-2-downsell-2","parent_step_key":"oto-2-platinum","default_price":99,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb)
      ) expected(id, role, sequence, label, metadata)
        on s.id = expected.id
       and s.organization_id = '5f1de64a-1b37-40bb-81c8-32197eda0b41'
       and s.canonical_offer_id = 'b842611c-9918-40ac-9241-d542a8c6f8b4'
       and s.role = expected.role and s.sequence = expected.sequence
       and s.label = expected.label and s.metadata = expected.metadata
    ) <> 7 then raise exception 'Push Button System foundational steps conflict with approved catalog' using errcode = '23505'; end if;
  end if;
end
$pbs_foundation_validation$;
-- Canonical steps: order bumps and confirmed upsell/downsell families.
insert into public.offer_steps
  (id, organization_id, canonical_offer_id, role, sequence, label, metadata)
select id::uuid, organization_id::uuid, canonical_offer_id::uuid,
       role, sequence, label, metadata
from (values
  ('a5d6d601-790d-4b7c-97f3-a9f833465ef5', '5f1de64a-1b37-40bb-81c8-32197eda0b41', 'b842611c-9918-40ac-9241-d542a8c6f8b4', 'order_bump', 1, 'Order Bump — Revenue Booster Roadmap',
   '{"catalog_key":"order-bump-revenue-booster-roadmap","parent_step_key":"front-end","default_price":25,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb),
  ('2fa222b9-1325-4cd5-b712-03313f093057', '5f1de64a-1b37-40bb-81c8-32197eda0b41', 'b842611c-9918-40ac-9241-d542a8c6f8b4', 'order_bump', 2, 'Order Bump — Fast Track Support',
   '{"catalog_key":"order-bump-fast-track-support","parent_step_key":"front-end","default_price":39,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb),
  ('95afea56-9792-4fda-960d-7256251f3523', '5f1de64a-1b37-40bb-81c8-32197eda0b41', 'b842611c-9918-40ac-9241-d542a8c6f8b4', 'order_bump', 3, 'Order Bump — Private 1V1 Coaching Call',
   '{"catalog_key":"order-bump-private-1v1-coaching","parent_step_key":"front-end","default_price":77,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb),

  ('5539e35e-3ac6-4a4b-9b6f-f2dd24243174', '5f1de64a-1b37-40bb-81c8-32197eda0b41', 'b842611c-9918-40ac-9241-d542a8c6f8b4', 'upsell', 5, 'Diamond',
   '{"catalog_key":"diamond","default_price":297,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb),
  ('f7cb7314-ac29-4375-b66d-638f48cb6d9d', '5f1de64a-1b37-40bb-81c8-32197eda0b41', 'b842611c-9918-40ac-9241-d542a8c6f8b4', 'downsell', 6, 'Ruby — Downsell 1',
   '{"catalog_key":"ruby","parent_step_key":"diamond","default_price":197,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb),
  ('cc840aa1-137e-410f-a694-b4e73911125a', '5f1de64a-1b37-40bb-81c8-32197eda0b41', 'b842611c-9918-40ac-9241-d542a8c6f8b4', 'downsell', 7, 'Sapphire — Downsell 2',
   '{"catalog_key":"sapphire","parent_step_key":"diamond","default_price":97,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb),
  ('a4bb6737-536b-4bcf-b8b4-c3521a98189a', '5f1de64a-1b37-40bb-81c8-32197eda0b41', 'b842611c-9918-40ac-9241-d542a8c6f8b4', 'downsell', 8, 'Sapphire — Downsell',
   '{"catalog_key":"sapphire-downsell","parent_step_key":"sapphire","default_price":75,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb),

  ('d61f4968-09ec-449c-98c8-f031799e88c8', '5f1de64a-1b37-40bb-81c8-32197eda0b41', 'b842611c-9918-40ac-9241-d542a8c6f8b4', 'upsell', 9, 'Mystery Box',
   '{"catalog_key":"mystery-box","default_price":247,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb),
  ('bf1a8bc2-c09b-443e-853a-7706aa359e2f', '5f1de64a-1b37-40bb-81c8-32197eda0b41', 'b842611c-9918-40ac-9241-d542a8c6f8b4', 'downsell', 10, 'Mystery Box — Downsell 1',
   '{"catalog_key":"mystery-box-downsell-1","parent_step_key":"mystery-box","default_price":147,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb),
  ('f6ed95ce-b067-4276-91c2-2d7204cb2b4e', '5f1de64a-1b37-40bb-81c8-32197eda0b41', 'b842611c-9918-40ac-9241-d542a8c6f8b4', 'downsell', 11, 'Mystery Box — Downsell 2',
   '{"catalog_key":"mystery-box-downsell-2","parent_step_key":"mystery-box","default_price":47,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb),

  ('995cc1b6-1d91-45a0-a571-d74cabbc8489', '5f1de64a-1b37-40bb-81c8-32197eda0b41', 'b842611c-9918-40ac-9241-d542a8c6f8b4', 'upsell', 12, 'Growth Partner',
   '{"catalog_key":"growth-partner","accepted_prices":[249,199,177],"currency":"USD","identity_basis":"operator_authorized","price_note":"historical/alternate upsell price points"}'::jsonb),
  ('960d9960-977a-45f3-927e-a2f4842ef287', '5f1de64a-1b37-40bb-81c8-32197eda0b41', 'b842611c-9918-40ac-9241-d542a8c6f8b4', 'downsell', 13, 'Growth Partner — Downsell',
   '{"catalog_key":"growth-partner-downsell","parent_step_key":"growth-partner","default_price":75,"currency":"USD","identity_basis":"operator_authorized"}'::jsonb),

  ('830a4236-1a26-435e-9b7f-d7016e142100', '5f1de64a-1b37-40bb-81c8-32197eda0b41', 'b842611c-9918-40ac-9241-d542a8c6f8b4', 'upsell', 14, 'Super Affiliate',
   '{"catalog_key":"super-affiliate","default_price":499,"currency":"USD","identity_basis":"operator_authorized","standalone":true,"has_downsells":false}'::jsonb)
) approved(id, organization_id, canonical_offer_id, role, sequence, label, metadata)
where public.pbs_historical_tenant_prerequisite_v1()
on conflict (id) do update
set role = excluded.role,
    sequence = excluded.sequence,
    label = excluded.label,
    metadata = excluded.metadata;

-- Safe default: recommendations are enabled for review, but automatic writes
-- remain disabled until explicitly authorized in a later rollout.
insert into public.commerce_product_mapping_policies
  (organization_id, provider, auto_map_enabled, auto_map_min_confidence,
   bulk_review_min_confidence, require_exact_id_for_auto_map)
select organization_id::uuid, provider, auto_map_enabled,
       auto_map_min_confidence, bulk_review_min_confidence,
       require_exact_id_for_auto_map
from (values
  ('5f1de64a-1b37-40bb-81c8-32197eda0b41', 'commas', false, 100, 90, true)
) approved(organization_id, provider, auto_map_enabled, auto_map_min_confidence, bulk_review_min_confidence, require_exact_id_for_auto_map)
where public.pbs_historical_tenant_prerequisite_v1()
on conflict (organization_id, provider) do update
set auto_map_enabled = false,
    auto_map_min_confidence = 100,
    bulk_review_min_confidence = 90,
    require_exact_id_for_auto_map = true,
    updated_at = now();

-- Exact provider-product identities. All seeded rules are suggestions: they may
-- preselect/bulk-group a target, but cannot append a mapping decision by
-- themselves. Provider IDs with unresolved business meaning are intentionally
-- omitted (Bronze/Silver, PBS $47, test product, legacy Mystery Box 9GOV4).
with seeded(provider_product_id, offer_step_id, price, price_role, evidence_note) as (
  values
    -- Existing approved baseline, taught to the registry.
    ('o2GYY','8110e951-8ca6-406a-8817-55575fe647ba'::uuid,67::numeric,'expected','approved front end'),
    ('Jz71g','8110e951-8ca6-406a-8817-55575fe647ba'::uuid,67::numeric,'expected','approved front end'),
    ('4KV26','8110e951-8ca6-406a-8817-55575fe647ba'::uuid,67::numeric,'expected','approved front end'),
    ('xz1kz','8110e951-8ca6-406a-8817-55575fe647ba'::uuid,67::numeric,'expected','approved front end'),
    ('v2Pg8','8d1b5be3-c60c-45ec-baa6-a2e1b6b610d5'::uuid,297::numeric,'expected','approved Gold'),
    ('yPV86','e215a9be-453c-461f-ab06-7e75742be9f1'::uuid,197::numeric,'expected','approved Gold downsell 1'),
    ('ADvn9','2df33aef-aee2-459e-ac65-6e3cbd3dbd13'::uuid,97::numeric,'expected','approved Gold downsell 2'),
    ('BBwgQ','a4992adc-57e8-4bb1-9360-f421d2d9322c'::uuid,299::numeric,'expected','approved Platinum'),
    ('ERzlW','bf339297-6717-4286-b83c-b9af54b8d0f3'::uuid,199::numeric,'expected','approved Platinum downsell 1'),
    ('G6BZK','155997e9-244b-4547-94e0-4fde658f8c0f'::uuid,99::numeric,'expected','corrected Platinum downsell 2'),

    -- Front-end IDs whose mixed transaction totals are explained by checkout
    -- order bumps; price is deliberately omitted as identity evidence.
    ('0E1ML','8110e951-8ca6-406a-8817-55575fe647ba'::uuid,null::numeric,'historical','front end with mixed checkout totals/order bumps'),
    ('6GO2R','8110e951-8ca6-406a-8817-55575fe647ba'::uuid,null::numeric,'historical','front end with mixed checkout totals/order bumps'),
    ('rVWgL','8110e951-8ca6-406a-8817-55575fe647ba'::uuid,null::numeric,'historical','front end with mixed checkout totals/order bumps'),
    ('KE1Ox','8110e951-8ca6-406a-8817-55575fe647ba'::uuid,null::numeric,'historical','front end with mixed checkout totals/order bumps'),

    -- Checkout order bumps.
    ('n7vOY','a5d6d601-790d-4b7c-97f3-a9f833465ef5'::uuid,25::numeric,'expected','Revenue Booster Roadmap order bump'),
    ('lXq77','2fa222b9-1325-4cd5-b712-03313f093057'::uuid,39::numeric,'expected','Fast Track Support order bump'),
    ('q6yZD','95afea56-9792-4fda-960d-7256251f3523'::uuid,77::numeric,'expected','Private 1V1 Coaching Call order bump'),

    -- Gold family.
    ('KApOM','8d1b5be3-c60c-45ec-baa6-a2e1b6b610d5'::uuid,295::numeric,'historical','Gold alternate price'),
    ('Qj92Y','8d1b5be3-c60c-45ec-baa6-a2e1b6b610d5'::uuid,297::numeric,'expected','Gold'),
    ('0EGXL','8d1b5be3-c60c-45ec-baa6-a2e1b6b610d5'::uuid,297::numeric,'expected','Gold NU2'),
    ('j5xMP','8d1b5be3-c60c-45ec-baa6-a2e1b6b610d5'::uuid,297::numeric,'expected','Gold 1'),
    ('lXrMM','e215a9be-453c-461f-ab06-7e75742be9f1'::uuid,197::numeric,'expected','Gold downsell 1 NU2'),
    ('6GgyV','e215a9be-453c-461f-ab06-7e75742be9f1'::uuid,197::numeric,'expected','Gold downsell 1'),
    ('mNWnr','2df33aef-aee2-459e-ac65-6e3cbd3dbd13'::uuid,97::numeric,'expected','Gold downsell 2'),
    ('pByXV','2df33aef-aee2-459e-ac65-6e3cbd3dbd13'::uuid,97::numeric,'expected','Gold downsell 2 NU2'),

    -- Platinum family.
    ('N1r82','a4992adc-57e8-4bb1-9360-f421d2d9322c'::uuid,299::numeric,'expected','Platinum'),
    ('223r1','a4992adc-57e8-4bb1-9360-f421d2d9322c'::uuid,299::numeric,'expected','Platinum 1'),
    ('x8K7B','bf339297-6717-4286-b83c-b9af54b8d0f3'::uuid,199::numeric,'expected','Platinum downsell 1 NU2'),
    ('Xq1w5','bf339297-6717-4286-b83c-b9af54b8d0f3'::uuid,199::numeric,'expected','Platinum downsell 1'),
    ('WpZvQ','155997e9-244b-4547-94e0-4fde658f8c0f'::uuid,99::numeric,'expected','Platinum downsell 2'),
    ('n6WoE','155997e9-244b-4547-94e0-4fde658f8c0f'::uuid,99::numeric,'expected','Platinum downsell 2'),
    ('y7LJn','155997e9-244b-4547-94e0-4fde658f8c0f'::uuid,99::numeric,'expected','Platinum downsell 2 NU2'),

    -- Diamond / Ruby / Sapphire family.
    ('VJEPv','5539e35e-3ac6-4a4b-9b6f-f2dd24243174'::uuid,297::numeric,'expected','Diamond upsell'),
    ('1VyrV','f7cb7314-ac29-4375-b66d-638f48cb6d9d'::uuid,197::numeric,'expected','Ruby downsell 1'),
    ('4WBRV','cc840aa1-137e-410f-a694-b4e73911125a'::uuid,97::numeric,'expected','Sapphire downsell 2'),
    ('5AD9K','a4bb6737-536b-4bcf-b8b4-c3521a98189a'::uuid,75::numeric,'expected','Sapphire own downsell'),

    -- Mystery Box family. Legacy 9GOV4 is intentionally not seeded because its
    -- $148 observation conflicts with the primary-product name.
    ('6YERV','d61f4968-09ec-449c-98c8-f031799e88c8'::uuid,247::numeric,'expected','Mystery Box upsell'),
    ('3ELOR','bf1a8bc2-c09b-443e-853a-7706aa359e2f'::uuid,147::numeric,'expected','Mystery Box downsell 1 NU2'),
    ('7DGLy','bf1a8bc2-c09b-443e-853a-7706aa359e2f'::uuid,147::numeric,'expected','Mystery Box downsell 1'),
    ('qLWrG','f6ed95ce-b067-4276-91c2-2d7204cb2b4e'::uuid,47::numeric,'expected','Mystery Box downsell 2'),
    ('Gz3y7','f6ed95ce-b067-4276-91c2-2d7204cb2b4e'::uuid,47::numeric,'expected','Mystery Box downsell 2 NU2'),
    ('q6Go0','f6ed95ce-b067-4276-91c2-2d7204cb2b4e'::uuid,47::numeric,'expected','Mystery Box downsell 2'),

    -- Growth Partner: $249/$199/$177 are alternate upsell price points; $75 is
    -- the confirmed downsell.
    ('GwlZL','995cc1b6-1d91-45a0-a571-d74cabbc8489'::uuid,249::numeric,'expected','Growth Partner upsell'),
    ('1EJBm','995cc1b6-1d91-45a0-a571-d74cabbc8489'::uuid,null::numeric,'historical','Growth Partner NU2 mixed historical pricing'),
    ('Kz0GM','995cc1b6-1d91-45a0-a571-d74cabbc8489'::uuid,249::numeric,'expected','Growth Partner upsell'),
    ('JEoZJ','995cc1b6-1d91-45a0-a571-d74cabbc8489'::uuid,177::numeric,'historical','Growth Partner alternate upsell price'),
    ('ZvpxR','995cc1b6-1d91-45a0-a571-d74cabbc8489'::uuid,199::numeric,'historical','Growth Partner alternate upsell price'),
    ('pLWqN','960d9960-977a-45f3-927e-a2f4842ef287'::uuid,75::numeric,'expected','Growth Partner downsell'),
    ('q6zw2','960d9960-977a-45f3-927e-a2f4842ef287'::uuid,75::numeric,'expected','Growth Partner downsell NU2'),

    ('Yr3l2','830a4236-1a26-435e-9b7f-d7016e142100'::uuid,499::numeric,'expected','Super Affiliate standalone upsell')
), upserted as (
  insert into public.commerce_product_mapping_rules
    (organization_id, connection_id, provider_account_id, provider, rule_kind,
     match_value, normalized_match_value, business_context_id, canonical_offer_id,
     offer_step_id, offer_variant_id, confidence, execution_mode, status, priority, evidence)
  select
    '5f1de64a-1b37-40bb-81c8-32197eda0b41'::uuid,
    'ea1c2313-6120-4692-84c5-ec3562e7dcf6'::uuid,
    '0369c701-717f-4c34-b230-8341bcdb7e65'::uuid,
    'commas', 'provider_product_id', s.provider_product_id, lower(s.provider_product_id),
    'push-button-system-5f1de64a', 'b842611c-9918-40ac-9241-d542a8c6f8b4'::uuid,
    s.offer_step_id, null, 100, 'suggest', 'active', 10,
    jsonb_build_object('identity_basis','operator_authorized','source','pbs-production-catalog-audit','note',s.evidence_note)
  from seeded s
  where public.pbs_historical_tenant_prerequisite_v1()
  on conflict (
    organization_id,
    (coalesce(connection_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    (coalesce(provider_account_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    provider, rule_kind, normalized_match_value, canonical_offer_id, offer_step_id,
    (coalesce(offer_variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  ) do update
    set confidence = excluded.confidence,
        execution_mode = excluded.execution_mode,
        status = excluded.status,
        priority = excluded.priority,
        evidence = excluded.evidence,
        updated_at = now()
  returning id, match_value
)
insert into public.commerce_product_mapping_rule_prices
  (rule_id, amount, currency, evidence_weight, price_role)
select r.id, s.price, 'USD', 10, s.price_role
from seeded s
join upserted r on r.match_value = s.provider_product_id
where s.price is not null
on conflict (rule_id, amount, currency) do update
set evidence_weight = excluded.evidence_weight,
    price_role = excluded.price_role;

-- Add a small set of safe title aliases. Deliberately exclude titles that are
-- reused across different canonical targets (for example Growth Partner
-- Discounted and Mystery Box), so name similarity cannot hide ambiguity.
with aliases(match_value, offer_step_id, confidence, priority) as (
  values
    ('diamond','5539e35e-3ac6-4a4b-9b6f-f2dd24243174'::uuid,98,50),
    ('ruby','f7cb7314-ac29-4375-b66d-638f48cb6d9d'::uuid,98,50),
    ('sapphire','cc840aa1-137e-410f-a694-b4e73911125a'::uuid,98,50),
    ('sapphire discounted','a4bb6737-536b-4bcf-b8b4-c3521a98189a'::uuid,98,50),
    ('revenue booster roadmap','a5d6d601-790d-4b7c-97f3-a9f833465ef5'::uuid,98,50),
    ('fast track support','2fa222b9-1325-4cd5-b712-03313f093057'::uuid,98,50),
    ('private 1v1 coaching call','95afea56-9792-4fda-960d-7256251f3523'::uuid,98,50),
    ('super affiliate - nu2','830a4236-1a26-435e-9b7f-d7016e142100'::uuid,98,50)
)
insert into public.commerce_product_mapping_rules
  (organization_id, connection_id, provider_account_id, provider, rule_kind,
   match_value, normalized_match_value, business_context_id, canonical_offer_id,
   offer_step_id, offer_variant_id, confidence, execution_mode, status, priority, evidence)
select
  '5f1de64a-1b37-40bb-81c8-32197eda0b41'::uuid,
  'ea1c2313-6120-4692-84c5-ec3562e7dcf6'::uuid,
  '0369c701-717f-4c34-b230-8341bcdb7e65'::uuid,
  'commas', 'normalized_title', a.match_value, a.match_value,
  'push-button-system-5f1de64a', 'b842611c-9918-40ac-9241-d542a8c6f8b4'::uuid,
  a.offer_step_id, null, a.confidence, 'suggest', 'active', a.priority,
  jsonb_build_object('identity_basis','operator_authorized_alias','source','pbs-production-catalog-audit')
from aliases a
where public.pbs_historical_tenant_prerequisite_v1()
on conflict (
  organization_id,
  (coalesce(connection_id, '00000000-0000-0000-0000-000000000000'::uuid)),
  (coalesce(provider_account_id, '00000000-0000-0000-0000-000000000000'::uuid)),
  provider, rule_kind, normalized_match_value, canonical_offer_id, offer_step_id,
  (coalesce(offer_variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
) do update
set confidence = excluded.confidence,
    execution_mode = excluded.execution_mode,
    status = excluded.status,
    priority = excluded.priority,
    evidence = excluded.evidence,
    updated_at = now();

commit;
