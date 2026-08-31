-- Add operator-authorized recommendation knowledge for the newly observed
-- Commas Platinum provider identity. This migration does not approve the
-- provider product, create catalog state, or alter historical commerce facts.

begin;

do $$
declare
  v_org constant uuid := '5f1de64a-1b37-40bb-81c8-32197eda0b41';
  v_offer constant uuid := 'b842611c-9918-40ac-9241-d542a8c6f8b4';
  v_step constant uuid := 'a4992adc-57e8-4bb1-9360-f421d2d9322c';
  v_connection constant uuid := 'ea1c2313-6120-4692-84c5-ec3562e7dcf6';
  v_account constant uuid := '0369c701-717f-4c34-b230-8341bcdb7e65';
begin
  if not exists (
    select 1
    from public.offer_steps
    where id = v_step
      and organization_id = v_org
      and canonical_offer_id = v_offer
      and role = 'upsell'
      and label = 'OTO 2 — Platinum'
      and metadata->>'catalog_key' = 'oto-2-platinum'
  ) then
    raise exception 'expected existing Push Button System OTO 2 Platinum target';
  end if;

  if not exists (
    select 1
    from public.commerce_provider_products
    where organization_id = v_org
      and connection_id = v_connection
      and provider_account_id = v_account
      and provider_product_id = '5M6yv'
      and mapping_status = 'review_required'
      and mapping_version = 'unmapped-v1'
      and business_context_id is null
      and canonical_offer_id is null
      and offer_step_id is null
      and offer_variant_id is null
  ) then
    raise exception 'expected unresolved 5M6yv provider product';
  end if;

  if exists (
    select 1
    from public.commerce_product_mapping_rules
    where organization_id = v_org
      and connection_id = v_connection
      and provider_account_id = v_account
      and provider = 'commas'
      and rule_kind = 'provider_product_id'
      and normalized_match_value = '5M6yv'
      and status = 'active'
      and (canonical_offer_id <> v_offer or offer_step_id <> v_step or offer_variant_id is not null)
  ) then
    raise exception '5M6yv already has a conflicting active recommendation';
  end if;

  if not exists (
    select 1
    from public.commerce_product_mapping_policies
    where organization_id = v_org
      and provider = 'commas'
      and auto_map_enabled = false
  ) then
    raise exception 'Commas auto-map must be disabled';
  end if;
end $$;

with upserted as (
  insert into public.commerce_product_mapping_rules
    (organization_id, connection_id, provider_account_id, provider, rule_kind,
     match_value, normalized_match_value, business_context_id, canonical_offer_id,
     offer_step_id, offer_variant_id, confidence, execution_mode, status, priority, evidence)
  values
    ('5f1de64a-1b37-40bb-81c8-32197eda0b41',
     'ea1c2313-6120-4692-84c5-ec3562e7dcf6',
     '0369c701-717f-4c34-b230-8341bcdb7e65',
     'commas', 'provider_product_id', '5M6yv', '5M6yv',
     'push-button-system-5f1de64a',
     'b842611c-9918-40ac-9241-d542a8c6f8b4',
     'a4992adc-57e8-4bb1-9360-f421d2d9322c', null,
     100, 'suggest', 'active', 10,
     '{"identity_basis":"operator_authorized","source":"operator-confirmed-commas-classification","note":"5M6yv is the existing Push Button System OTO 2 Platinum product"}'::jsonb)
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
select id, 299, 'USD', 10, 'supporting'
from upserted
on conflict (rule_id, amount, currency) do update set
  evidence_weight = excluded.evidence_weight,
  price_role = excluded.price_role;

do $$
begin
  if not exists (
    select 1
    from public.commerce_product_mapping_rules r
    join public.commerce_product_mapping_rule_prices p on p.rule_id = r.id
    where r.organization_id = '5f1de64a-1b37-40bb-81c8-32197eda0b41'::uuid
      and r.connection_id = 'ea1c2313-6120-4692-84c5-ec3562e7dcf6'::uuid
      and r.provider_account_id = '0369c701-717f-4c34-b230-8341bcdb7e65'::uuid
      and r.provider = 'commas'
      and r.rule_kind = 'provider_product_id'
      and r.match_value = '5M6yv'
      and r.normalized_match_value = '5M6yv'
      and r.business_context_id = 'push-button-system-5f1de64a'
      and r.canonical_offer_id = 'b842611c-9918-40ac-9241-d542a8c6f8b4'::uuid
      and r.offer_step_id = 'a4992adc-57e8-4bb1-9360-f421d2d9322c'::uuid
      and r.offer_variant_id is null
      and r.confidence = 100
      and r.execution_mode = 'suggest'
      and r.status = 'active'
      and r.evidence->>'identity_basis' = 'operator_authorized'
      and p.amount = 299
      and p.currency = 'USD'
      and p.price_role = 'supporting'
  ) then
    raise exception '5M6yv exact-ID recommendation validation failed';
  end if;

  if exists (
    select 1
    from public.commerce_product_mapping_rules
    where organization_id = '5f1de64a-1b37-40bb-81c8-32197eda0b41'::uuid
      and provider = 'commas'
      and status = 'active'
      and execution_mode <> 'suggest'
  ) then
    raise exception 'active Commas recommendation is not suggest-only';
  end if;

  if exists (
    select 1
    from public.commerce_provider_products
    where organization_id = '5f1de64a-1b37-40bb-81c8-32197eda0b41'::uuid
      and connection_id = 'ea1c2313-6120-4692-84c5-ec3562e7dcf6'::uuid
      and provider_account_id = '0369c701-717f-4c34-b230-8341bcdb7e65'::uuid
      and provider_product_id = '5M6yv'
      and (mapping_status <> 'review_required' or mapping_version <> 'unmapped-v1'
        or canonical_offer_id is not null or offer_step_id is not null)
  ) then
    raise exception 'recommendation must not map 5M6yv';
  end if;
end $$;

commit;
