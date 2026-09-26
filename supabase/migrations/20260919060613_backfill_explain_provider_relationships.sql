begin;

-- Explain existing deterministic source mappings even when they predate a
-- reconciliation-decision row. Source mappings remain authoritative evidence;
-- this only materializes the missing Explain decision.
insert into public.everflow_order_reconciliations(
  id,organization_id,connection_id,event_id,algorithm_version,confidence_band,
  candidate_count,matched_canonical_order_id,evidence_factors,reconciled_at
)
select
  gen_random_uuid(),e.organization_id,e.connection_id,e.id,
  'deterministic_existing_mapping_v1','high_confidence',1,m.canonical_object_id,
  jsonb_build_object(
    'match_method','existing_source_mapping',
    'confidence',1.0,
    'source_mapping_id',m.id,
    'source_mapping_version',m.mapping_version,
    'source_mapping_metadata',m.metadata,
    'provider_order_reference',e.order_id,
    'transaction_id_present',nullif(btrim(e.transaction_id),'') is not null
  ),
  greatest(m.updated_at,e.last_seen_at,e.created_at)
from public.everflow_conversion_events e
join public.commerce_source_mappings m
  on m.organization_id=e.organization_id
 and m.connection_id=e.connection_id
 and m.provider_account_id=e.provider_account_id
 and m.source_object_type='everflow_conversion'
 and m.source_object_id=e.source_identity
 and m.canonical_object_type='order'
 and m.canonical_object_id is not null
where not exists(
  select 1 from public.everflow_order_reconciliations r
  where r.organization_id=e.organization_id and r.event_id=e.id
)
on conflict(event_id,algorithm_version) do nothing;

-- General deterministic provider relationship projection. This does not infer
-- parentage from customer identity. It uses only provider-supplied grouping
-- already preserved on platform_orders.
create or replace view public.provider_order_relationship_projection_v1
with (security_invoker=true) as
with grouped as (
  select
    po.*,
    row_number() over(
      partition by po.organization_id,po.connection_id,po.order_group_key
      order by po.order_ts asc,po.id asc
    ) as group_sequence,
    first_value(po.canonical_order_id) over(
      partition by po.organization_id,po.connection_id,po.order_group_key
      order by po.order_ts asc,po.id asc
    ) as group_root_order_id
  from public.platform_orders po
  where po.canonical_order_id is not null
    and nullif(btrim(po.order_group_key),'') is not null
)
select
  organization_id,
  canonical_order_id as child_canonical_order_id,
  case when group_sequence=1 then null else group_root_order_id end as parent_canonical_order_id,
  connection_id,
  provider_account_id,
  provider_order_id,
  order_id as merchant_order_reference,
  order_group_key as provider_group_reference,
  case when group_sequence=1 then 'base' else 'child' end as relationship_type,
  group_sequence-1 as sequence_position,
  case when group_sequence=1 then 'root' else 'deterministic_provider_order_group' end as resolution_method,
  'resolved'::text as resolution_status,
  evidence_id,
  order_ts as observed_at,
  jsonb_build_object(
    'platform',platform,
    'platform_order_id',platform_order_id,
    'commerce_reference',commerce_reference,
    'payment_reference',payment_reference
  ) as evidence_factors
from grouped;

comment on view public.provider_order_relationship_projection_v1 is
'Deterministic Core parent/child projection from provider-supplied order grouping. Does not infer parentage from customer identity.';

grant select on public.provider_order_relationship_projection_v1 to service_role;

-- Extend the Core relationship read model with deterministic provider grouping.
create or replace view public.commerce_relationship_projection_v2
with (security_invoker=true) as
select
  organization_id,child_canonical_order_id,parent_canonical_order_id,connection_id,
  provider_order_reference,charge_reference,parent_charge_reference,relationship_type,
  sequence_position,billing_cycle,resolution_method,resolution_status,provenance,
  evidence_id,observed_at,evidence_factors
from public.commerce_relationship_projection_v1
union all
select
  organization_id,child_canonical_order_id,parent_canonical_order_id,connection_id,
  provider_order_id,provider_order_id,provider_group_reference,relationship_type,
  sequence_position,null::integer,resolution_method,resolution_status,
  'provider_order_group'::text,evidence_id,observed_at,evidence_factors
from public.provider_order_relationship_projection_v1;

grant select on public.commerce_relationship_projection_v2 to service_role;

commit;
