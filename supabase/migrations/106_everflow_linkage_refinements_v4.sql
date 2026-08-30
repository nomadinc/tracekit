begin;

create or replace function public.refresh_everflow_order_reconciliation_v4(p_connection_id uuid)
returns table(processed integer, matched integer, duplicates integer, ambiguous integer, unmatched integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if p_connection_id is null then raise exception 'Everflow connection is required.' using errcode='22023'; end if;

  insert into public.everflow_order_reconciliations(
    id,organization_id,connection_id,event_id,algorithm_version,confidence_band,candidate_count,
    matched_canonical_order_id,evidence_factors,reconciled_at
  )
  select
    gen_random_uuid(),r.organization_id,r.connection_id,r.event_id,'deterministic_order_v4',
    case
      when r.confidence_band <> 'needs_review' then r.confidence_band
      when duplicate_prior.event_id is not null then 'duplicate'
      when bundle15.candidate_count = 1 then 'high_confidence'
      when exact10.candidate_count = 1 then 'high_confidence'
      else r.confidence_band
    end,
    case
      when r.confidence_band <> 'needs_review' then r.candidate_count
      when duplicate_prior.event_id is not null then 0
      when bundle15.candidate_count = 1 then 1
      when exact10.candidate_count = 1 then 1
      else r.candidate_count
    end,
    case
      when r.confidence_band <> 'needs_review' then r.matched_canonical_order_id
      when duplicate_prior.event_id is not null then null
      when bundle15.candidate_count = 1 then bundle15.canonical_order_id
      when exact10.candidate_count = 1 then exact10.canonical_order_id
      else r.matched_canonical_order_id
    end,
    r.evidence_factors || jsonb_build_object(
      'v4_match_method',case
        when r.confidence_band <> 'needs_review' then 'v3_passthrough'
        when duplicate_prior.event_id is not null then 'duplicate_event'
        when bundle15.candidate_count = 1 then 'checkout_bundle_15s'
        when exact10.candidate_count = 1 then 'email_amount_10s'
        else 'needs_review'
      end,
      'duplicate_of_event_id',duplicate_prior.event_id,
      'checkout_bundle_window_seconds',15,
      'exact_amount_window_seconds',10
    ),
    v_now
  from public.everflow_order_reconciliations r
  join public.everflow_conversion_events e on e.id=r.event_id
  left join lateral (
    select e2.id event_id
    from public.everflow_conversion_events e2
    join public.commerce_source_mappings m
      on m.connection_id=e2.connection_id
     and m.provider_account_id=e2.provider_account_id
     and m.source_object_type='everflow_conversion'
     and m.source_object_id=e2.source_identity
     and m.canonical_object_type='order'
    where r.confidence_band='needs_review'
      and nullif(btrim(e.transaction_id),'') is not null
      and e2.connection_id=e.connection_id
      and e2.provider_account_id=e.provider_account_id
      and e2.id<>e.id
      and btrim(e2.transaction_id)=btrim(e.transaction_id)
      and upper(coalesce(e2.event_name,''))=upper(coalesce(e.event_name,''))
      and e2.conversion_at<e.conversion_at
    order by e2.conversion_at desc limit 1
  ) duplicate_prior on true
  left join lateral (
    select count(distinct po.canonical_order_id)::integer candidate_count,
           case when count(distinct po.canonical_order_id)=1 then (array_agg(distinct po.canonical_order_id))[1] end canonical_order_id
    from public.platform_orders po
    where r.confidence_band='needs_review'
      and duplicate_prior.event_id is null
      and upper(coalesce(e.event_name,'')) in ('PUSH BUTTON SYSTEM','FAST TRACK SUPPORT','REVENUE BOOSTER ROADMAP')
      and e.email_normalized is not null
      and (upper(coalesce(e.event_name,''))='PUSH BUTTON SYSTEM' or exists(
        select 1 from public.everflow_conversion_events me
        where me.connection_id=e.connection_id and me.provider_account_id=e.provider_account_id
          and lower(btrim(me.email_normalized))=lower(btrim(e.email_normalized))
          and upper(coalesce(me.event_name,''))='PUSH BUTTON SYSTEM'
          and me.conversion_at between e.conversion_at-interval '15 seconds' and e.conversion_at+interval '15 seconds'))
      and po.organization_id=e.organization_id and po.canonical_order_id is not null
      and lower(btrim(po.email))=lower(btrim(e.email_normalized))
      and po.order_ts between e.conversion_at-interval '15 seconds' and e.conversion_at+interval '15 seconds'
  ) bundle15 on true
  left join lateral (
    select count(distinct po.canonical_order_id)::integer candidate_count,
           case when count(distinct po.canonical_order_id)=1 then (array_agg(distinct po.canonical_order_id))[1] end canonical_order_id
    from public.platform_orders po
    where r.confidence_band='needs_review'
      and duplicate_prior.event_id is null
      and coalesce(bundle15.candidate_count,0)<>1
      and e.email_normalized is not null
      and coalesce(e.sale_amount,e.revenue) is not null
      and po.organization_id=e.organization_id and po.canonical_order_id is not null
      and lower(btrim(po.email))=lower(btrim(e.email_normalized))
      and po.order_ts between e.conversion_at-interval '10 seconds' and e.conversion_at+interval '10 seconds'
      and coalesce(po.receipt_total,po.gross_amount) is not null
      and abs(coalesce(po.receipt_total,po.gross_amount)-coalesce(e.sale_amount,e.revenue))<=0.01
  ) exact10 on true
  where r.connection_id=p_connection_id and r.algorithm_version='deterministic_order_v3'
  on conflict(event_id,algorithm_version) do update set
    confidence_band=excluded.confidence_band,candidate_count=excluded.candidate_count,
    matched_canonical_order_id=excluded.matched_canonical_order_id,evidence_factors=excluded.evidence_factors,
    reconciled_at=excluded.reconciled_at;

  return query
  select count(*)::integer,
         count(*) filter(where matched_canonical_order_id is not null)::integer,
         count(*) filter(where confidence_band='duplicate')::integer,
         count(*) filter(where confidence_band='needs_review')::integer,
         count(*) filter(where confidence_band='unmatched')::integer
  from public.everflow_order_reconciliations
  where connection_id=p_connection_id and algorithm_version='deterministic_order_v4';
end;
$$;

revoke all on function public.refresh_everflow_order_reconciliation_v4(uuid) from public;
grant execute on function public.refresh_everflow_order_reconciliation_v4(uuid) to service_role;

create or replace function public.run_everflow_order_reconciliation_sweep_v4(
  p_batch_size integer default 250,
  p_connection_limit integer default 10
)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_connection record;
begin
  perform public.run_everflow_order_reconciliation_sweep_v3(p_batch_size,p_connection_limit);
  for v_connection in
    select c.id from public.commerce_provider_connections c
    where c.provider='everflow' and c.status='connected'
    order by c.created_at limit p_connection_limit
  loop
    perform public.refresh_everflow_order_reconciliation_v4(v_connection.id);
  end loop;
end;
$$;

revoke all on function public.run_everflow_order_reconciliation_sweep_v4(integer,integer) from public;
grant execute on function public.run_everflow_order_reconciliation_sweep_v4(integer,integer) to service_role;

select cron.unschedule(jobid) from cron.job where jobname in ('tracekit-everflow-order-reconciliation-v3','tracekit-everflow-order-reconciliation-v4');
select cron.schedule('tracekit-everflow-order-reconciliation-v4','*/5 * * * *',$$select public.run_everflow_order_reconciliation_sweep_v4(250,10);$$);

commit;
