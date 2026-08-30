-- Make the five-minute product-mapping health read independent of the width
-- and heap locality of platform_orders. The partial covering index serves the
-- exact immutable Commas scope and aggregate inputs; it does not alter writes.
create index if not exists platform_orders_commas_product_health_idx
  on public.platform_orders (
    organization_id,
    connection_id,
    provider_account_id,
    provider_product_id
  )
  include (canonical_order_id, gross_amount)
  where platform = 'commas' and provider_product_id is not null;

-- Aggregate the scoped order stream once before joining provider products.
-- This preserves products with no orders and prevents any future product-side
-- join from multiplying order counts or revenue.
create or replace view public.commerce_product_mapping_health_v1
with (security_invoker = true) as
with order_health as (
  select
    o.organization_id,
    o.connection_id,
    o.provider_account_id,
    o.provider_product_id,
    count(o.canonical_order_id)::bigint as order_count,
    coalesce(sum(o.gross_amount), 0)::numeric as gross_revenue
  from public.platform_orders o
  where o.platform = 'commas'
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
  p.mapping_status,
  p.first_seen_at,
  p.last_seen_at,
  p.reviewed_at,
  coalesce(h.order_count, 0)::bigint as order_count,
  coalesce(h.gross_revenue, 0)::numeric as gross_revenue,
  case
    when p.mapping_status = 'approved' and
      (p.business_context_id is null or p.canonical_offer_id is null or p.offer_step_id is null)
      then 'conflict'
    when p.mapping_status in ('observed', 'proposed', 'review_required') then 'unmapped'
    else 'resolved'
  end as integrity_status
from public.commerce_provider_products p
left join order_health h
  on h.organization_id = p.organization_id
 and h.connection_id = p.connection_id
 and h.provider_account_id = p.provider_account_id
 and h.provider_product_id = p.id;

revoke all on public.commerce_product_mapping_health_v1 from public, anon, authenticated;
grant select on public.commerce_product_mapping_health_v1 to service_role;

comment on view public.commerce_product_mapping_health_v1 is
  'Read-only provider-product mapping health with pre-aggregated financially safe order totals; no mapping inference or mutation.';
