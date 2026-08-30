begin;

create or replace function public.run_everflow_order_reconciliation_batch_v3(
  p_connection_id uuid,
  p_limit integer default 250
)
returns table(processed integer, matched integer, ambiguous integer, unmatched integer, remaining integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_algorithm constant text := 'deterministic_order_v3';
  v_now timestamptz := clock_timestamp();
  v_processed integer := 0;
  v_matched integer := 0;
  v_ambiguous integer := 0;
  v_unmatched integer := 0;
  v_remaining integer := 0;
begin
  if p_connection_id is null then
    raise exception 'Everflow connection is required.' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Everflow reconciliation batch size must be between 1 and 500.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.commerce_provider_connections c
    where c.id = p_connection_id and c.provider = 'everflow' and c.status = 'connected'
  ) then
    raise exception 'Everflow connection is unavailable.' using errcode = '22023';
  end if;

  if not pg_try_advisory_xact_lock(hashtext('everflow_order_backfill_v3'), hashtext(p_connection_id::text)) then
    select count(*)::integer into v_remaining
    from public.everflow_conversion_events e
    where e.connection_id = p_connection_id
      and not exists (
        select 1 from public.everflow_order_reconciliations r
        where r.event_id=e.id and r.algorithm_version=v_algorithm
      );
    return query select 0,0,0,0,v_remaining;
    return;
  end if;

  with batch as materialized (
    select e.*
    from public.everflow_conversion_events e
    where e.connection_id = p_connection_id
      and not exists (
        select 1 from public.everflow_order_reconciliations r
        where r.event_id=e.id and r.algorithm_version=v_algorithm
      )
    order by e.conversion_at asc, e.id asc
    limit p_limit
  ), evaluated as materialized (
    select
      e.id event_id,
      e.organization_id,
      e.connection_id,
      e.provider_account_id,
      e.source_identity,
      e.transaction_id,
      e.event_name,
      e.payload_hash,
      e.conversion_at,
      (coalesce(e.revenue,0) <> 0 or coalesce(e.sale_amount,0) <> 0) as is_commerce,
      existing.canonical_object_id existing_order_id,
      coalesce(direct_match.candidate_count,0) direct_candidate_count,
      direct_match.canonical_order_id direct_order_id,
      coalesce(strict_email.candidate_count,0) strict_candidate_count,
      strict_email.canonical_order_id strict_order_id,
      coalesce(bundle_email.candidate_count,0) bundle_candidate_count,
      bundle_email.canonical_order_id bundle_order_id,
      coalesce(tight_email.candidate_count,0) tight_candidate_count,
      tight_email.canonical_order_id tight_order_id
    from batch e
    left join lateral (
      select m.canonical_object_id
      from public.commerce_source_mappings m
      where m.connection_id=e.connection_id
        and m.provider_account_id=e.provider_account_id
        and m.source_object_type='everflow_conversion'
        and m.source_object_id=e.source_identity
        and m.canonical_object_type='order'
      limit 1
    ) existing on true
    left join lateral (
      select count(distinct po.canonical_order_id)::integer candidate_count,
             case when count(distinct po.canonical_order_id)=1 then (array_agg(distinct po.canonical_order_id))[1] end canonical_order_id
      from public.platform_orders po
      where existing.canonical_object_id is null
        and nullif(btrim(e.transaction_id),'') is not null
        and po.organization_id=e.organization_id
        and po.canonical_order_id is not null
        and (nullif(btrim(po.everflow_transaction_id),'')=btrim(e.transaction_id)
             or nullif(btrim(po.transaction_id),'')=btrim(e.transaction_id))
    ) direct_match on true
    left join lateral (
      select count(distinct po.canonical_order_id)::integer candidate_count,
             case when count(distinct po.canonical_order_id)=1 then (array_agg(distinct po.canonical_order_id))[1] end canonical_order_id
      from public.platform_orders po
      where existing.canonical_object_id is null
        and coalesce(direct_match.candidate_count,0)=0
        and (coalesce(e.revenue,0) <> 0 or coalesce(e.sale_amount,0) <> 0)
        and e.email_normalized is not null
        and po.organization_id=e.organization_id
        and po.canonical_order_id is not null
        and lower(btrim(po.email))=lower(btrim(e.email_normalized))
        and po.order_ts between e.conversion_at-interval '72 hours' and e.conversion_at+interval '72 hours'
        and coalesce(po.receipt_total,po.gross_amount) is not null
        and abs(coalesce(po.receipt_total,po.gross_amount)-coalesce(e.sale_amount,e.revenue))<=0.01
    ) strict_email on true
    left join lateral (
      select count(distinct po.canonical_order_id)::integer candidate_count,
             case when count(distinct po.canonical_order_id)=1 then (array_agg(distinct po.canonical_order_id))[1] end canonical_order_id
      from public.platform_orders po
      where existing.canonical_object_id is null
        and coalesce(direct_match.candidate_count,0)=0
        and coalesce(strict_email.candidate_count,0)=0
        and (coalesce(e.revenue,0) <> 0 or coalesce(e.sale_amount,0) <> 0)
        and upper(coalesce(e.event_name,'')) in ('PUSH BUTTON SYSTEM','FAST TRACK SUPPORT','REVENUE BOOSTER ROADMAP')
        and e.email_normalized is not null
        and po.organization_id=e.organization_id
        and po.canonical_order_id is not null
        and lower(btrim(po.email))=lower(btrim(e.email_normalized))
        and po.order_ts between e.conversion_at-interval '10 seconds' and e.conversion_at+interval '10 seconds'
    ) bundle_email on true
    left join lateral (
      select count(distinct po.canonical_order_id)::integer candidate_count,
             case when count(distinct po.canonical_order_id)=1 then (array_agg(distinct po.canonical_order_id))[1] end canonical_order_id
      from public.platform_orders po
      where existing.canonical_object_id is null
        and coalesce(direct_match.candidate_count,0)=0
        and coalesce(strict_email.candidate_count,0)=0
        and coalesce(bundle_email.candidate_count,0)=0
        and (coalesce(e.revenue,0) <> 0 or coalesce(e.sale_amount,0) <> 0)
        and e.email_normalized is not null
        and po.organization_id=e.organization_id
        and po.canonical_order_id is not null
        and lower(btrim(po.email))=lower(btrim(e.email_normalized))
        and po.order_ts between e.conversion_at-interval '30 minutes' and e.conversion_at+interval '30 minutes'
    ) tight_email on true
  ), decisions as materialized (
    select *,
      case
        when not is_commerce then null
        when existing_order_id is not null then existing_order_id
        when direct_candidate_count=1 then direct_order_id
        when direct_candidate_count=0 and strict_candidate_count=1 then strict_order_id
        when direct_candidate_count=0 and strict_candidate_count=0 and bundle_candidate_count=1 then bundle_order_id
        when direct_candidate_count=0 and strict_candidate_count=0 and bundle_candidate_count=0 and tight_candidate_count=1 then tight_order_id
        else null
      end matched_order_id,
      case
        when not is_commerce then 0
        when existing_order_id is not null then 1
        when direct_candidate_count>0 then direct_candidate_count
        when strict_candidate_count>0 then strict_candidate_count
        when bundle_candidate_count>0 then bundle_candidate_count
        else tight_candidate_count
      end candidate_count,
      case
        when not is_commerce then 'unmatched'
        when existing_order_id is not null or direct_candidate_count=1 then 'high_confidence'
        when direct_candidate_count>1 then 'needs_review'
        when strict_candidate_count=1 then 'medium_confidence'
        when strict_candidate_count>1 then 'needs_review'
        when bundle_candidate_count=1 then 'high_confidence'
        when bundle_candidate_count>1 then 'needs_review'
        when tight_candidate_count=1 then 'medium_confidence'
        when tight_candidate_count>1 then 'needs_review'
        else 'unmatched'
      end confidence_band,
      case
        when not is_commerce then 'non_order_event'
        when existing_order_id is not null then 'existing_mapping'
        when direct_candidate_count>0 then 'transaction_id'
        when strict_candidate_count>0 then 'email_time_amount'
        when bundle_candidate_count>0 then 'checkout_bundle_10s'
        when tight_candidate_count>0 then 'email_time_30m'
        else 'none'
      end match_method
    from evaluated
  ), inserted as (
    insert into public.everflow_order_reconciliations(
      id,organization_id,connection_id,event_id,algorithm_version,confidence_band,candidate_count,
      matched_canonical_order_id,evidence_factors,reconciled_at
    )
    select gen_random_uuid(),organization_id,connection_id,event_id,v_algorithm,confidence_band,candidate_count,
      matched_order_id,
      jsonb_build_object(
        'match_method',match_method,
        'confidence',case match_method when 'existing_mapping' then 1.0 when 'transaction_id' then 1.0 when 'checkout_bundle_10s' then 0.95 when 'email_time_amount' then 0.85 when 'email_time_30m' then 0.80 else 0.0 end,
        'event_class',case when is_commerce then 'commerce_value' else 'upper_funnel' end,
        'event_name',event_name,
        'checkout_bundle_event',upper(coalesce(event_name,'')) in ('PUSH BUTTON SYSTEM','FAST TRACK SUPPORT','REVENUE BOOSTER ROADMAP'),
        'checkout_bundle_window_seconds',10,
        'tight_window_minutes',30,
        'amount_tolerance',0.01
      ),
      v_now
    from decisions
    on conflict(event_id,algorithm_version) do nothing
    returning confidence_band,matched_canonical_order_id
  )
  select count(*)::integer,
         count(*) filter(where matched_canonical_order_id is not null)::integer,
         count(*) filter(where confidence_band='needs_review')::integer,
         count(*) filter(where confidence_band='unmatched')::integer
  into v_processed,v_matched,v_ambiguous,v_unmatched
  from inserted;

  insert into public.commerce_source_mappings(
    organization_id,connection_id,provider_account_id,source_object_type,source_object_id,
    canonical_object_type,canonical_object_id,first_seen_at,last_seen_at,source_created_at,
    payload_hash,mapping_version,state,metadata
  )
  select e.organization_id,e.connection_id,e.provider_account_id,'everflow_conversion',e.source_identity,
    'order',r.matched_canonical_order_id,e.conversion_at,v_now,e.conversion_at,e.payload_hash,
    'everflow-order-linkage-v3','active',jsonb_build_object('algorithm_version',v_algorithm,'match_method',r.evidence_factors->>'match_method')
  from public.everflow_order_reconciliations r
  join public.everflow_conversion_events e on e.id=r.event_id and e.organization_id=r.organization_id
  where r.connection_id=p_connection_id and r.algorithm_version=v_algorithm and r.reconciled_at=v_now
    and r.matched_canonical_order_id is not null
  on conflict(connection_id,provider_account_id,source_object_type,source_object_id)
  do update set last_seen_at=greatest(public.commerce_source_mappings.last_seen_at,excluded.last_seen_at),
                payload_hash=excluded.payload_hash,
                mapping_version=excluded.mapping_version,
                metadata=excluded.metadata,
                updated_at=v_now
  where public.commerce_source_mappings.canonical_object_type='order'
    and public.commerce_source_mappings.canonical_object_id=excluded.canonical_object_id;

  insert into public.commerce_source_mappings(
    organization_id,connection_id,provider_account_id,source_object_type,source_object_id,
    canonical_object_type,canonical_object_id,first_seen_at,last_seen_at,source_created_at,
    payload_hash,mapping_version,state,metadata
  )
  select e.organization_id,e.connection_id,e.provider_account_id,'everflow_transaction',btrim(e.transaction_id),
    'order',r.matched_canonical_order_id,e.conversion_at,v_now,e.conversion_at,e.payload_hash,
    'everflow-order-linkage-v3','active',jsonb_build_object('algorithm_version',v_algorithm)
  from public.everflow_order_reconciliations r
  join public.everflow_conversion_events e on e.id=r.event_id and e.organization_id=r.organization_id
  where r.connection_id=p_connection_id and r.algorithm_version=v_algorithm and r.reconciled_at=v_now
    and r.matched_canonical_order_id is not null
    and r.evidence_factors->>'match_method'='transaction_id'
    and nullif(btrim(e.transaction_id),'') is not null
  on conflict(connection_id,provider_account_id,source_object_type,source_object_id)
  do update set last_seen_at=greatest(public.commerce_source_mappings.last_seen_at,excluded.last_seen_at),
                payload_hash=excluded.payload_hash,
                mapping_version=excluded.mapping_version,
                metadata=excluded.metadata,
                updated_at=v_now
  where public.commerce_source_mappings.canonical_object_type='order'
    and public.commerce_source_mappings.canonical_object_id=excluded.canonical_object_id;

  select count(*)::integer into v_remaining
  from public.everflow_conversion_events e
  where e.connection_id=p_connection_id
    and not exists(select 1 from public.everflow_order_reconciliations r where r.event_id=e.id and r.algorithm_version=v_algorithm);

  return query select v_processed,v_matched,v_ambiguous,v_unmatched,v_remaining;
end;
$$;

revoke all on function public.run_everflow_order_reconciliation_batch_v3(uuid,integer) from public;
grant execute on function public.run_everflow_order_reconciliation_batch_v3(uuid,integer) to service_role;

create or replace function public.run_everflow_order_reconciliation_sweep_v3(
  p_batch_size integer default 250,
  p_connection_limit integer default 10
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_connection record;
begin
  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 500 then
    raise exception 'Everflow reconciliation batch size must be between 1 and 500.' using errcode = '22023';
  end if;
  if p_connection_limit is null or p_connection_limit < 1 or p_connection_limit > 25 then
    raise exception 'Everflow reconciliation connection limit must be between 1 and 25.' using errcode = '22023';
  end if;

  for v_connection in
    select c.id
    from public.commerce_provider_connections c
    where c.provider = 'everflow'
      and c.status = 'connected'
    order by c.created_at asc
    limit p_connection_limit
  loop
    perform public.run_everflow_order_reconciliation_batch_v3(v_connection.id, p_batch_size);
  end loop;
end;
$$;

revoke all on function public.run_everflow_order_reconciliation_sweep_v3(integer,integer) from public;
grant execute on function public.run_everflow_order_reconciliation_sweep_v3(integer,integer) to service_role;

create extension if not exists pg_cron;

select cron.unschedule(jobid)
from cron.job
where jobname in ('tracekit-everflow-order-reconciliation-v2','tracekit-everflow-order-reconciliation-v3');

select cron.schedule(
  'tracekit-everflow-order-reconciliation-v3',
  '*/5 * * * *',
  $$select public.run_everflow_order_reconciliation_sweep_v3(250, 10);$$
);

commit;
