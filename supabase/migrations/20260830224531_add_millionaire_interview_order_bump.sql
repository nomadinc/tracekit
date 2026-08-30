-- Add the operator-authorized Millionaire Interview Series order bump and its
-- exact Commas provider identity. This migration creates recommendation
-- knowledge only; it does not map a provider product or touch historical data.

begin;

do $$
declare
  v_org constant uuid := '5f1de64a-1b37-40bb-81c8-32197eda0b41';
  v_offer constant uuid := 'b842611c-9918-40ac-9241-d542a8c6f8b4';
  v_connection constant uuid := 'ea1c2313-6120-4692-84c5-ec3562e7dcf6';
  v_account constant uuid := '0369c701-717f-4c34-b230-8341bcdb7e65';
begin
  if not exists (
    select 1 from public.canonical_offers
    where id = v_offer and organization_id = v_org
      and business_context_id = 'push-button-system-5f1de64a'
  ) then raise exception 'expected Push Button System canonical offer'; end if;

  if not exists (
    select 1 from public.commerce_provider_products
    where organization_id = v_org and connection_id = v_connection
      and provider_account_id = v_account and provider_product_id = 'vREZg'
      and mapping_status = 'review_required'
      and business_context_id is null and canonical_offer_id is null
      and offer_step_id is null and offer_variant_id is null
  ) then raise exception 'expected unresolved Millionaire Interview Series provider product'; end if;

  if exists (
    select 1 from public.offer_steps
    where organization_id = v_org and canonical_offer_id = v_offer
      and metadata->>'catalog_key' = 'order-bump-millionaire-interview-series'
      and id <> 'efc6b70d-296c-4f28-8c50-3851dd0c467e'::uuid
  ) then raise exception 'Millionaire Interview Series catalog key already belongs to another step'; end if;

  if exists (
    select 1 from public.commerce_product_mapping_rules
    where organization_id = v_org and connection_id = v_connection
      and provider_account_id = v_account and provider = 'commas'
      and rule_kind = 'provider_product_id' and normalized_match_value = 'vREZg'
      and status = 'active'
      and offer_step_id <> 'efc6b70d-296c-4f28-8c50-3851dd0c467e'::uuid
  ) then raise exception 'vREZg already has a conflicting active recommendation'; end if;
end $$;

insert into public.offer_steps
  (id, organization_id, canonical_offer_id, role, sequence, label, metadata)
values
  ('efc6b70d-296c-4f28-8c50-3851dd0c467e',
   '5f1de64a-1b37-40bb-81c8-32197eda0b41',
   'b842611c-9918-40ac-9241-d542a8c6f8b4',
   'order_bump', 4, 'Order Bump — Millionaire Interview Series',
   '{"catalog_key":"order-bump-millionaire-interview-series","parent_step_key":"front-end","default_price":94,"accepted_prices":[94],"currency":"USD","identity_basis":"operator_authorized"}'::jsonb)
on conflict (id) do update set
  role = excluded.role,
  sequence = excluded.sequence,
  label = excluded.label,
  metadata = excluded.metadata,
  updated_at = now();

with upserted as (
  insert into public.commerce_product_mapping_rules
    (organization_id, connection_id, provider_account_id, provider, rule_kind,
     match_value, normalized_match_value, business_context_id, canonical_offer_id,
     offer_step_id, offer_variant_id, confidence, execution_mode, status, priority, evidence)
  values
    ('5f1de64a-1b37-40bb-81c8-32197eda0b41',
     'ea1c2313-6120-4692-84c5-ec3562e7dcf6',
     '0369c701-717f-4c34-b230-8341bcdb7e65',
     'commas', 'provider_product_id', 'vREZg', 'vREZg',
     'push-button-system-5f1de64a',
     'b842611c-9918-40ac-9241-d542a8c6f8b4',
     'efc6b70d-296c-4f28-8c50-3851dd0c467e', null,
     100, 'suggest', 'active', 10,
     '{"identity_basis":"operator_authorized","source":"pbs-final-catalog-confirmation","note":"Millionaire Interview Series order bump"}'::jsonb)
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
  returning id
)
insert into public.commerce_product_mapping_rule_prices
  (rule_id, amount, currency, evidence_weight, price_role)
select id, 94, 'USD', 10, 'supporting' from upserted
on conflict (rule_id, amount, currency) do update set
  evidence_weight = excluded.evidence_weight,
  price_role = excluded.price_role;

-- Preserve the global safety posture explicitly.
update public.commerce_product_mapping_policies
set auto_map_enabled = false, updated_at = now()
where organization_id = '5f1de64a-1b37-40bb-81c8-32197eda0b41'::uuid
  and provider = 'commas';

do $$
begin
  if not exists (
    select 1 from public.offer_steps
    where id = 'efc6b70d-296c-4f28-8c50-3851dd0c467e'::uuid
      and role = 'order_bump'
      and metadata @> '{"catalog_key":"order-bump-millionaire-interview-series","accepted_prices":[94],"identity_basis":"operator_authorized"}'::jsonb
  ) then raise exception 'Millionaire Interview Series canonical step validation failed'; end if;

  if not exists (
    select 1 from public.commerce_product_mapping_rules r
    join public.commerce_product_mapping_rule_prices p on p.rule_id = r.id
    where r.organization_id = '5f1de64a-1b37-40bb-81c8-32197eda0b41'::uuid
      and r.connection_id = 'ea1c2313-6120-4692-84c5-ec3562e7dcf6'::uuid
      and r.provider_account_id = '0369c701-717f-4c34-b230-8341bcdb7e65'::uuid
      and r.provider = 'commas' and r.rule_kind = 'provider_product_id'
      and r.match_value = 'vREZg' and r.normalized_match_value = 'vREZg'
      and r.offer_step_id = 'efc6b70d-296c-4f28-8c50-3851dd0c467e'::uuid
      and r.confidence = 100 and r.execution_mode = 'suggest' and r.status = 'active'
      and p.amount = 94 and p.currency = 'USD' and p.price_role = 'supporting'
  ) then raise exception 'vREZg exact-ID recommendation validation failed'; end if;

  if exists (
    select 1 from public.commerce_product_mapping_rules
    where organization_id = '5f1de64a-1b37-40bb-81c8-32197eda0b41'::uuid
      and provider = 'commas' and status = 'active' and execution_mode <> 'suggest'
  ) then raise exception 'active Commas recommendation is not suggest-only'; end if;

  if exists (
    select 1 from public.commerce_product_mapping_policies
    where organization_id = '5f1de64a-1b37-40bb-81c8-32197eda0b41'::uuid
      and provider = 'commas' and auto_map_enabled
  ) then raise exception 'Commas auto-map must remain disabled'; end if;
end $$;

commit;
