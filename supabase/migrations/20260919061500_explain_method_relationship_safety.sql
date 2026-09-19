begin;

-- Prefer the substantive underlying match method when v4 merely passed through
-- an earlier deterministic decision.
create or replace view public.reconciliation_explain_projection_v2
with (security_invoker=true) as
select
  v.*,
  case
    when v.evidence_factors->>'v4_match_method'='v3_passthrough'
      then coalesce(v.evidence_factors->>'match_method','existing_mapping')
    else coalesce(v.evidence_factors->>'v4_match_method',v.evidence_factors->>'match_method','none')
  end as explain_match_method
from public.reconciliation_explain_projection_v1 v;

grant select on public.reconciliation_explain_projection_v2 to service_role;

-- order_group_key is not universally provider-authored: production contains
-- IDENTITY:EMAIL:* synthesized keys. Exclude those from deterministic
-- relationship projection. Provider-like groups are still projected only when
-- they actually contain >1 distinct canonical commerce orders.
create or replace view public.provider_order_relationship_projection_v2
with (security_invoker=true) as
with eligible_groups as (
  select organization_id,connection_id,order_group_key
  from public.platform_orders
  where canonical_order_id is not null
    and nullif(btrim(order_group_key),'') is not null
    and order_group_key not like 'IDENTITY:%'
  group by organization_id,connection_id,order_group_key
  having count(distinct canonical_order_id)>1
), grouped as (
  select po.*,
    dense_rank() over(
      partition by po.organization_id,po.connection_id,po.order_group_key
      order by po.order_ts asc,po.canonical_order_id
    ) as group_sequence,
    first_value(po.canonical_order_id) over(
      partition by po.organization_id,po.connection_id,po.order_group_key
      order by po.order_ts asc,po.canonical_order_id
    ) as group_root_order_id
  from public.platform_orders po
  join eligible_groups g using(organization_id,connection_id,order_group_key)
  where po.canonical_order_id is not null
)
select
  organization_id,canonical_order_id as child_canonical_order_id,
  case when group_sequence=1 then null else group_root_order_id end parent_canonical_order_id,
  connection_id,provider_account_id,provider_order_id,order_id merchant_order_reference,
  order_group_key provider_group_reference,
  case when group_sequence=1 then 'base' else 'child' end relationship_type,
  group_sequence-1 sequence_position,
  case when group_sequence=1 then 'root' else 'deterministic_provider_order_group' end resolution_method,
  'resolved'::text resolution_status,evidence_id,order_ts observed_at,
  jsonb_build_object('platform',platform,'platform_order_id',platform_order_id,'commerce_reference',commerce_reference,'payment_reference',payment_reference) evidence_factors
from grouped;

grant select on public.provider_order_relationship_projection_v2 to service_role;

create or replace view public.commerce_relationship_projection_v3
with (security_invoker=true) as
select * from public.commerce_relationship_projection_v1
union all
select
  organization_id,child_canonical_order_id,parent_canonical_order_id,connection_id,
  provider_order_id,provider_order_id,provider_group_reference,relationship_type,
  sequence_position,null::integer,resolution_method,resolution_status,
  'provider_order_group'::text,evidence_id,observed_at,evidence_factors
from public.provider_order_relationship_projection_v2;

grant select on public.commerce_relationship_projection_v3 to service_role;

comment on view public.provider_order_relationship_projection_v2 is
'Fail-closed deterministic provider grouping: excludes synthesized IDENTITY keys and emits relationships only for groups spanning multiple canonical orders. Empty output means no deterministic provider parent evidence is currently available.';

commit;
