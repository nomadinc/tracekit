-- Read-only, provider-scoped health projection for Commerce product mapping.
-- Revenue remains attached to its immutable provider product while unresolved;
-- this view never chooses or changes a canonical mapping.
create or replace view public.commerce_product_mapping_health_v1
with (security_invoker = true) as
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
  count(o.canonical_order_id)::bigint as order_count,
  coalesce(sum(o.gross_amount), 0)::numeric as gross_revenue,
  case
    when p.mapping_status = 'approved' and
      (p.business_context_id is null or p.canonical_offer_id is null or p.offer_step_id is null)
      then 'conflict'
    when p.mapping_status in ('observed', 'proposed', 'review_required') then 'unmapped'
    else 'resolved'
  end as integrity_status
from public.commerce_provider_products p
left join public.platform_orders o
  on o.organization_id = p.organization_id
 and o.connection_id = p.connection_id
 and o.provider_account_id = p.provider_account_id
 and o.provider_product_id = p.id
 and o.platform = 'commas'
group by p.id;

revoke all on public.commerce_product_mapping_health_v1 from public, anon, authenticated;
grant select on public.commerce_product_mapping_health_v1 to service_role;

comment on view public.commerce_product_mapping_health_v1 is
  'Read-only provider-product mapping health and financially safe aggregate; no mapping inference or mutation.';
