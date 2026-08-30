-- Expand the operator-authorized Push Button System catalog and seed the
-- tenant-scoped mapping intelligence registry with facts confirmed during the
-- production catalog audit. This migration creates canonical targets and
-- recommendation rules only. It does not append mapping decisions and does not
-- mutate historical platform_orders revenue.

begin;

-- Canonical steps: order bumps and confirmed upsell/downsell families.
insert into public.offer_steps
  (id, organization_id, canonical_offer_id, role, sequence, label, metadata)
values
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
values
  ('5f1de64a-1b37-40bb-81c8-32197eda0b41', 'commas', false, 100, 90, true)
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
