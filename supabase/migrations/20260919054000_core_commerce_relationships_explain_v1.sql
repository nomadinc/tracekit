begin;

create or replace view public.commerce_relationship_projection_v1
with (security_invoker = true) as
select
  l.organization_id,
  l.canonical_order_id as child_canonical_order_id,
  parent.canonical_order_id as parent_canonical_order_id,
  l.provider_connection_id as connection_id,
  l.provider_order_reference,
  l.charge_reference,
  l.parent_charge_reference,
  case
    when l.relationship = 'main' then 'base'
    when l.relationship = 'upsell' then 'upsell'
    else 'child'
  end as relationship_type,
  l.sequence_position,
  null::integer as billing_cycle,
  case
    when l.parent_charge_reference is null then 'root'
    when parent.id is not null then 'deterministic_parent_charge_reference'
    else 'unresolved_parent_reference'
  end as resolution_method,
  case
    when l.parent_charge_reference is null then 'resolved'
    when parent.id is not null then 'resolved'
    else 'unresolved'
  end as resolution_status,
  l.provenance,
  null::uuid as evidence_id,
  l.linked_at as observed_at,
  jsonb_build_object(
    'link_id', l.id,
    'journey_id', l.journey_id,
    'checkout_session_id', l.checkout_session_id,
    'linked_by', l.linked_by
  ) as evidence_factors
from public.tkid_commerce_links l
left join public.tkid_commerce_links parent
  on parent.organization_id=l.organization_id
 and parent.charge_reference=l.parent_charge_reference
where l.tkid_erased_at is null

union all

select
  s.organization_id,
  s.canonical_order_id,
  prev.canonical_order_id,
  s.connection_id,
  s.provider_order_id,
  s.provider_order_id,
  prev.provider_order_id,
  case when s.billing_cycle <= 1 then 'subscription_initial' else 'rebill' end,
  s.billing_cycle,
  s.billing_cycle,
  case
    when s.billing_cycle <= 1 then 'subscription_billing_cycle'
    when prev.id is not null then 'deterministic_prior_billing_cycle'
    else 'unresolved_prior_billing_cycle'
  end,
  case when s.billing_cycle <= 1 or prev.id is not null then 'resolved' else 'unresolved' end,
  'subscription_order_link',
  s.evidence_id,
  s.observed_at,
  jsonb_build_object(
    'subscription_id', s.subscription_id,
    'link_id', s.id,
    'billing_cycle', s.billing_cycle
  )
from public.commerce_subscription_order_links s
left join public.commerce_subscription_order_links prev
  on prev.organization_id=s.organization_id
 and prev.subscription_id=s.subscription_id
 and prev.billing_cycle=s.billing_cycle-1;

comment on view public.commerce_relationship_projection_v1 is
'Core read projection of deterministic parent/child commerce relationships. Unresolved parent references remain explicit and are never filled by customer heuristics.';

create or replace view public.reconciliation_explain_projection_v1
with (security_invoker = true) as
with ranked as (
  select r.*,
    row_number() over (
      partition by r.organization_id,r.event_id
      order by
        case r.algorithm_version
          when 'deterministic_order_v4' then 4
          when 'deterministic_order_v3' then 3
          when 'deterministic_order_v2' then 2
          else 1
        end desc,
        r.reconciled_at desc
    ) as rn
  from public.everflow_order_reconciliations r
)
select
  r.organization_id,
  r.connection_id,
  r.event_id as source_event_id,
  e.evidence_id,
  e.source_identity,
  e.conversion_id,
  e.transaction_id as attribution_transaction_id,
  e.order_id as provider_order_reference,
  e.affiliate_id,
  e.offer_id,
  r.matched_canonical_order_id,
  po.platform,
  po.platform_order_id,
  po.provider_order_id,
  po.order_id as merchant_order_reference,
  case
    when r.matched_canonical_order_id is not null then 'matched'
    when r.confidence_band in ('needs_review') then 'ambiguous'
    when r.confidence_band='duplicate' then 'duplicate'
    else 'unmatched'
  end as result_status,
  coalesce(r.evidence_factors->>'v4_match_method',r.evidence_factors->>'match_method','none') as match_method,
  r.confidence_band,
  r.candidate_count,
  r.algorithm_version,
  r.evidence_factors,
  r.reconciled_at
from ranked r
join public.everflow_conversion_events e
  on e.organization_id=r.organization_id and e.id=r.event_id
left join public.platform_orders po
  on po.organization_id=r.organization_id
 and po.canonical_order_id=r.matched_canonical_order_id
where r.rn=1;

comment on view public.reconciliation_explain_projection_v1 is
'Core Explain read projection preserving commerce identity, attribution identity, reconciliation result, method, candidates, confidence, algorithm and evidence factors.';

grant select on public.commerce_relationship_projection_v1 to service_role;
grant select on public.reconciliation_explain_projection_v1 to service_role;

commit;
