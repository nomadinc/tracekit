-- WS-016 M5: deterministic Everflow provider order ID reconciliation.
-- Exact provider commerce identity outranks heuristic matching.
create or replace function public.refresh_everflow_order_reconciliation_v5(p_connection_id uuid)
returns table(processed integer, matched integer, ambiguous integer, unmatched integer)
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_now timestamptz := clock_timestamp();
begin
  if p_connection_id is null then raise exception 'Everflow connection is required.' using errcode='22023'; end if;

  insert into public.everflow_order_reconciliations(
    id,organization_id,connection_id,event_id,algorithm_version,confidence_band,candidate_count,
    matched_canonical_order_id,evidence_factors,reconciled_at
  )
  select gen_random_uuid(),r.organization_id,r.connection_id,r.event_id,'deterministic_order_v5',
    case
      when exact_order.candidate_count=1 then 'high_confidence'
      when exact_order.candidate_count>1 then 'needs_review'
      else r.confidence_band
    end,
    case when exact_order.candidate_count>0 then exact_order.candidate_count else r.candidate_count end,
    case when exact_order.candidate_count=1 then exact_order.canonical_order_id else r.matched_canonical_order_id end,
    r.evidence_factors || jsonb_build_object(
      'v5_match_method',case
        when exact_order.candidate_count=1 then 'provider_order_id'
        when exact_order.candidate_count>1 then 'provider_order_id_ambiguous'
        else 'v4_passthrough'
      end,
      'provider_order_id',nullif(btrim(e.order_id),''),
      'confidence',case when exact_order.candidate_count=1 then 1.0 when exact_order.candidate_count>1 then 0.0 else coalesce((r.evidence_factors->>'confidence')::numeric,0.0) end
    ),
    v_now
  from public.everflow_order_reconciliations r
  join public.everflow_conversion_events e on e.id=r.event_id
  left join lateral (
    select count(distinct m.canonical_object_id)::integer candidate_count,
           case when count(distinct m.canonical_object_id)=1 then (array_agg(distinct m.canonical_object_id))[1] end canonical_order_id
    from public.commerce_source_mappings m
    where nullif(btrim(e.order_id),'') is not null
      and m.organization_id=e.organization_id
      and m.canonical_object_type='order'
      and m.source_object_id=btrim(e.order_id)
      and m.state='active'
  ) exact_order on true
  where r.connection_id=p_connection_id and r.algorithm_version='deterministic_order_v4'
  on conflict(event_id,algorithm_version) do update set
    confidence_band=excluded.confidence_band,candidate_count=excluded.candidate_count,
    matched_canonical_order_id=excluded.matched_canonical_order_id,evidence_factors=excluded.evidence_factors,
    reconciled_at=excluded.reconciled_at;

  insert into public.commerce_source_mappings(
    organization_id,connection_id,provider_account_id,source_object_type,source_object_id,
    canonical_object_type,canonical_object_id,first_seen_at,last_seen_at,source_created_at,
    payload_hash,mapping_version,state,metadata
  )
  select e.organization_id,e.connection_id,e.provider_account_id,'everflow_conversion',e.source_identity,
    'order',r.matched_canonical_order_id,e.conversion_at,v_now,e.conversion_at,e.payload_hash,
    'everflow-order-linkage-v5','active',jsonb_build_object(
      'algorithm_version','deterministic_order_v5',
      'match_method',coalesce(r.evidence_factors->>'v5_match_method',r.evidence_factors->>'v4_match_method',r.evidence_factors->>'match_method')
    )
  from public.everflow_order_reconciliations r
  join public.everflow_conversion_events e on e.id=r.event_id and e.organization_id=r.organization_id
  where r.connection_id=p_connection_id and r.algorithm_version='deterministic_order_v5'
    and r.reconciled_at=v_now and r.matched_canonical_order_id is not null
  on conflict(connection_id,provider_account_id,source_object_type,source_object_id)
  do update set last_seen_at=greatest(public.commerce_source_mappings.last_seen_at,excluded.last_seen_at),
    payload_hash=excluded.payload_hash,mapping_version=excluded.mapping_version,metadata=excluded.metadata,updated_at=v_now
  where public.commerce_source_mappings.canonical_object_type='order'
    and public.commerce_source_mappings.canonical_object_id=excluded.canonical_object_id;

  return query select count(*)::integer,
    count(*) filter(where matched_canonical_order_id is not null)::integer,
    count(*) filter(where confidence_band='needs_review')::integer,
    count(*) filter(where confidence_band='unmatched')::integer
  from public.everflow_order_reconciliations
  where connection_id=p_connection_id and algorithm_version='deterministic_order_v5';
end;
$$;

create or replace function public.run_everflow_order_reconciliation_sweep_v5(p_batch_size integer default 250,p_connection_limit integer default 10)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_connection record;
begin
  perform public.run_everflow_order_reconciliation_sweep_v4(p_batch_size,p_connection_limit);
  for v_connection in
    select c.id from public.commerce_provider_connections c
    where c.provider='everflow' and c.status='connected' order by c.created_at limit p_connection_limit
  loop
    perform public.refresh_everflow_order_reconciliation_v5(v_connection.id);
  end loop;
end;
$$;;
