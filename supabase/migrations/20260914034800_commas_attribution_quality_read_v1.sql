-- Stable, service-role-only reporting. No restricted payloads or source-truth writes.
create or replace function public.read_commas_attribution_quality_v1(
  p_organization_id uuid,p_connection_id uuid,p_provider_account_id uuid,
  p_from date default null,p_to date default null,p_comparison text default null,
  p_alias text default null,p_ord text default null,p_derivation text default null
) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare v_report jsonb;
begin
  if not exists(select 1 from public.commerce_provider_accounts a
      join public.commerce_provider_connections c on c.id=a.connection_id and c.organization_id=a.organization_id
      where a.organization_id=p_organization_id and a.connection_id=p_connection_id
        and a.id=p_provider_account_id and a.status='active' and c.provider='commas' and c.status='connected')
     or (p_from is not null and p_to is not null and p_from>p_to)
     or (p_comparison is not null and p_comparison not in ('exact_match','partial_match','conflict','no_everflow_record','no_commas_tid','not_evaluated'))
     or (p_alias is not null and p_alias not in ('all_agree','single_alias','conflict','none'))
     or (p_ord is not null and p_ord not in ('exact','unmatched','ambiguous','malformed'))
     or (p_derivation is not null and p_derivation not in ('LIVE_V2','RECONCILED_FROM_EVIDENCE'))
  then raise exception 'Commas reporting scope or filter unavailable' using errcode='42501'; end if;
  with epoch as (
    select begins_at from public.commerce_attribution_measurement_epochs
    where organization_id=p_organization_id and connection_id=p_connection_id
      and provider_account_id=p_provider_account_id and provider='commas'
  ), latest_sync as (
    select completed_at from public.commerce_sync_runs
    where organization_id=p_organization_id and connection_id=p_connection_id
      and provider_account_id=p_provider_account_id and sync_type='transactions'
      and status in ('completed','completed_with_warnings') and completed_at is not null
    order by completed_at desc limit 1
  ), base as materialized (
    select o.id,o.provider_event_id,o.evidence_id,o.first_observed_at,o.payment_public_transaction_id,
      o.canonical_order_id,o.match_state,o.alias_state,o.everflow_comparison_state,
      o.affiliate_id,o.sub1,o.sub4,o.ef_transaction_id,o.transaction_id,o.tid,o.c1,
      e.normalizer_version evidence_version,o.normalizer_version,
      d.webhook_at,m.created_at mapping_at,j.created_at journey_at,j.metadata->'everflow_comparison' comparison,
      coalesce(o.ef_transaction_id,o.transaction_id,o.tid,o.c1) observed_tid
    from public.commerce_provider_attribution_observations o
    join public.commerce_evidence_records e on e.id=o.evidence_id and e.organization_id=o.organization_id
      and e.connection_id=o.connection_id and e.provider_account_id=o.provider_account_id
      and e.source_object_type='commas_attribution_webhook' and e.pii_classification='restricted' and e.deleted_at is null
    left join lateral (select min(observed_at) webhook_at from public.commerce_provider_attribution_webhook_deliveries d
      where d.organization_id=o.organization_id and d.connection_id=o.connection_id
        and d.provider_account_id=o.provider_account_id and d.provider_event_id=o.provider_event_id
        and d.evidence_id=o.evidence_id) d on true
    left join public.commerce_source_mappings m on m.organization_id=o.organization_id
      and m.connection_id=o.connection_id and m.provider_account_id=o.provider_account_id
      and m.source_object_type='commas_public_transaction' and m.source_object_id=o.payment_public_transaction_id
      and m.canonical_object_type='order' and m.state='active'
    left join public.journey_events j on j.workspace_id=o.organization_id::text
      and j.source_platform='commas' and j.source_connector='commas_provider_observed_checkout'
      and j.source_record_id=o.provider_event_id and j.event_type='purchase'
      and j.metadata->>'observation_id'=o.id::text and j.metadata->>'evidence_id'=o.evidence_id::text
    where o.organization_id=p_organization_id and o.connection_id=p_connection_id
      and o.provider_account_id=p_provider_account_id and o.provider='commas'
      and o.provider_event_type='product.purchased'
      and (p_from is null or (o.first_observed_at at time zone 'UTC')::date>=p_from)
      and (p_to is null or (o.first_observed_at at time zone 'UTC')::date<=p_to)
      and (p_comparison is null or o.everflow_comparison_state=p_comparison)
      and (p_alias is null or o.alias_state=p_alias)
      and (p_ord is null or o.match_state=p_ord)
      and (p_derivation is null or case when e.normalizer_version='commas-provider-attribution-v2'
        then 'LIVE_V2' else 'RECONCILED_FROM_EVIDENCE' end=p_derivation)
  ), ef_raw as materialized (
    select transaction_id,affiliate_id,sub1,sub4 from public.everflow_conversion_events
      where organization_id=p_organization_id and transaction_id in (select observed_tid from base where observed_tid is not null and alias_state<>'conflict')
    union all
    select transaction_id,affiliate_id,sub1,sub4 from public.everflow_click_events
      where organization_id=p_organization_id and transaction_id in (select observed_tid from base where observed_tid is not null and alias_state<>'conflict')
  ), ef_by_tid as (
    select transaction_id,count(distinct (transaction_id,affiliate_id,sub1,sub4)) shapes,
      max(affiliate_id) affiliate_id,max(sub1) sub1,max(sub4) sub4
    from ef_raw group by transaction_id
  ), facts as materialized (
    select b.*,ef.shapes,case when ef.shapes=1 then ef.affiliate_id end ef_affiliate_id,
      case when ef.shapes=1 then ef.sub1 end ef_sub1,case when ef.shapes=1 then ef.sub4 end ef_sub4,
      case when b.payment_public_transaction_id is null or b.payment_public_transaction_id !~ '^ORD-[A-Za-z0-9_-]{1,120}$' then 'malformed_provider_identity'
        when b.match_state='ambiguous' then 'conflicting_identity'
        when b.match_state='exact' then null
        when b.mapping_at is not null and b.canonical_order_id is null then 'canonical_order_absent'
        when b.mapping_at is null and b.webhook_at>(select completed_at from latest_sync) then 'pending_identity'
        when b.mapping_at is null then 'ord_mapping_absent' else 'unknown' end identity_reason
    from base b left join ef_by_tid ef on ef.transaction_id=b.observed_tid
  ), totals as (
    select count(*) n,count(webhook_at) delivered,count(evidence_id) evidence,count(payment_public_transaction_id) payment_present,
      count(*) filter(where payment_public_transaction_id ~ '^ORD-[A-Za-z0-9_-]{1,120}$') valid_ord,
      count(*) filter(where match_state='exact') exact_ord,count(canonical_order_id) canonical,
      count(*) filter(where match_state='unmatched') unmatched,count(*) filter(where match_state='ambiguous') ambiguous,
      count(*) filter(where match_state='malformed') malformed,count(journey_at) journey,
      count(*) filter(where affiliate_id is not null or sub1 is not null or sub4 is not null or observed_tid is not null) any_attribution,
      count(*) filter(where shapes=1) ef_comparable,
      count(affiliate_id) affid,count(sub1) sub1,count(sub4) sub4,count(ef_transaction_id) ef_transaction_id,
      count(transaction_id) transaction_id,count(tid) tid,count(c1) c1,
      count(*) filter(where observed_tid is not null) any_alias,
      count(*) filter(where ef_transaction_id is not null and transaction_id is not null and tid is not null and c1 is not null) all_alias,
      count(*) filter(where alias_state='all_agree') all_agree,count(*) filter(where alias_state='single_alias') single_alias,
      count(*) filter(where alias_state='conflict') alias_conflict,count(*) filter(where alias_state='none') no_alias,
      count(*) filter(where everflow_comparison_state='exact_match') stored_exact,
      count(*) filter(where everflow_comparison_state='partial_match') stored_partial,
      count(*) filter(where everflow_comparison_state='conflict') stored_conflict,
      count(*) filter(where everflow_comparison_state='no_everflow_record') stored_no_record,
      count(*) filter(where everflow_comparison_state='no_commas_tid') stored_no_tid,
      count(*) filter(where everflow_comparison_state='not_evaluated') stored_not_evaluated,
      count(*) filter(where everflow_comparison_state='no_everflow_record' and shapes=1) later_ef_linked,
      count(*) filter(where observed_tid is null or alias_state='conflict') current_no_tid,
      count(*) filter(where observed_tid is not null and alias_state<>'conflict' and shapes is null) current_no_record,
      count(*) filter(where observed_tid is not null and alias_state<>'conflict' and
        (shapes>1 or (shapes=1 and ((affiliate_id is not null and ef_affiliate_id is not null and affiliate_id<>ef_affiliate_id)
          or (sub1 is not null and ef_sub1 is not null and sub1<>ef_sub1)
          or (sub4 is not null and ef_sub4 is not null and sub4<>ef_sub4))))) current_conflict,
      count(*) filter(where shapes=1 and alias_state<>'conflict' and
        (affiliate_id is null or ef_affiliate_id is null or affiliate_id=ef_affiliate_id)
        and (sub1 is null or ef_sub1 is null or sub1=ef_sub1)
        and (sub4 is null or ef_sub4 is null or sub4=ef_sub4)) current_exact,
      count(*) filter(where evidence_version='commas-provider-attribution-v1') evidence_reconciled,
      count(*) filter(where evidence_version='commas-provider-attribution-v2') live_v2,
      count(*) filter(where evidence_version='commas-provider-attribution-v1' and normalizer_version='commas-provider-attribution-v2') later_reconciled,
      count(*) filter(where alias_state='none' and match_state='exact') no_tid_exact,
      count(*) filter(where alias_state='none' and affiliate_id is not null) no_tid_affid,
      count(*) filter(where alias_state='none' and sub1 is not null) no_tid_sub1,
      count(*) filter(where alias_state='none' and sub4 is not null) no_tid_sub4,
      count(*) filter(where identity_reason='pending_identity') pending_identity,
      count(*) filter(where identity_reason='ord_mapping_absent') ord_mapping_absent,
      count(*) filter(where identity_reason='canonical_order_absent') canonical_absent,
      count(*) filter(where identity_reason='malformed_provider_identity') malformed_identity,
      count(*) filter(where identity_reason='conflicting_identity') conflicting_identity,
      count(*) filter(where identity_reason='unknown') unknown_identity,
      min(first_observed_at) first_at,max(first_observed_at) last_at
    from facts
  ), field_agreement as (
    select
      count(*) filter(where shapes=1) linked,
      count(*) filter(where shapes=1 and observed_tid is not null) tid_comparable,
      count(*) filter(where shapes=1 and affiliate_id is not null and ef_affiliate_id is not null) aff_comparable,
      count(*) filter(where shapes=1 and affiliate_id=ef_affiliate_id) aff_agree,
      count(*) filter(where shapes=1 and affiliate_id is null and ef_affiliate_id is not null) aff_commas_missing,
      count(*) filter(where shapes=1 and affiliate_id is not null and ef_affiliate_id is null) aff_ef_missing,
      count(*) filter(where shapes=1 and affiliate_id is null and ef_affiliate_id is null) aff_both_missing,
      count(*) filter(where shapes=1 and sub1 is not null and ef_sub1 is not null) sub1_comparable,
      count(*) filter(where shapes=1 and sub1=ef_sub1) sub1_agree,
      count(*) filter(where shapes=1 and sub1 is null and ef_sub1 is not null) sub1_commas_missing,
      count(*) filter(where shapes=1 and sub1 is not null and ef_sub1 is null) sub1_ef_missing,
      count(*) filter(where shapes=1 and sub1 is null and ef_sub1 is null) sub1_both_missing,
      count(*) filter(where shapes=1 and sub4 is not null and ef_sub4 is not null) sub4_comparable,
      count(*) filter(where shapes=1 and sub4=ef_sub4) sub4_agree,
      count(*) filter(where shapes=1 and sub4 is null and ef_sub4 is not null) sub4_commas_missing,
      count(*) filter(where shapes=1 and sub4 is not null and ef_sub4 is null) sub4_ef_missing,
      count(*) filter(where shapes=1 and sub4 is null and ef_sub4 is null) sub4_both_missing
    from facts
  ), daily as (
    select coalesce(jsonb_agg(jsonb_build_object('date',event_day,'purchases',purchases,
      'ordExactRate',round(100.0*ord_exact/nullif(purchases,0),1),
      'transactionIdCoverage',round(100.0*tid_count/nullif(purchases,0),1),
      'affiliateCoverage',round(100.0*aff_count/nullif(purchases,0),1),
      'aliasConflictRate',round(100.0*alias_conflict/nullif(purchases,0),1),
      'everflowExactRate',round(100.0*ef_exact/nullif(purchases,0),1),
      'everflowConflictRate',round(100.0*ef_conflict/nullif(purchases,0),1)) order by event_day),'[]'::jsonb) items
    from (select (first_observed_at at time zone 'UTC')::date event_day,count(*) purchases,
      count(*) filter(where match_state='exact') ord_exact,count(*) filter(where observed_tid is not null) tid_count,
      count(affiliate_id) aff_count,count(*) filter(where alias_state='conflict') alias_conflict,
      count(*) filter(where everflow_comparison_state='exact_match') ef_exact,
      count(*) filter(where everflow_comparison_state='conflict') ef_conflict
      from facts group by 1) days
  ), latencies as (
    select
      count(*) filter(where mapping_at is not null and webhook_at is not null) ord_measured,
      percentile_cont(0.5) within group(order by greatest(0,extract(epoch from mapping_at-webhook_at))) ord_median,
      percentile_cont(0.95) within group(order by greatest(0,extract(epoch from mapping_at-webhook_at))) ord_p95,
      max(greatest(0,extract(epoch from mapping_at-webhook_at))) ord_max,
      count(*) filter(where journey_at is not null and webhook_at is not null) journey_measured,
      percentile_cont(0.5) within group(order by greatest(0,extract(epoch from journey_at-webhook_at))) journey_median,
      percentile_cont(0.95) within group(order by greatest(0,extract(epoch from journey_at-webhook_at))) journey_p95,
      max(greatest(0,extract(epoch from journey_at-webhook_at))) journey_max
    from facts
  ), maturity as (
    select (select begins_at from epoch) begins_at,
      (select count(distinct o.id) from public.commerce_provider_attribution_observations o
        join public.commerce_evidence_records e on e.id=o.evidence_id
        join public.commerce_provider_attribution_webhook_deliveries d on d.evidence_id=e.id and d.provider_event_id=o.provider_event_id
        where o.organization_id=p_organization_id and o.connection_id=p_connection_id and o.provider_account_id=p_provider_account_id
          and o.provider='commas' and o.provider_event_type='product.purchased'
          and e.normalizer_version='commas-provider-attribution-v2' and d.observed_at>=(select begins_at from epoch)) post_epoch,
      (select count(*) from public.commerce_attribution_healthy_day_certifications h
        where h.organization_id=p_organization_id and h.connection_id=p_connection_id
          and h.provider_account_id=p_provider_account_id and h.provider='commas'
          and h.measurement_day>(select (begins_at at time zone 'UTC')::date from epoch)
          and h.measurement_day<(now() at time zone 'UTC')::date) healthy_days
  )
  select jsonb_build_object(
    'mode','SHADOW_MEASUREMENT','creditImpact','NONE','total',t.n,'firstAt',t.first_at,'lastAt',t.last_at,
    'funnel',jsonb_build_object('receivedDeliveries',t.delivered,'signatureAccepted',t.delivered,
      'evidence',t.evidence,'observation',t.n,'paymentPresent',t.payment_present,'validOrd',t.valid_ord,
      'exactOrd',t.exact_ord,'canonicalOrder',t.canonical,'attributionPresent',t.any_attribution,
      'everflowComparable',t.ef_comparable,'journeyShadow',t.journey),
    'ord',jsonb_build_object('exact',t.exact_ord,'unmatched',t.unmatched,'ambiguous',t.ambiguous,
      'malformed',t.malformed,'matchRate',coalesce(round(100.0*t.exact_ord/nullif(t.n,0),1),0),
      'unmatchedReasons',jsonb_build_object('transactionNotIngestedYet',t.pending_identity,
        'ordMappingAbsent',t.ord_mapping_absent,'canonicalOrderAbsent',t.canonical_absent,
        'malformedProviderIdentity',t.malformed_identity,'conflictingIdentity',t.conflicting_identity,'unknown',t.unknown_identity)),
    'parameters',jsonb_build_object(
      'affid',jsonb_build_object('count',t.affid,'percentage',coalesce(round(100.0*t.affid/nullif(t.n,0),1),0)),
      'sub1',jsonb_build_object('count',t.sub1,'percentage',coalesce(round(100.0*t.sub1/nullif(t.n,0),1),0)),
      'sub4',jsonb_build_object('count',t.sub4,'percentage',coalesce(round(100.0*t.sub4/nullif(t.n,0),1),0)),
      '_ef_transaction_id',jsonb_build_object('count',t.ef_transaction_id,'percentage',coalesce(round(100.0*t.ef_transaction_id/nullif(t.n,0),1),0)),
      'transactionId',jsonb_build_object('count',t.transaction_id,'percentage',coalesce(round(100.0*t.transaction_id/nullif(t.n,0),1),0)),
      'tid',jsonb_build_object('count',t.tid,'percentage',coalesce(round(100.0*t.tid/nullif(t.n,0),1),0)),
      'c1',jsonb_build_object('count',t.c1,'percentage',coalesce(round(100.0*t.c1/nullif(t.n,0),1),0)),
      'anyAlias',t.any_alias,'allAliases',t.all_alias,'anyField',t.any_attribution,'noFields',t.n-t.any_attribution),
    'aliases',jsonb_build_object(
      'all_agree',jsonb_build_object('count',t.all_agree,'percentage',coalesce(round(100.0*t.all_agree/nullif(t.n,0),1),0)),
      'single_alias',jsonb_build_object('count',t.single_alias,'percentage',coalesce(round(100.0*t.single_alias/nullif(t.n,0),1),0)),
      'conflict',jsonb_build_object('count',t.alias_conflict,'percentage',coalesce(round(100.0*t.alias_conflict/nullif(t.n,0),1),0)),
      'none',jsonb_build_object('count',t.no_alias,'percentage',coalesce(round(100.0*t.no_alias/nullif(t.n,0),1),0))),
    'everflow',jsonb_build_object(
      'exact_match',jsonb_build_object('count',t.stored_exact,'percentage',coalesce(round(100.0*t.stored_exact/nullif(t.n,0),1),0)),
      'partial_match',jsonb_build_object('count',t.stored_partial,'percentage',coalesce(round(100.0*t.stored_partial/nullif(t.n,0),1),0)),
      'conflict',jsonb_build_object('count',t.stored_conflict,'percentage',coalesce(round(100.0*t.stored_conflict/nullif(t.n,0),1),0)),
      'no_everflow_record',jsonb_build_object('count',t.stored_no_record,'percentage',coalesce(round(100.0*t.stored_no_record/nullif(t.n,0),1),0)),
      'no_commas_tid',jsonb_build_object('count',t.stored_no_tid,'percentage',coalesce(round(100.0*t.stored_no_tid/nullif(t.n,0),1),0)),
      'not_evaluated',jsonb_build_object('count',t.stored_not_evaluated,'percentage',coalesce(round(100.0*t.stored_not_evaluated/nullif(t.n,0),1),0))),
    'comparisonFreshness',jsonb_build_object('storedNoRecordNowLinked',t.later_ef_linked),
    'currentEverflow',jsonb_build_object('exact_match',t.current_exact,'conflict',t.current_conflict,
      'no_everflow_record',t.current_no_record,'no_commas_tid',t.current_no_tid),
    'fieldAgreement',jsonb_build_object(
      'transactionId',jsonb_build_object('linkedPopulation',f.linked,'comparable',f.tid_comparable,'agree',f.tid_comparable,'disagree',0,'commasMissing',0,'everflowMissing',0,'bothMissing',0),
      'affiliateId',jsonb_build_object('linkedPopulation',f.linked,'comparable',f.aff_comparable,'agree',f.aff_agree,'disagree',f.aff_comparable-f.aff_agree,'commasMissing',f.aff_commas_missing,'everflowMissing',f.aff_ef_missing,'bothMissing',f.aff_both_missing),
      'sub1',jsonb_build_object('linkedPopulation',f.linked,'comparable',f.sub1_comparable,'agree',f.sub1_agree,'disagree',f.sub1_comparable-f.sub1_agree,'commasMissing',f.sub1_commas_missing,'everflowMissing',f.sub1_ef_missing,'bothMissing',f.sub1_both_missing),
      'sub4',jsonb_build_object('linkedPopulation',f.linked,'comparable',f.sub4_comparable,'agree',f.sub4_agree,'disagree',f.sub4_comparable-f.sub4_agree,'commasMissing',f.sub4_commas_missing,'everflowMissing',f.sub4_ef_missing,'bothMissing',f.sub4_both_missing)),
    'paymentPaths','[]'::jsonb,'paymentPathAvailability','UNAVAILABLE',
    'noTid',jsonb_build_object('purchases',t.no_alias,'exactOrd',t.no_tid_exact,
      'affiliatePresent',t.no_tid_affid,'sub1Present',t.no_tid_sub1,'sub4Present',t.no_tid_sub4,
      'commerceIdentity','KNOWN_WHEN_ORD_EXACT','marketingEvidence','ABSENT_WHEN_ALL_FIELDS_MISSING'),
    'provenance',jsonb_build_object('evidenceReconciled',t.evidence_reconciled,'liveNormalizer',t.live_v2,
      'laterReconciled',t.later_reconciled),
    'latency',jsonb_build_object('webhookToOrdAvailable',jsonb_build_object('measured',l.ord_measured,
      'medianSeconds',round(l.ord_median::numeric),'p95Seconds',round(l.ord_p95::numeric),'maxSeconds',round(l.ord_max)),
      'webhookToJourneyShadow',jsonb_build_object('measured',l.journey_measured,
      'medianSeconds',round(l.journey_median::numeric),'p95Seconds',round(l.journey_p95::numeric),'maxSeconds',round(l.journey_max)),
      'webhookToFirstExactMatch',null),
    'daily',d.items,
    'maturity',jsonb_build_object('sample',t.n,'postCutover',m.post_epoch,'confirmedLiveV2',t.live_v2,
      'measurementEpochAt',m.begins_at,'targetPurchases',500,'targetHealthyDays',7,'healthyDays',m.healthy_days,
      'status',case when m.post_epoch>=500 or m.healthy_days>=7 then 'DECISION_GATE_REACHED'
        when t.n>0 then 'MEASUREMENT_ACTIVE' else 'INSUFFICIENT_SAMPLE' end),
    'rejectedTraffic',jsonb_build_object('malformed',null,'unverified',null,
      'note','Rejected request denominator is not durably available.'),
    'initialMatchState','UNKNOWN','identityLatency','UNAVAILABLE'
  ) into v_report from totals t cross join field_agreement f cross join daily d cross join latencies l cross join maturity m;
  return v_report;
end $$;

revoke all on function public.read_commas_attribution_quality_v1(uuid,uuid,uuid,date,date,text,text,text,text)
  from public,anon,authenticated,authenticator;
grant execute on function public.read_commas_attribution_quality_v1(uuid,uuid,uuid,date,date,text,text,text,text) to service_role;

create or replace function public.read_commas_attribution_conflicts_v1(
  p_organization_id uuid,p_connection_id uuid,p_provider_account_id uuid,
  p_limit integer default 50,p_offset integer default 0,
  p_from date default null,p_to date default null,p_comparison text default null,
  p_alias text default null,p_ord text default null,p_derivation text default null
) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare v_rows jsonb;
begin
  if p_limit<1 or p_limit>50 or p_offset<0 or p_offset>10000
    or not exists(select 1 from public.commerce_provider_accounts a
      join public.commerce_provider_connections c on c.id=a.connection_id and c.organization_id=a.organization_id
      where a.organization_id=p_organization_id and a.connection_id=p_connection_id
        and a.id=p_provider_account_id and a.status='active' and c.provider='commas' and c.status='connected')
  then raise exception 'Commas conflict report unavailable' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'eventReference',s.id,'orderReference',s.canonical_order_id,'eventAt',s.first_observed_at,
    'derivationMode',case when s.evidence_version='commas-provider-attribution-v2' then 'LIVE_V2' else 'RECONCILED_FROM_EVIDENCE' end,
    'ordMatchState',s.match_state,'aliasState',s.alias_state,'comparisonState',s.everflow_comparison_state,
    'classification',case when s.shapes=1 and s.sub4 is not null and s.ef_sub4 is not null and s.sub4<>s.ef_sub4
      then 'FIELD_LEVEL_CONFLICT' when s.alias_state='conflict' then 'ALIAS_CONFLICT'
      when s.shapes>1 then 'AMBIGUOUS_EVERFLOW_IDENTITY' else 'UNRESOLVED' end,
    'fieldDiagnostics',jsonb_build_object(
      'transactionIdentity',case when s.shapes=1 then 'agree' else 'unavailable' end,
      'affiliateId',case when s.shapes<>1 then 'unavailable' when s.affiliate_id is null and s.ef_affiliate_id is null then 'both_missing'
        when s.affiliate_id is null then 'commas_missing' when s.ef_affiliate_id is null then 'everflow_missing'
        when s.affiliate_id=s.ef_affiliate_id then 'agree' else 'disagree' end,
      'sub1',case when s.shapes<>1 then 'unavailable' when s.sub1 is null and s.ef_sub1 is null then 'both_missing'
        when s.sub1 is null then 'commas_missing' when s.ef_sub1 is null then 'everflow_missing'
        when s.sub1=s.ef_sub1 then 'agree' else 'disagree' end,
      'sub4',case when s.shapes<>1 then 'unavailable' when s.sub4 is null and s.ef_sub4 is null then 'both_missing'
        when s.sub4 is null then 'commas_missing' when s.ef_sub4 is null then 'everflow_missing'
        when s.sub4=s.ef_sub4 then 'agree' else 'disagree' end),
    'conflictingFields',to_jsonb(array_remove(array[
      case when s.shapes=1 and s.affiliate_id is not null and s.ef_affiliate_id is not null and s.affiliate_id<>s.ef_affiliate_id then 'affiliate_id' end,
      case when s.shapes=1 and s.sub1 is not null and s.ef_sub1 is not null and s.sub1<>s.ef_sub1 then 'sub1' end,
      case when s.shapes=1 and s.sub4 is not null and s.ef_sub4 is not null and s.sub4<>s.ef_sub4 then 'sub4' end
    ]::text[],null)),
    'conflictingAliases',to_jsonb(array_remove(array[
      case when s.ef_transaction_id is not null and s.ef_transaction_id<>s.observed_tid then '_ef_transaction_id' end,
      case when s.transaction_id is not null and s.transaction_id<>s.observed_tid then 'transaction_id' end,
      case when s.tid is not null and s.tid<>s.observed_tid then 'tid' end,
      case when s.c1 is not null and s.c1<>s.observed_tid then 'c1' end
    ]::text[],null)),
    'diagnosticStatus','unreviewed')),'[]'::jsonb) into v_rows
  from (
    select o.id,o.canonical_order_id,o.first_observed_at,o.match_state,o.alias_state,o.everflow_comparison_state,
      o.affiliate_id,o.sub1,o.sub4,o.ef_transaction_id,o.transaction_id,o.tid,o.c1,
      coalesce(o.ef_transaction_id,o.transaction_id,o.tid,o.c1) observed_tid,
      e.normalizer_version evidence_version,
      ef.shapes,case when ef.shapes=1 then ef.affiliate_id end ef_affiliate_id,
      case when ef.shapes=1 then ef.sub1 end ef_sub1,case when ef.shapes=1 then ef.sub4 end ef_sub4
    from public.commerce_provider_attribution_observations o
    join public.commerce_evidence_records e on e.id=o.evidence_id and e.organization_id=o.organization_id
      and e.connection_id=o.connection_id and e.provider_account_id=o.provider_account_id
    left join lateral (
      select count(distinct (x.transaction_id,x.affiliate_id,x.sub1,x.sub4)) shapes,
        max(x.affiliate_id) affiliate_id,max(x.sub1) sub1,max(x.sub4) sub4
      from (select transaction_id,affiliate_id,sub1,sub4 from public.everflow_conversion_events
        where organization_id=o.organization_id and transaction_id=coalesce(o.ef_transaction_id,o.transaction_id,o.tid,o.c1)
        union all select transaction_id,affiliate_id,sub1,sub4 from public.everflow_click_events
        where organization_id=o.organization_id and transaction_id=coalesce(o.ef_transaction_id,o.transaction_id,o.tid,o.c1)) x
    ) ef on true
    where o.organization_id=p_organization_id and o.connection_id=p_connection_id
      and o.provider_account_id=p_provider_account_id and o.provider='commas'
      and o.provider_event_type='product.purchased'
      and (o.everflow_comparison_state='conflict' or o.alias_state='conflict'
        or (ef.shapes=1 and ((o.affiliate_id is not null and ef.affiliate_id is not null and o.affiliate_id<>ef.affiliate_id)
          or (o.sub1 is not null and ef.sub1 is not null and o.sub1<>ef.sub1)
          or (o.sub4 is not null and ef.sub4 is not null and o.sub4<>ef.sub4))))
      and (p_from is null or (o.first_observed_at at time zone 'UTC')::date>=p_from)
      and (p_to is null or (o.first_observed_at at time zone 'UTC')::date<=p_to)
      and (p_comparison is null or o.everflow_comparison_state=p_comparison)
      and (p_alias is null or o.alias_state=p_alias)
      and (p_ord is null or o.match_state=p_ord)
      and (p_derivation is null or case when e.normalizer_version='commas-provider-attribution-v2'
        then 'LIVE_V2' else 'RECONCILED_FROM_EVIDENCE' end=p_derivation)
    order by o.first_observed_at desc,o.id desc limit p_limit offset p_offset
  ) s;
  return v_rows;
end $$;

revoke all on function public.read_commas_attribution_conflicts_v1(uuid,uuid,uuid,integer,integer,date,date,text,text,text,text)
  from public,anon,authenticated,authenticator;
grant execute on function public.read_commas_attribution_conflicts_v1(uuid,uuid,uuid,integer,integer,date,date,text,text,text,text) to service_role;
