-- Evidence-calibrated Everflow -> Commas linkage v2.
-- Historical Everflow timestamps are timezone-naive. For the bounded report
-- period, defensible v1 pairs establish a -180 minute normalization. This
-- migration preserves v1 and records v2 as a separate reconciliation version.

create table public.everflow_acquisition_journeys (
  id uuid primary key,
  organization_id uuid not null,
  connection_id uuid not null,
  import_id uuid not null,
  transaction_id_hash text not null,
  algorithm_version text not null,
  event_count integer not null,
  first_event_at timestamptz not null,
  last_event_at timestamptz not null,
  linkage_state text not null,
  evidence_factors jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, connection_id) references public.commerce_provider_connections (organization_id, id),
  foreign key (organization_id, import_id) references public.everflow_historical_imports (organization_id, id),
  check (event_count > 0),
  check (linkage_state in ('linked','needs_review','unmatched')),
  check (public.financial_reconciliation_metadata_is_safe(evidence_factors)),
  unique (import_id, transaction_id_hash, algorithm_version)
);
create unique index everflow_acquisition_journeys_org_id_uidx on public.everflow_acquisition_journeys (organization_id, id);

create table public.everflow_journey_order_links (
  id uuid primary key,
  organization_id uuid not null,
  connection_id uuid not null,
  journey_id uuid not null,
  canonical_order_id uuid not null,
  provenance text not null,
  rule_version text not null,
  supporting_event_count integer not null,
  evidence_factors jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (organization_id, connection_id) references public.commerce_provider_connections (organization_id, id),
  foreign key (organization_id, journey_id) references public.everflow_acquisition_journeys (organization_id, id),
  foreign key (organization_id, canonical_order_id) references public.platform_orders (organization_id, canonical_order_id),
  check (provenance in ('direct','propagated_within_journey','inferred','unattributed')),
  check (supporting_event_count > 0),
  check (public.financial_reconciliation_metadata_is_safe(evidence_factors)),
  unique (journey_id, canonical_order_id, rule_version)
);
create unique index everflow_journey_order_links_org_id_uidx on public.everflow_journey_order_links (organization_id, id);
create index everflow_journey_order_links_order_idx on public.everflow_journey_order_links (organization_id, canonical_order_id);
create index everflow_conversion_events_transaction_hash_idx on public.everflow_conversion_events
  (import_id,(encode(extensions.digest(transaction_id,'sha256'),'hex')))
  where transaction_id is not null;

create or replace function public.reconcile_everflow_orders_v2(p_organization_id uuid,p_connection_id uuid)
returns table(high_confidence bigint,medium_confidence bigint,needs_review bigint,unmatched bigint,journeys_linked bigint,journeys_unmatched bigint)
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_version constant text := 'everflow-commerce-v2';
begin
  insert into public.everflow_order_reconciliations(
    id,organization_id,connection_id,event_id,algorithm_version,confidence_band,
    candidate_count,matched_canonical_order_id,evidence_factors,reconciled_at
  )
  select gen_random_uuid(),e.organization_id,e.connection_id,e.id,v_version,
    case when c.candidate_count=1 and c.distance_seconds<=30 then 'high_confidence'
         when c.candidate_count=1 then 'medium_confidence'
         when c.candidate_count>1 then 'needs_review' else 'unmatched' end,
    c.candidate_count,case when c.candidate_count=1 then c.order_id end,
    jsonb_build_object(
      'contact_signal_exact',c.candidate_count>0,
      'timestamp_rule','everflow_naive_report_time_minus_180_minutes',
      'timestamp_rule_scope','2026-04-01_through_2026-08-08_report_period',
      'time_tolerance_seconds',120,
      'time_distance_seconds',c.distance_seconds,
      'sale_amount_exact',c.sale_amount_exact,
      'revenue_exact',c.revenue_exact,
      'shared_identifier',false
    ),now()
  from public.everflow_conversion_events e
  cross join lateral (
    select count(*)::integer candidate_count,min(o.canonical_order_id::text)::uuid order_id,
      coalesce(min(abs(extract(epoch from(o.order_ts-(e.conversion_at-interval '180 minutes')))))::integer,999999999) distance_seconds,
      coalesce(bool_and(e.sale_amount is not null and o.gross_amount=e.sale_amount),false) sale_amount_exact,
      coalesce(bool_and(e.revenue is not null and o.gross_amount=e.revenue),false) revenue_exact
    from public.person_source_identities i
    join public.platform_orders o on o.organization_id=i.organization_id and o.connection_id=i.connection_id and o.person_id=i.person_id
    where i.organization_id=e.organization_id and i.connection_id=e.connection_id
      and i.source_type='email' and i.normalized_value=e.email_normalized
      and abs(extract(epoch from(o.order_ts-(e.conversion_at-interval '180 minutes'))))<=120
  ) c
  where e.organization_id=p_organization_id and e.connection_id=p_connection_id
  on conflict(event_id,algorithm_version) do update set
    confidence_band=excluded.confidence_band,candidate_count=excluded.candidate_count,
    matched_canonical_order_id=excluded.matched_canonical_order_id,
    evidence_factors=excluded.evidence_factors,reconciled_at=excluded.reconciled_at;

  delete from public.everflow_journey_order_links l
  where l.organization_id=p_organization_id and l.connection_id=p_connection_id and l.rule_version=v_version;

  insert into public.everflow_acquisition_journeys(
    id,organization_id,connection_id,import_id,transaction_id_hash,algorithm_version,
    event_count,first_event_at,last_event_at,linkage_state,evidence_factors
  )
  select gen_random_uuid(),e.organization_id,e.connection_id,e.import_id,
    encode(extensions.digest(e.transaction_id,'sha256'),'hex'),v_version,count(*)::integer,
    min(e.conversion_at),max(e.conversion_at),
    case when count(*) filter(where r.matched_canonical_order_id is not null)>0 then 'linked'
         when count(*) filter(where r.confidence_band='needs_review')>0 then 'needs_review'
         else 'unmatched' end,
    jsonb_build_object(
      'source_event_count',count(*),
      'matched_event_count',count(*) filter(where r.matched_canonical_order_id is not null),
      'distinct_order_count',count(distinct r.matched_canonical_order_id),
      'transaction_identifier_retained_in_source_evidence',true
    )
  from public.everflow_conversion_events e
  join public.everflow_order_reconciliations r on r.event_id=e.id and r.algorithm_version=v_version
  where e.organization_id=p_organization_id and e.connection_id=p_connection_id and e.transaction_id is not null
  group by e.organization_id,e.connection_id,e.import_id,e.transaction_id
  on conflict(import_id,transaction_id_hash,algorithm_version) do update set
    event_count=excluded.event_count,first_event_at=excluded.first_event_at,last_event_at=excluded.last_event_at,
    linkage_state=excluded.linkage_state,evidence_factors=excluded.evidence_factors,updated_at=now();

  insert into public.everflow_journey_order_links(
    id,organization_id,connection_id,journey_id,canonical_order_id,provenance,rule_version,
    supporting_event_count,evidence_factors
  )
  select gen_random_uuid(),j.organization_id,j.connection_id,j.id,r.matched_canonical_order_id,
    'inferred',v_version,count(*)::integer,
    jsonb_build_object(
      'rule','exact_contact_plus_calibrated_timestamp',
      'source','historical_everflow_report',
      'direct_shared_identifier',false
    )
  from public.everflow_acquisition_journeys j
  join public.everflow_conversion_events e on e.organization_id=j.organization_id and e.connection_id=j.connection_id and e.import_id=j.import_id and encode(extensions.digest(e.transaction_id,'sha256'),'hex')=j.transaction_id_hash
  join public.everflow_order_reconciliations r on r.event_id=e.id and r.algorithm_version=v_version and r.matched_canonical_order_id is not null
  where j.organization_id=p_organization_id and j.connection_id=p_connection_id and j.algorithm_version=v_version
  group by j.organization_id,j.connection_id,j.id,r.matched_canonical_order_id
  on conflict(journey_id,canonical_order_id,rule_version) do update set
    supporting_event_count=excluded.supporting_event_count,evidence_factors=excluded.evidence_factors;

  -- A downstream charge is associated with the acquisition Journey only when
  -- one and only one anchored Journey claims the same Person/Connection Order
  -- in the approved ten-minute purchase window. This remains propagated
  -- provenance, never a direct affiliate attribution claim.
  insert into public.everflow_journey_order_links(
    id,organization_id,connection_id,journey_id,canonical_order_id,provenance,rule_version,
    supporting_event_count,evidence_factors
  )
  with anchors as (
    select l.journey_id,l.organization_id,l.connection_id,min(o.order_ts) anchor_at,
      min(o.person_id::text)::uuid person_id
    from public.everflow_journey_order_links l
    join public.platform_orders o on o.organization_id=l.organization_id and o.canonical_order_id=l.canonical_order_id
    where l.organization_id=p_organization_id and l.connection_id=p_connection_id
      and l.rule_version=v_version and l.provenance='inferred'
    group by l.journey_id,l.organization_id,l.connection_id
    having count(distinct o.person_id)=1
  ), candidates as (
    select a.journey_id,a.organization_id,a.connection_id,o.canonical_order_id,
      extract(epoch from(o.order_ts-a.anchor_at))::integer distance_seconds
    from anchors a
    join public.platform_orders o on o.organization_id=a.organization_id and o.connection_id=a.connection_id and o.person_id=a.person_id
      and o.order_ts>=a.anchor_at and o.order_ts<=a.anchor_at+interval '10 minutes'
  ), claims as (
    select canonical_order_id,count(distinct journey_id) claim_count
    from candidates group by canonical_order_id
  )
  select gen_random_uuid(),c.organization_id,c.connection_id,c.journey_id,c.canonical_order_id,
    'propagated_within_journey',v_version,1,
    jsonb_build_object(
      'rule','same_person_single_journey_claim_within_ten_minutes',
      'seconds_after_anchor',c.distance_seconds,
      'competing_journey_count',cl.claim_count,
      'direct_shared_identifier',false
    )
  from candidates c join claims cl using(canonical_order_id)
  where cl.claim_count=1
    and not exists(
      select 1 from public.everflow_journey_order_links owner
      where owner.canonical_order_id=c.canonical_order_id and owner.rule_version=v_version and owner.journey_id<>c.journey_id
    )
    and not exists(
    select 1 from public.everflow_journey_order_links prior
    where prior.journey_id=c.journey_id and prior.canonical_order_id=c.canonical_order_id and prior.rule_version=v_version
  )
  on conflict(journey_id,canonical_order_id,rule_version) do nothing;

  return query select
    count(*) filter(where r.confidence_band='high_confidence'),
    count(*) filter(where r.confidence_band='medium_confidence'),
    count(*) filter(where r.confidence_band='needs_review'),
    count(*) filter(where r.confidence_band='unmatched'),
    (select count(*) from public.everflow_acquisition_journeys j where j.organization_id=p_organization_id and j.connection_id=p_connection_id and j.algorithm_version=v_version and j.linkage_state='linked'),
    (select count(*) from public.everflow_acquisition_journeys j where j.organization_id=p_organization_id and j.connection_id=p_connection_id and j.algorithm_version=v_version and j.linkage_state='unmatched')
  from public.everflow_order_reconciliations r
  where r.organization_id=p_organization_id and r.connection_id=p_connection_id and r.algorithm_version=v_version;
end $$;

alter table public.everflow_acquisition_journeys enable row level security;
alter table public.everflow_journey_order_links enable row level security;
revoke all on public.everflow_acquisition_journeys from anon,authenticated;
revoke all on public.everflow_journey_order_links from anon,authenticated;
grant select,insert,update,delete on public.everflow_acquisition_journeys to service_role;
grant select,insert,update,delete on public.everflow_journey_order_links to service_role;
revoke all on function public.reconcile_everflow_orders_v2(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reconcile_everflow_orders_v2(uuid,uuid) to service_role;
