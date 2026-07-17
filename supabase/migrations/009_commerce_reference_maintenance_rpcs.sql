create or replace function public.backfill_platform_order_commerce_references(patches jsonb)
returns table(platform_order_id text, commerce_reference text)
language sql
security definer
as $$
  with input as (
    select
      nullif(btrim(value->>'platform_order_id'), '') as platform_order_id,
      nullif(btrim(value->>'commerce_reference'), '') as commerce_reference
    from jsonb_array_elements(coalesce(patches, '[]'::jsonb)) as value
  )
  update public.platform_orders as po
  set commerce_reference = input.commerce_reference
  from input
  where po.platform_order_id = input.platform_order_id
    and input.commerce_reference is not null
    and po.platform in ('wowboost', 'wowsuite:wowboost', 'wowsuite')
    and (po.commerce_reference is null or btrim(po.commerce_reference) = '')
  returning po.platform_order_id, po.commerce_reference;
$$;

create or replace function public.lookup_wowboost_orders_by_commerce_references(refs text[])
returns table(platform_order_id text, order_id text, commerce_reference text, platform text)
language sql
stable
security definer
as $$
  with normalized_refs as (
    select distinct lower(btrim(value)) as commerce_reference_norm
    from unnest(coalesce(refs, array[]::text[])) as value
    where nullif(btrim(value), '') is not null
  )
  select
    po.platform_order_id,
    po.order_id,
    po.commerce_reference,
    po.platform
  from public.platform_orders as po
  join normalized_refs as refs
    on lower(btrim(po.commerce_reference)) = refs.commerce_reference_norm
  where po.platform in ('wowboost', 'wowsuite:wowboost', 'wowsuite')
    and po.commerce_reference is not null
    and btrim(po.commerce_reference) <> '';
$$;

create or replace function public.reconcile_paypal_commerce_reference_matches(patches jsonb)
returns table(id uuid, transaction_id text, matched_platform_order_id text, matched_order_id text)
language sql
security definer
as $$
  with input as (
    select
      nullif(btrim(value->>'id'), '')::uuid as id,
      nullif(btrim(value->>'matched_platform_order_id'), '') as matched_platform_order_id,
      nullif(btrim(value->>'matched_order_id'), '') as matched_order_id,
      nullif(btrim(value->>'match_reason'), '') as match_reason
    from jsonb_array_elements(coalesce(patches, '[]'::jsonb)) as value
  )
  update public.payment_transactions as pt
  set
    matched_platform_order_id = input.matched_platform_order_id,
    matched_order_id = input.matched_order_id,
    match_method = 'commerce_reference_exact',
    match_confidence = 100,
    match_reason = coalesce(input.match_reason, 'Exact PayPal commerce_reference matched one WowBoost commerce order.'),
    match_candidate_count = 1,
    match_status = 'matched',
    updated_at = now()
  from input
  where pt.id = input.id
    and pt.platform = 'paypal'
    and input.matched_platform_order_id is not null
    and input.matched_order_id is not null
    and pt.commerce_reference is not null
    and btrim(pt.commerce_reference) <> ''
    and pt.matched_platform_order_id is null
    and pt.matched_order_id is null
  returning pt.id, pt.transaction_id, pt.matched_platform_order_id, pt.matched_order_id;
$$;
