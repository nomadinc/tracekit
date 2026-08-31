begin;

create or replace function public.reconcile_everflow_financial_projection_v1(p_connection_id uuid)
returns table(projected integer, neutralized integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_projected integer := 0;
  v_neutralized integer := 0;
begin
  if p_connection_id is null then
    raise exception 'Everflow connection is required.' using errcode='22023';
  end if;

  if not exists (
    select 1
    from public.commerce_provider_connections c
    where c.id = p_connection_id
      and c.provider = 'everflow'
      and c.status = 'connected'
  ) then
    raise exception 'Everflow connection is unavailable.' using errcode='22023';
  end if;

  -- Project approved payout baselines that became eligible after order reconciliation.
  -- Pending/rejected conversions intentionally do not create an active affiliate cost.
  with desired as materialized (
    select
      e.account_id,
      e.organization_id,
      e.connection_id,
      e.provider_account_id,
      e.source_identity,
      e.conversion_id,
      e.transaction_id,
      e.conversion_at,
      e.event_name,
      e.is_event,
      lower(coalesce(e.status,'')) as status,
      e.payout,
      upper(coalesce(e.currency, po.currency)) as currency,
      e.payload_hash,
      m.id as source_mapping_id,
      r.matched_canonical_order_id as canonical_order_id,
      po.workspace_id,
      coalesce(po.order_id, po.platform_order_id) as order_id,
      po.platform,
      case
        when exists (
          select 1
          from public.conversions b
          where b.organization_id = e.organization_id
            and b.connection_id = e.connection_id
            and b.provider_account_id = e.provider_account_id
            and b.event_source = 'everflow'
            and b.ledger_type = 'affiliate_payout'
            and b.idempotency_key = 'everflow:affiliate_payout:baseline:' || e.source_identity
        )
          then 'everflow:affiliate_payout:linkage_baseline:' || e.source_identity || ':' || r.matched_canonical_order_id::text
        else 'everflow:affiliate_payout:baseline:' || e.source_identity
      end as idempotency_key
    from public.everflow_conversion_events e
    join public.everflow_order_reconciliations r
      on r.event_id = e.id
     and r.algorithm_version = 'deterministic_order_v4'
     and r.matched_canonical_order_id is not null
    join public.commerce_source_mappings m
      on m.connection_id = e.connection_id
     and m.provider_account_id = e.provider_account_id
     and m.source_object_type = 'everflow_conversion'
     and m.source_object_id = e.source_identity
     and m.canonical_object_type = 'order'
     and m.canonical_object_id = r.matched_canonical_order_id
    join lateral (
      select p.workspace_id,p.order_id,p.platform_order_id,p.platform,p.currency
      from public.platform_orders p
      where p.organization_id = e.organization_id
        and p.canonical_order_id = r.matched_canonical_order_id
      order by p.order_ts asc nulls last
      limit 1
    ) po on true
    where e.connection_id = p_connection_id
      and lower(coalesce(e.status,'')) = 'approved'
      and coalesce(e.payout,0) <> 0
  ), inserted as (
    insert into public.conversions(
      id,account_id,organization_id,connection_id,provider_account_id,source_mapping_id,evidence_id,
      canonical_order_id,tkid,email,phone,click_ids,network,source_system,transaction_id,order_id,
      external_id,status,amount,currency,offer_id,campaign_id,affiliate_id,sub1,sub2,sub3,sub4,sub5,
      meta,ts,site_key,ledger_type,parent_transaction_id,platform,workspace_id,reason,raw,occurred_at,
      received_at,cost_category,fee_type,event_source,ingestion_method,connector_id,processor_account_id,
      source_event_id,dispute_id,source_amount,source_direction,diagnostic_flags,idempotency_key,
      reconciliation_state,data_quality_state
    )
    select
      gen_random_uuid(),d.account_id,d.organization_id,d.connection_id,d.provider_account_id,
      d.source_mapping_id,null,d.canonical_order_id,null,null,null,'{}'::jsonb,'everflow','everflow',
      d.transaction_id,d.order_id,d.conversion_id,d.status,-d.payout,d.currency,null,null,null,
      null,null,null,null,null,
      jsonb_build_object('everflow',jsonb_build_object(
        'sourceIdentity',d.source_identity,
        'conversionId',d.conversion_id,
        'eventName',d.event_name,
        'isEvent',d.is_event,
        'transitionType','linkage_reconciliation_baseline',
        'payloadHash',d.payload_hash,
        'stateHistoryId',null
      )),
      d.conversion_at,null,'affiliate_payout',null,d.platform,d.workspace_id,
      'Everflow affiliate payout reconciled after order linkage',null,d.conversion_at,clock_timestamp(),
      'affiliate_payout',null,'everflow','reconciliation',d.connection_id,null,d.source_identity,null,
      d.payout,'cost','{}'::jsonb,d.idempotency_key,'reconciled','verified'
    from desired d
    where not exists (
      select 1
      from public.conversions c
      where c.organization_id = d.organization_id
        and c.connection_id = d.connection_id
        and c.provider_account_id = d.provider_account_id
        and c.idempotency_key = d.idempotency_key
    )
    on conflict(organization_id,connection_id,provider_account_id,idempotency_key) do nothing
    returning 1
  )
  select count(*)::integer into v_projected from inserted;

  -- Append a compensating entry when previously projected payout cost is no longer
  -- supported by the current v4 order linkage. This preserves append-only history.
  with source_order_net as materialized (
    select
      c.organization_id,
      c.connection_id,
      c.provider_account_id,
      c.canonical_order_id,
      c.meta->'everflow'->>'sourceIdentity' as source_identity,
      sum(c.amount) as net_amount
    from public.conversions c
    where c.connection_id = p_connection_id
      and c.event_source = 'everflow'
      and c.ledger_type = 'affiliate_payout'
      and nullif(c.meta->'everflow'->>'sourceIdentity','') is not null
      and c.canonical_order_id is not null
    group by c.organization_id,c.connection_id,c.provider_account_id,c.canonical_order_id,
             c.meta->'everflow'->>'sourceIdentity'
    having abs(sum(c.amount)) > 0.0001
  ), stale as materialized (
    select n.*,
      e.account_id,e.conversion_id,e.transaction_id,e.event_name,e.is_event,
      lower(coalesce(e.status,'')) as status,e.currency,e.payload_hash,e.conversion_at,
      old.source_mapping_id,old.order_id,old.platform,old.workspace_id
    from source_order_net n
    join public.everflow_conversion_events e
      on e.connection_id = n.connection_id
     and e.provider_account_id = n.provider_account_id
     and e.source_identity = n.source_identity
    join lateral (
      select c.source_mapping_id,c.order_id,c.platform,c.workspace_id
      from public.conversions c
      where c.connection_id = n.connection_id
        and c.provider_account_id = n.provider_account_id
        and c.event_source = 'everflow'
        and c.ledger_type = 'affiliate_payout'
        and c.canonical_order_id = n.canonical_order_id
        and c.meta->'everflow'->>'sourceIdentity' = n.source_identity
      order by c.created_at asc
      limit 1
    ) old on true
    left join public.everflow_order_reconciliations r
      on r.event_id = e.id
     and r.algorithm_version = 'deterministic_order_v4'
    where r.matched_canonical_order_id is null
       or r.matched_canonical_order_id is distinct from n.canonical_order_id
  ), adjusted as (
    insert into public.conversions(
      id,account_id,organization_id,connection_id,provider_account_id,source_mapping_id,evidence_id,
      canonical_order_id,tkid,email,phone,click_ids,network,source_system,transaction_id,order_id,
      external_id,status,amount,currency,offer_id,campaign_id,affiliate_id,sub1,sub2,sub3,sub4,sub5,
      meta,ts,site_key,ledger_type,parent_transaction_id,platform,workspace_id,reason,raw,occurred_at,
      received_at,cost_category,fee_type,event_source,ingestion_method,connector_id,processor_account_id,
      source_event_id,dispute_id,source_amount,source_direction,diagnostic_flags,idempotency_key,
      reconciliation_state,data_quality_state
    )
    select
      gen_random_uuid(),s.account_id,s.organization_id,s.connection_id,s.provider_account_id,
      s.source_mapping_id,null,s.canonical_order_id,null,null,null,'{}'::jsonb,'everflow','everflow',
      s.transaction_id,s.order_id,s.conversion_id,s.status,-s.net_amount,
      upper(s.currency),null,null,null,null,null,null,null,null,
      jsonb_build_object('everflow',jsonb_build_object(
        'sourceIdentity',s.source_identity,
        'conversionId',s.conversion_id,
        'eventName',s.event_name,
        'isEvent',s.is_event,
        'transitionType','linkage_reconciliation_neutralization',
        'payloadHash',s.payload_hash,
        'stateHistoryId',null
      )),
      clock_timestamp(),null,'affiliate_payout',null,s.platform,s.workspace_id,
      'Everflow affiliate payout neutralized after order linkage changed',null,clock_timestamp(),
      clock_timestamp(),'affiliate_payout',null,'everflow','reconciliation',s.connection_id,null,
      'linkage-neutralization:' || s.source_identity || ':' || s.canonical_order_id::text,null,
      s.net_amount,'cost','{}'::jsonb,
      'everflow:affiliate_payout:linkage_neutralization:' || s.source_identity || ':' || s.canonical_order_id::text || ':' || replace(round(s.net_amount::numeric,4)::text,'.','_'),
      'reconciled','verified'
    from stale s
    where not exists (
      select 1
      from public.conversions c
      where c.organization_id = s.organization_id
        and c.connection_id = s.connection_id
        and c.provider_account_id = s.provider_account_id
        and c.idempotency_key = 'everflow:affiliate_payout:linkage_neutralization:' || s.source_identity || ':' || s.canonical_order_id::text || ':' || replace(round(s.net_amount::numeric,4)::text,'.','_')
    )
    on conflict(organization_id,connection_id,provider_account_id,idempotency_key) do nothing
    returning 1
  )
  select count(*)::integer into v_neutralized from adjusted;

  return query select v_projected,v_neutralized;
end;
$$;

revoke all on function public.reconcile_everflow_financial_projection_v1(uuid) from public;
grant execute on function public.reconcile_everflow_financial_projection_v1(uuid) to service_role;

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
    perform public.reconcile_everflow_financial_projection_v1(v_connection.id);
  end loop;
end;
$$;

revoke all on function public.run_everflow_order_reconciliation_sweep_v4(integer,integer) from public;
grant execute on function public.run_everflow_order_reconciliation_sweep_v4(integer,integer) to service_role;

commit;
