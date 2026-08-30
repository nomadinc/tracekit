-- These columns describe the same provider population in Commerce rows. Plain
-- per-column statistics multiply their identical selectivities and undercount
-- the production Commas scope by roughly two orders of magnitude.
create statistics if not exists platform_orders_commerce_scope_stats
  (dependencies, mcv)
  on platform,
     organization_id,
     connection_id,
     provider_account_id,
     provider_product_id
  from public.platform_orders;

alter statistics public.platform_orders_commerce_scope_stats
  set statistics 500;

-- Populate both the extended statistics and fresh single-column statistics.
analyze public.platform_orders (
  platform,
  organization_id,
  connection_id,
  provider_account_id,
  provider_product_id
);

-- Match the partial covering index predicate explicitly. Null product IDs can
-- never join commerce_provider_products.id, so excluding them is semantically
-- identical while making the intended index provably usable by the planner.
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
