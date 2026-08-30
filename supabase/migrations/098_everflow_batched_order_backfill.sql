begin;

create or replace function public.run_everflow_order_reconciliation_batch_v1(
  p_connection_id uuid,
  p_limit integer default 250
)
returns table(
  processed integer,
  matched integer,
  ambiguous integer,
  unmatched integer,
  remaining integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_algorithm constant text := 'deterministic_order_v1';
  v_now timestamptz := now();
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
    select 1
    from public.commerce_provider_connections c
    where c.id = p_connection_id
      and c.provider = 'everflow'
      and c.status = 'connected'
  ) then
    raise exception 'Everflow connection is unavailable.' using errcode = '22023';
  end if;

  if not pg_try_advisory_xact_lock(hashtext('everflow_order_backfill'), hashtext(p_connection_id::text)) then
    select count(*)::integer
      into v_remaining
    from public.everflow_conversion_events e
    where e.connection_id = p_connection_id
      and not exists (
        select 1
        from public.everflow_order_reconciliations r
        where r.event_id = e.id
          and r.algorithm_version = v_algorithm
      );
    return query select 0, 0, 0, 0, v_remaining;
    return;
  end if;

  with batch as materialized (
    select e.*
    from public.everflow_conversion_events e
    where e.connection_id = p_connection_id
      and not exists (
        select 1
        from public.everflow_order_reconciliations r
        where r.event_id = e.id
          and r.algorithm_version = v_algorithm
      )
    order by e.conversion_at asc, e.id asc
    limit p_limit
  ),
  evaluated as materialized (
    select
      e.id as event_id,
      e.organization_id,
      e.connection_id,
      e.provider_account_id,
      e.source_identity,
      e.transaction_id,
      e.payload_hash,
      e.conversion_at,
      existing.canonical_object_id as existing_order_id,
      coalesce(direct_match.candidate_count, 0) as direct_candidate_count,
      direct_match.canonical_order_id as direct_order_id,
      coalesce(email_match.candidate_count, 0) as email_candidate_count,
      email_match.canonical_order_id as email_order_id,
      (e.sale_amount is not null or e.revenue is not null) as has_amount
    from batch e
    left join lateral (
      select m.canonical_object_id
      from public.commerce_source_mappings m
      where m.connection_id = e.connection_id
        and m.provider_account_id = e.provider_account_id
        and m.source_object_type = 'everflow_conversion'
        and m.source_object_id = e.source_identity
        and m.canonical_object_type = 'order'
      limit 1
    ) existing on true
    left join lateral (
      select
        count(distinct po.canonical_order_id)::integer as candidate_count,
        case when count(distinct po.canonical_order_id) = 1
          then (array_agg(distinct po.canonical_order_id))[1]
          else null
        end as canonical_order_id
      from public.platform_orders po
      where e.transaction_id is not null
        and btrim(e.transaction_id) <> ''
        and po.organization_id = e.organization_id
        and po.canonical_order_id is not null
        and (
          nullif(btrim(po.everflow_transaction_id), '') = btrim(e.transaction_id)
          or nullif(btrim(po.transaction_id), '') = btrim(e.transaction_id)
        )
    ) direct_match on existing.canonical_object_id is null
    left join lateral (
      select
        count(distinct po.canonical_order_id)::integer as candidate_count,
        case when count(distinct po.canonical_order_id) = 1
          then (array_agg(distinct po.canonical_order_id))[1]
          else null
        end as canonical_order_id
      from public.platform_orders po
      where coalesce(direct_match.candidate_count, 0) = 0
        and e.email_normalized is not null
        and po.organization_id = e.organization_id
        and po.canonical_order_id is not null
        and lower(btrim(po.email)) = lower(btrim(e.email_normalized))
        and po.order_ts between
          e.conversion_at - case when coalesce(e.sale_amount, e.revenue) is null then interval '6 hours' else interval '72 hours' end
          and e.conversion_at + case when coalesce(e.sale_amount, e.revenue) is null then interval '6 hours' else interval '72 hours' end
        and (
          coalesce(e.sale_amount, e.revenue) is null
          or (
            coalesce(po.receipt_total, po.gross_amount) is not null
            and abs(coalesce(po.receipt_total, po.gross_amount) - coalesce(e.sale_amount, e.revenue)) <= 0.01
          )
        )
    ) email_match on existing.canonical_object_id is null
  ),
  decisions as materialized (
    select
      event_id,
      organization_id,
      connection_id,
      provider_account_id,
      source_identity,
      transaction_id,
      payload_hash,
      conversion_at,
      case
        when existing_order_id is not null then existing_order_id
        when direct_candidate_count = 1 then direct_order_id
        when direct_candidate_count = 0 and email_candidate_count = 1 then email_order_id
        else null
      end as matched_order_id,
      case
        when existing_order_id is not null then 1
        when direct_candidate_count > 0 then direct_candidate_count
        else email_candidate_count
      end as candidate_count,
      case
        when existing_order_id is not null then 'high_confidence'
        when direct_candidate_count = 1 then 'high_confidence'
        when direct_candidate_count > 1 then 'needs_review'
        when email_candidate_count = 1 and has_amount then 'medium_confidence'
        when email_candidate_count = 1 then 'medium_confidence'
        when email_candidate_count > 1 then 'needs_review'
        else 'unmatched'
      end as confidence_band,
      case
        when existing_order_id is not null then 'existing_mapping'
        when direct_candidate_count > 0 then 'transaction_id'
        when email_candidate_count > 0 and has_amount then 'email_time_amount'
        when email_candidate_count > 0 then 'email_time'
        else 'none'
      end as match_method
    from evaluated
  ),
  inserted as (
    insert into public.everflow_order_reconciliations(
      id,
      organization_id,
      connection_id,
      event_id,
      algorithm_version,
      confidence_band,
      candidate_count,
      matched_canonical_order_id,
      evidence_factors,
      reconciled_at
    )
    select
      gen_random_uuid(),
      d.organization_id,
      d.connection_id,
      d.event_id,
      v_algorithm,
      d.confidence_band,
      d.candidate_count,
      d.matched_order_id,
      jsonb_build_object(
        'match_method', d.match_method,
        'confidence', case
          when d.match_method in ('existing_mapping', 'transaction_id') then 1.0
          when d.match_method = 'email_time_amount' then 0.85
          when d.match_method = 'email_time' then 0.65
          else 0.0
        end,
        'amount_tolerance', 0.01
      ),
      v_now
    from decisions d
    on conflict (event_id, algorithm_version) do nothing
    returning confidence_band, matched_canonical_order_id
  )
  select
    count(*)::integer,
    count(*) filter (where matched_canonical_order_id is not null)::integer,
    count(*) filter (where confidence_band = 'needs_review')::integer,
    count(*) filter (where confidence_band = 'unmatched')::integer
  into v_processed, v_matched, v_ambiguous, v_unmatched
  from inserted;

  insert into public.commerce_source_mappings(
    organization_id,
    connection_id,
    provider_account_id,
    source_object_type,
    source_object_id,
    canonical_object_type,
    canonical_object_id,
    first_seen_at,
    last_seen_at,
    source_created_at,
    payload_hash,
    mapping_version,
    state,
    metadata
  )
  select
    e.organization_id,
    e.connection_id,
    e.provider_account_id,
    'everflow_conversion',
    e.source_identity,
    'order',
    r.matched_canonical_order_id,
    e.conversion_at,
    v_now,
    e.conversion_at,
    e.payload_hash,
    'everflow-order-linkage-v1',
    'active',
    jsonb_build_object('algorithm_version', v_algorithm)
  from public.everflow_order_reconciliations r
  join public.everflow_conversion_events e
    on e.id = r.event_id
   and e.organization_id = r.organization_id
  where r.connection_id = p_connection_id
    and r.algorithm_version = v_algorithm
    and r.reconciled_at = v_now
    and r.matched_canonical_order_id is not null
  on conflict (connection_id, provider_account_id, source_object_type, source_object_id)
  do update set
    last_seen_at = greatest(public.commerce_source_mappings.last_seen_at, excluded.last_seen_at),
    payload_hash = excluded.payload_hash,
    updated_at = v_now
  where public.commerce_source_mappings.canonical_object_type = 'order'
    and public.commerce_source_mappings.canonical_object_id = excluded.canonical_object_id;

  insert into public.commerce_source_mappings(
    organization_id,
    connection_id,
    provider_account_id,
    source_object_type,
    source_object_id,
    canonical_object_type,
    canonical_object_id,
    first_seen_at,
    last_seen_at,
    source_created_at,
    payload_hash,
    mapping_version,
    state,
    metadata
  )
  select
    e.organization_id,
    e.connection_id,
    e.provider_account_id,
    'everflow_transaction',
    btrim(e.transaction_id),
    'order',
    r.matched_canonical_order_id,
    e.conversion_at,
    v_now,
    e.conversion_at,
    e.payload_hash,
    'everflow-order-linkage-v1',
    'active',
    jsonb_build_object('algorithm_version', v_algorithm)
  from public.everflow_order_reconciliations r
  join public.everflow_conversion_events e
    on e.id = r.event_id
   and e.organization_id = r.organization_id
  where r.connection_id = p_connection_id
    and r.algorithm_version = v_algorithm
    and r.reconciled_at = v_now
    and r.matched_canonical_order_id is not null
    and r.evidence_factors->>'match_method' = 'transaction_id'
    and nullif(btrim(e.transaction_id), '') is not null
  on conflict (connection_id, provider_account_id, source_object_type, source_object_id)
  do update set
    last_seen_at = greatest(public.commerce_source_mappings.last_seen_at, excluded.last_seen_at),
    payload_hash = excluded.payload_hash,
    updated_at = v_now
  where public.commerce_source_mappings.canonical_object_type = 'order'
    and public.commerce_source_mappings.canonical_object_id = excluded.canonical_object_id;

  select count(*)::integer
    into v_remaining
  from public.everflow_conversion_events e
  where e.connection_id = p_connection_id
    and not exists (
      select 1
      from public.everflow_order_reconciliations r
      where r.event_id = e.id
        and r.algorithm_version = v_algorithm
    );

  return query select v_processed, v_matched, v_ambiguous, v_unmatched, v_remaining;
end;
$$;

revoke all on function public.run_everflow_order_reconciliation_batch_v1(uuid, integer) from public;
grant execute on function public.run_everflow_order_reconciliation_batch_v1(uuid, integer) to service_role;

commit;
