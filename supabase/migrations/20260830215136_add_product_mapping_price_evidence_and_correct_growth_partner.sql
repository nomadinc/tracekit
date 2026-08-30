-- Withdraw only the Growth Partner exact-ID recommendations whose funnel
-- positions were inferred from discounted prices. No provider-product
-- projection or append-only mapping decision is changed.
do $$
declare
  v_corrected_count integer;
begin
  update public.commerce_product_mapping_rules
  set status = 'inactive',
      evidence = evidence || jsonb_build_object(
        'correction', 'discounted_price_does_not_establish_funnel_identity',
        'corrected_at', '2026-08-30T21:51:36Z'
      ),
      updated_at = now()
  where organization_id = '5f1de64a-1b37-40bb-81c8-32197eda0b41'::uuid
    and connection_id = 'ea1c2313-6120-4692-84c5-ec3562e7dcf6'::uuid
    and provider_account_id = '0369c701-717f-4c34-b230-8341bcdb7e65'::uuid
    and provider = 'commas'
    and rule_kind = 'provider_product_id'
    and match_value in ('ZvpxR', 'JEoZJ')
    and offer_step_id = '995cc1b6-1d91-45a0-a571-d74cabbc8489'::uuid;

  get diagnostics v_corrected_count = row_count;
  if v_corrected_count <> 2 then
    raise exception 'expected exactly two ambiguous Growth Partner rules, corrected %', v_corrected_count;
  end if;
end $$;

-- Add read-only, source-observed product prices to the operator review
-- projection. The values come directly from distinct platform order amounts;
-- they are not derived from revenue/order_count and never affect identity.
create or replace view public.commerce_product_mapping_review_v1
with (security_invoker = true) as
with refund_totals as (
  select
    o.organization_id,
    o.connection_id,
    o.provider_account_id,
    o.provider_product_id,
    count(r.id)::bigint as refund_count,
    coalesce(sum(abs(coalesce(r.amount, r.amount_gross, 0))), 0)::numeric as refund_amount
  from public.platform_orders o
  join public.commerce_refund_events r
    on r.organization_id = o.organization_id
   and r.canonical_order_id = o.canonical_order_id
  where o.platform = 'commas'
    and o.provider_product_id is not null
  group by
    o.organization_id,
    o.connection_id,
    o.provider_account_id,
    o.provider_product_id
), observed_price_totals as (
  select
    o.organization_id,
    o.connection_id,
    o.provider_account_id,
    o.provider_product_id,
    array_agg(distinct o.gross_amount order by o.gross_amount)
      filter (where o.gross_amount is not null) as observed_prices
  from public.platform_orders o
  where o.platform = 'commas'
    and o.provider_product_id is not null
  group by
    o.organization_id,
    o.connection_id,
    o.provider_account_id,
    o.provider_product_id
)
select
  p.organization_id,
  p.connection_id,
  p.provider_account_id,
  p.id as provider_product_row_id,
  p.provider_product_id,
  p.title,
  p.internal_name,
  p.description,
  p.mapping_status,
  p.mapping_version,
  p.business_context_id,
  p.canonical_offer_id,
  p.offer_step_id,
  p.offer_variant_id,
  h.integrity_status,
  h.order_count,
  h.gross_revenue,
  coalesce(r.refund_count, 0)::bigint as refund_count,
  coalesce(r.refund_amount, 0)::numeric as refund_amount,
  p.first_seen_at,
  p.last_seen_at,
  p.reviewed_at,
  exists(
    select 1
    from public.tracekit_operational_alerts a
    where a.organization_id = p.organization_id
      and a.capability = 'commerce'
      and a.alert_code = 'commas:' || p.connection_id::text || ':' || p.provider_account_id::text || ':transactions:product_unmapped:' || p.provider_product_id
      and a.status in ('open', 'acknowledged')
  ) as alert_open,
  exists(
    select 1
    from public.work_items w
    where w.workspace_id = p.organization_id::text
      and w.source = 'commerce'
      and w.source_key = 'commas:' || p.connection_id::text || ':' || p.provider_account_id::text || ':transactions:product_unmapped:' || p.provider_product_id
      and w.status in ('open', 'acknowledged', 'in_progress')
  ) as work_item_open,
  coalesce(pr.observed_prices, '{}'::numeric[]) as observed_prices
from public.commerce_provider_products p
join public.commerce_product_mapping_health_v1 h
  on h.organization_id = p.organization_id
 and h.connection_id = p.connection_id
 and h.provider_account_id = p.provider_account_id
 and h.provider_product_id = p.provider_product_id
left join refund_totals r
  on r.organization_id = p.organization_id
 and r.connection_id = p.connection_id
 and r.provider_account_id = p.provider_account_id
 and r.provider_product_id = p.id
left join observed_price_totals pr
  on pr.organization_id = p.organization_id
 and pr.connection_id = p.connection_id
 and pr.provider_account_id = p.provider_account_id
 and pr.provider_product_id = p.id;

revoke all on public.commerce_product_mapping_review_v1 from public, anon, authenticated;
grant select on public.commerce_product_mapping_review_v1 to service_role;

comment on view public.commerce_product_mapping_review_v1 is
  'Service-role-only product mapping review with distinct source-observed prices as non-identity operator evidence.';
