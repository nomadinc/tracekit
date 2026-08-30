-- Complete the operator-authorized Push Button System catalog and exact-ID
-- recommendation knowledge. This migration does not map a provider product,
-- append a mapping decision, or modify historical orders.

begin;

do $$
declare
  v_org constant uuid := '5f1de64a-1b37-40bb-81c8-32197eda0b41';
  v_offer constant uuid := 'b842611c-9918-40ac-9241-d542a8c6f8b4';
  v_connection constant uuid := 'ea1c2313-6120-4692-84c5-ec3562e7dcf6';
  v_account constant uuid := '0369c701-717f-4c34-b230-8341bcdb7e65';
  v_test_product uuid;
begin
  -- Existing identities are fixed production contracts. Fail closed rather
  -- than accidentally creating a parallel branch or replacing an approved
  -- target.
  if not exists (
    select 1 from public.offer_steps
    where id = '8d1b5be3-c60c-45ec-baa6-a2e1b6b610d5'::uuid
      and organization_id = v_org and canonical_offer_id = v_offer
      and metadata->>'catalog_key' = 'oto-1-gold'
  ) then raise exception 'expected existing Gold canonical step'; end if;

  if not exists (
    select 1 from public.offer_steps
    where id = '995cc1b6-1d91-45a0-a571-d74cabbc8489'::uuid
      and organization_id = v_org and canonical_offer_id = v_offer
      and metadata->>'catalog_key' = 'growth-partner'
  ) then raise exception 'expected existing Growth Partner canonical step'; end if;

  if not exists (
    select 1 from public.offer_steps
    where id = '960d9960-977a-45f3-927e-a2f4842ef287'::uuid
      and organization_id = v_org and canonical_offer_id = v_offer
      and metadata->>'catalog_key' in ('growth-partner-downsell', 'growth-partner-downsell-2')
  ) then raise exception 'expected existing Growth Partner $75 canonical step'; end if;

  if exists (
    select 1 from public.offer_steps
    where organization_id = v_org and canonical_offer_id = v_offer
      and metadata->>'catalog_key' in (
        'original-gold-silver', 'original-gold-bronze',
        'original-gold-bronze-discounted', 'growth-partner-downsell-1'
      )
      and id not in (
        '67cb7e8d-e91d-42a8-a6db-69b60c18cc26'::uuid,
        'd7d5a3c4-15b3-40e5-a16b-e43eced43d1e'::uuid,
        'ce2fa379-eeb7-4c37-a17c-d2012679c3d7'::uuid,
        'a04a0cab-af78-4664-9d37-3a2677a4750f'::uuid
      )
  ) then raise exception 'canonical catalog key already belongs to another step'; end if;

  if exists (
    select 1 from public.commerce_provider_products
    where organization_id = v_org and connection_id = v_connection
      and provider_account_id = v_account
      and provider_product_id in ('q6zw2', 'pLWqN')
      and mapping_status = 'approved'
      and offer_step_id is distinct from '960d9960-977a-45f3-927e-a2f4842ef287'::uuid
  ) then raise exception 'approved Growth Partner $75 mapping target changed unexpectedly'; end if;

  select id into v_test_product
  from public.commerce_provider_products
  where organization_id = v_org and connection_id = v_connection
    and provider_account_id = v_account and provider_product_id = '7pQKA'
  for update;
  if not found then raise exception 'expected affiliate tracking test provider product'; end if;

  if exists (
    select 1 from public.commerce_provider_products
    where id = v_test_product
      and not (
        (mapping_status = 'review_required' and business_context_id is null
          and canonical_offer_id is null and offer_step_id is null and offer_variant_id is null)
        or
        (mapping_status = 'retired'
          and metadata @> '{"classification":"test_non_commerce","review_suppressed":true}'::jsonb)
      )
  ) then raise exception 'affiliate tracking test product is not safely suppressible'; end if;
end $$;

-- The original Gold UUID remains untouched. These new steps describe the
-- older Gold -> Silver -> Bronze -> Bronze Discounted branch.
insert into public.offer_steps
  (id, organization_id, canonical_offer_id, role, sequence, label, metadata)
values
  ('67cb7e8d-e91d-42a8-a6db-69b60c18cc26', '5f1de64a-1b37-40bb-81c8-32197eda0b41', 'b842611c-9918-40ac-9241-d542a8c6f8b4', 'downsell', 15, 'Silver',
   '{"catalog_key":"original-gold-silver","parent_step_key":"oto-1-gold","default_price":195,"accepted_prices":[195],"currency":"USD","identity_basis":"operator_authorized"}'::jsonb),
  ('d7d5a3c4-15b3-40e5-a16b-e43eced43d1e', '5f1de64a-1b37-40bb-81c8-32197eda0b41', 'b842611c-9918-40ac-9241-d542a8c6f8b4', 'downsell', 16, 'Bronze',
   '{"catalog_key":"original-gold-bronze","parent_step_key":"original-gold-silver","default_price":95,"accepted_prices":[95],"currency":"USD","identity_basis":"operator_authorized"}'::jsonb),
  ('ce2fa379-eeb7-4c37-a17c-d2012679c3d7', '5f1de64a-1b37-40bb-81c8-32197eda0b41', 'b842611c-9918-40ac-9241-d542a8c6f8b4', 'downsell', 17, 'Bronze Discounted',
   '{"catalog_key":"original-gold-bronze-discounted","parent_step_key":"original-gold-bronze","default_price":79,"accepted_prices":[70,79],"currency":"USD","identity_basis":"operator_authorized","price_note":"historical price tests of one canonical step"}'::jsonb),
  ('a04a0cab-af78-4664-9d37-3a2677a4750f', '5f1de64a-1b37-40bb-81c8-32197eda0b41', 'b842611c-9918-40ac-9241-d542a8c6f8b4', 'downsell', 18, 'Growth Partner — Downsell 1',
   '{"catalog_key":"growth-partner-downsell-1","parent_step_key":"growth-partner","default_price":199,"accepted_prices":[177,199],"currency":"USD","identity_basis":"operator_authorized","price_note":"historical price tests of one canonical step"}'::jsonb)
on conflict (id) do update set
  role = excluded.role,
  sequence = excluded.sequence,
  label = excluded.label,
  metadata = excluded.metadata,
  updated_at = now();

-- Correct price evidence on the existing Growth Partner parent without
-- changing its identity, then preserve and reposition the existing $75 UUID.
update public.offer_steps
set metadata = metadata || '{"default_price":249,"accepted_prices":[249],"price_note":"confirmed Growth Partner upsell"}'::jsonb,
    updated_at = now()
where id = '995cc1b6-1d91-45a0-a571-d74cabbc8489'::uuid
  and organization_id = '5f1de64a-1b37-40bb-81c8-32197eda0b41'::uuid
  and canonical_offer_id = 'b842611c-9918-40ac-9241-d542a8c6f8b4'::uuid;

update public.offer_steps
set label = 'Growth Partner — Downsell 2',
    sequence = 19,
    metadata = '{"catalog_key":"growth-partner-downsell-2","parent_step_key":"growth-partner-downsell-1","default_price":75,"accepted_prices":[75],"currency":"USD","identity_basis":"operator_authorized"}'::jsonb,
    updated_at = now()
where id = '960d9960-977a-45f3-927e-a2f4842ef287'::uuid
  and organization_id = '5f1de64a-1b37-40bb-81c8-32197eda0b41'::uuid
  and canonical_offer_id = 'b842611c-9918-40ac-9241-d542a8c6f8b4'::uuid;

-- Exact provider identities only. Prices corroborate these operator-authorized
-- identities but cannot create a recommendation by themselves.
with seeded(provider_product_id, offer_step_id, price, price_role, note) as (
  values
    ('N7v9D', '67cb7e8d-e91d-42a8-a6db-69b60c18cc26'::uuid, 195::numeric, 'expected', 'Original Gold branch Silver'),
    ('OJwyY', 'd7d5a3c4-15b3-40e5-a16b-e43eced43d1e'::uuid, 95::numeric, 'expected', 'Original Gold branch Bronze'),
    ('QAy00', 'ce2fa379-eeb7-4c37-a17c-d2012679c3d7'::uuid, 79::numeric, 'historical', 'Bronze Discounted historical $79 test'),
    ('lXDqJ', 'ce2fa379-eeb7-4c37-a17c-d2012679c3d7'::uuid, 70::numeric, 'historical', 'Bronze Discounted historical $70 test'),
    ('ZvpxR', 'a04a0cab-af78-4664-9d37-3a2677a4750f'::uuid, 199::numeric, 'historical', 'Growth Partner Downsell 1 historical $199 test'),
    ('JEoZJ', 'a04a0cab-af78-4664-9d37-3a2677a4750f'::uuid, 177::numeric, 'historical', 'Growth Partner Downsell 1 historical $177 test'),
    ('N7Jr6', '8110e951-8ca6-406a-8817-55575fe647ba'::uuid, 47::numeric, 'historical', 'Retired PBS Front End $47 split test; identity remains Front End'),
    ('9GOV4', 'bf1a8bc2-c09b-443e-853a-7706aa359e2f'::uuid, 148::numeric, 'historical', 'Historical $148 typo/version of Mystery Box Downsell 1')
), upserted as (
  insert into public.commerce_product_mapping_rules
    (organization_id, connection_id, provider_account_id, provider, rule_kind,
     match_value, normalized_match_value, business_context_id, canonical_offer_id,
     offer_step_id, offer_variant_id, confidence, execution_mode, status, priority, evidence)
  select
    '5f1de64a-1b37-40bb-81c8-32197eda0b41'::uuid,
    'ea1c2313-6120-4692-84c5-ec3562e7dcf6'::uuid,
    '0369c701-717f-4c34-b230-8341bcdb7e65'::uuid,
    'commas', 'provider_product_id', s.provider_product_id, s.provider_product_id,
    'push-button-system-5f1de64a', 'b842611c-9918-40ac-9241-d542a8c6f8b4'::uuid,
    s.offer_step_id, null, 100, 'suggest', 'active', 10,
    jsonb_build_object('identity_basis','operator_authorized','source','pbs-final-catalog-confirmation','note',s.note)
  from seeded s
  on conflict (
    organization_id,
    (coalesce(connection_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    (coalesce(provider_account_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    provider, rule_kind, normalized_match_value, canonical_offer_id, offer_step_id,
    (coalesce(offer_variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  ) do update set
    match_value = excluded.match_value,
    confidence = excluded.confidence,
    execution_mode = excluded.execution_mode,
    status = excluded.status,
    priority = excluded.priority,
    evidence = excluded.evidence,
    updated_at = now()
  returning id, match_value
)
insert into public.commerce_product_mapping_rule_prices
  (rule_id, amount, currency, evidence_weight, price_role)
select u.id, s.price, 'USD', 10, s.price_role
from seeded s join upserted u on u.match_value = s.provider_product_id
on conflict (rule_id, amount, currency) do update set
  evidence_weight = excluded.evidence_weight,
  price_role = excluded.price_role;

-- Retarget the two former Growth Partner parent rules defensively. Their old
-- inactive rows remain as durable correction history; the new exact-ID rules
-- above are the only active suggestions for these provider IDs.
update public.commerce_product_mapping_rules
set status = 'inactive', updated_at = now()
where organization_id = '5f1de64a-1b37-40bb-81c8-32197eda0b41'::uuid
  and connection_id = 'ea1c2313-6120-4692-84c5-ec3562e7dcf6'::uuid
  and provider_account_id = '0369c701-717f-4c34-b230-8341bcdb7e65'::uuid
  and provider = 'commas' and rule_kind = 'provider_product_id'
  and match_value in ('ZvpxR', 'JEoZJ')
  and offer_step_id = '995cc1b6-1d91-45a0-a571-d74cabbc8489'::uuid;

-- A provider product used solely for affiliate instrumentation is not a
-- rejected commerce mapping. Retired is the existing non-actionable lifecycle
-- state; metadata retains the explicit non-commerce classification and source
-- evidence while all immutable orders and provider identity remain untouched.
update public.commerce_provider_products
set mapping_status = 'retired',
    metadata = metadata || jsonb_build_object(
      'classification', 'test_non_commerce',
      'review_suppressed', true,
      'exclusion_reason', 'affiliate_tracking_test',
      'identity_basis', 'operator_authorized'
    ),
    updated_at = now()
where organization_id = '5f1de64a-1b37-40bb-81c8-32197eda0b41'::uuid
  and connection_id = 'ea1c2313-6120-4692-84c5-ec3562e7dcf6'::uuid
  and provider_account_id = '0369c701-717f-4c34-b230-8341bcdb7e65'::uuid
  and provider_product_id = '7pQKA'
  and mapping_status in ('review_required', 'retired')
  and canonical_offer_id is null and offer_step_id is null and offer_variant_id is null;

-- Recommendation knowledge remains review-only and automatic mapping remains
-- explicitly disabled.
update public.commerce_product_mapping_policies
set auto_map_enabled = false, updated_at = now()
where organization_id = '5f1de64a-1b37-40bb-81c8-32197eda0b41'::uuid
  and provider = 'commas';

do $$
declare
  v_org constant uuid := '5f1de64a-1b37-40bb-81c8-32197eda0b41';
  v_connection constant uuid := 'ea1c2313-6120-4692-84c5-ec3562e7dcf6';
  v_account constant uuid := '0369c701-717f-4c34-b230-8341bcdb7e65';
begin
  if (select count(*) from public.commerce_product_mapping_rules
      where organization_id=v_org and connection_id=v_connection and provider_account_id=v_account
        and provider='commas' and rule_kind='provider_product_id' and status='active'
        and execution_mode='suggest' and match_value in ('N7v9D','OJwyY','QAy00','lXDqJ','ZvpxR','JEoZJ','N7Jr6','9GOV4')) <> 8
  then raise exception 'final exact-ID recommendation set incomplete'; end if;

  if exists (select 1 from public.commerce_product_mapping_rules
      where organization_id=v_org and connection_id=v_connection and provider_account_id=v_account
        and provider='commas' and status='active' and execution_mode <> 'suggest')
  then raise exception 'active Commas recommendation is not suggest-only'; end if;

  if not exists (select 1 from public.commerce_provider_products
      where organization_id=v_org and connection_id=v_connection and provider_account_id=v_account
        and provider_product_id='7pQKA' and mapping_status='retired'
        and business_context_id is null and canonical_offer_id is null and offer_step_id is null
        and metadata @> '{"classification":"test_non_commerce","review_suppressed":true}'::jsonb)
  then raise exception 'affiliate tracking test product suppression failed'; end if;

  if exists (select 1 from public.commerce_product_mapping_policies
      where organization_id=v_org and provider='commas' and auto_map_enabled)
  then raise exception 'Commas auto-map must remain disabled'; end if;
end $$;

commit;
