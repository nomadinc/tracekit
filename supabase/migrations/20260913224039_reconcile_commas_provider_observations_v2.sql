-- Reconcile only derived Commas purchase observations. Raw Evidence and delivery
-- rows remain immutable; this function has no attribution-credit write surface.
create or replace function public.mark_commas_provider_observation_normalizer_v2()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if new.provider='commas' and new.provider_event_type='product.purchased'
     and exists(select 1 from public.commerce_evidence_records e where e.id=new.evidence_id
       and e.organization_id=new.organization_id and e.connection_id=new.connection_id
       and e.provider_account_id=new.provider_account_id
       and e.normalizer_version='commas-provider-attribution-v2') then
    new.normalizer_version:='commas-provider-attribution-v2';
    new.reconciliation_version:='commas-ord-exact-v2';
  end if;
  return new;
end $$;
create trigger mark_commas_provider_observation_normalizer_v2
before insert on public.commerce_provider_attribution_observations
for each row execute function public.mark_commas_provider_observation_normalizer_v2();
revoke all on function public.mark_commas_provider_observation_normalizer_v2() from public,anon,authenticated;

create or replace function public.reconcile_commas_provider_observation_v2(
  p_observation_id uuid,
  p_evidence_payload_hash text,
  p_provider_event_id text,
  p_payment_public_transaction_id text,
  p_parameters jsonb default null,
  p_everflow_comparison jsonb default null
) returns table(match_state text, journey_created boolean, parameters_updated boolean)
language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_observation public.commerce_provider_attribution_observations%rowtype;
  v_order public.platform_orders%rowtype;
  v_count integer;
  v_match text := 'unmatched';
  v_params jsonb;
  v_comparison jsonb;
  v_journey_created boolean := false;
begin
  select * into v_observation from public.commerce_provider_attribution_observations o
  where o.id=p_observation_id and o.provider='commas' and o.provider_event_type='product.purchased'
  for update;
  if not found or v_observation.provider_event_id is distinct from p_provider_event_id
     or v_observation.payment_public_transaction_id is distinct from p_payment_public_transaction_id
     or v_observation.payload_hash is distinct from p_evidence_payload_hash
     or v_observation.payload_conflict then
    raise exception 'Commas observation identity conflict' using errcode='42501';
  end if;
  if not exists(select 1 from public.commerce_evidence_records e
    where e.id=v_observation.evidence_id and e.organization_id=v_observation.organization_id
      and e.connection_id=v_observation.connection_id and e.provider_account_id=v_observation.provider_account_id
      and e.payload_hash=p_evidence_payload_hash and e.source_object_type='commas_attribution_webhook'
      and e.pii_classification='restricted' and e.deleted_at is null) then
    raise exception 'Commas immutable Evidence unavailable' using errcode='42501';
  end if;
  if p_parameters is not null then
    if v_observation.normalizer_version <> 'commas-provider-attribution-v1'
       or jsonb_typeof(p_parameters)<>'object' or length(p_parameters::text)>16384
       or p_parameters->>'alias_state' not in ('all_agree','single_alias','conflict','none')
       or jsonb_typeof(coalesce(p_parameters->'restricted_metadata','{}'::jsonb))<>'object'
       or p_everflow_comparison->>'state' not in ('exact_match','partial_match','conflict','no_everflow_record','no_commas_tid') then
      raise exception 'Commas Evidence replay contract rejected' using errcode='42501';
    end if;
    v_params:=p_parameters;
    v_comparison:=p_everflow_comparison;
  else
    if v_observation.normalizer_version <> 'commas-provider-attribution-v2' then
      raise exception 'Commas observation requires Evidence replay' using errcode='42501';
    end if;
    v_params:=jsonb_build_object('affiliate_id',v_observation.affiliate_id,'sub1',v_observation.sub1,
      'sub4',v_observation.sub4,'ef_transaction_id',v_observation.ef_transaction_id,
      'transaction_id',v_observation.transaction_id,'tid',v_observation.tid,'c1',v_observation.c1,
      'alias_state',v_observation.alias_state,'restricted_metadata',v_observation.restricted_metadata);
    v_comparison:=jsonb_build_object('state',v_observation.everflow_comparison_state);
  end if;
  if p_payment_public_transaction_id !~ '^ORD-[A-Za-z0-9_-]{1,120}$' then
    v_match:='malformed';
  else
    select count(*) into v_count from public.commerce_source_mappings m
    where m.organization_id=v_observation.organization_id and m.connection_id=v_observation.connection_id
      and m.provider_account_id=v_observation.provider_account_id and m.source_object_type='commas_public_transaction'
      and m.source_object_id=p_payment_public_transaction_id and m.canonical_object_type='order' and m.state='active';
    if v_count=1 then
      select po.* into v_order from public.commerce_source_mappings m
      join public.platform_orders po on po.organization_id=m.organization_id and po.canonical_order_id=m.canonical_object_id
      where m.organization_id=v_observation.organization_id and m.connection_id=v_observation.connection_id
        and m.provider_account_id=v_observation.provider_account_id and m.source_object_type='commas_public_transaction'
        and m.source_object_id=p_payment_public_transaction_id and m.canonical_object_type='order' and m.state='active';
      if not found then raise exception 'Commas ORD mapping has no canonical order' using errcode='23503'; end if;
      v_match:='exact';
    elsif v_count>1 then v_match:='ambiguous'; end if;
  end if;
  update public.commerce_provider_attribution_observations o set
    affiliate_id=nullif(v_params->>'affiliate_id',''),sub1=nullif(v_params->>'sub1',''),sub4=nullif(v_params->>'sub4',''),
    ef_transaction_id=nullif(v_params->>'ef_transaction_id',''),transaction_id=nullif(v_params->>'transaction_id',''),
    tid=nullif(v_params->>'tid',''),c1=nullif(v_params->>'c1',''),alias_state=v_params->>'alias_state',
    restricted_metadata=coalesce(v_params->'restricted_metadata','{}'::jsonb),
    everflow_comparison_state=v_comparison->>'state',
    normalizer_version='commas-provider-attribution-v2',reconciliation_version='commas-ord-exact-v2',
    match_state=v_match,match_method=case when v_match='exact' then 'commas_public_transaction' else 'none' end,
    platform_order_id=case when v_match='exact' then v_order.platform_order_id end,
    canonical_order_id=case when v_match='exact' then v_order.canonical_order_id end,
    person_id=case when v_match='exact' then v_order.person_id end,updated_at=now()
  where o.id=v_observation.id;
  if v_match='exact' then
    insert into public.journey_events(workspace_id,person_id,platform_order_id,event_type,event_time,
      source_platform,source_connector,source_record_id,affiliate_id,sub1,sub4,transaction_id,metadata)
    values(v_observation.organization_id::text,v_order.person_id,v_order.platform_order_id,'purchase',
      coalesce(v_observation.first_observed_at,v_order.order_ts,now()),'commas','commas_provider_observed_checkout',
      v_observation.provider_event_id,nullif(v_params->>'affiliate_id',''),nullif(v_params->>'sub1',''),
      nullif(v_params->>'sub4',''),case when v_params->>'alias_state'<>'conflict' then
        coalesce(nullif(v_params->>'ef_transaction_id',''),nullif(v_params->>'transaction_id',''),
          nullif(v_params->>'tid',''),nullif(v_params->>'c1','')) end,
      jsonb_build_object('provenance','provider_observed_checkout','provider','commas',
        'evidence_id',v_observation.evidence_id,'observation_id',v_observation.id,
        'everflow_comparison',v_comparison))
    on conflict(workspace_id,source_platform,source_connector,source_record_id,event_type) do nothing;
    get diagnostics v_count=row_count;
    v_journey_created:=v_count=1;
  end if;
  return query select v_match,v_journey_created,p_parameters is not null;
end $$;

create or replace function public.reconcile_commas_provider_observations_after_ord_v2(
  p_organization_id uuid,p_connection_id uuid,p_provider_account_id uuid,p_limit integer default 100
) returns table(observations_scanned integer,exact_matches integer,journey_events_created integer)
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_row record; v_result record; v_scanned integer:=0;v_exact integer:=0;v_journey integer:=0;
begin
  if p_limit<1 or p_limit>500 then raise exception 'Commas reconciliation limit invalid' using errcode='22023'; end if;
  for v_row in select o.id,o.payload_hash,o.provider_event_id,o.payment_public_transaction_id
    from public.commerce_provider_attribution_observations o
    where o.organization_id=p_organization_id and o.connection_id=p_connection_id
      and o.provider_account_id=p_provider_account_id and o.provider='commas'
      and o.provider_event_type='product.purchased' and o.normalizer_version='commas-provider-attribution-v2'
      and o.match_state<>'exact' and exists(select 1 from public.commerce_source_mappings m
        where m.organization_id=o.organization_id and m.connection_id=o.connection_id
          and m.provider_account_id=o.provider_account_id and m.source_object_type='commas_public_transaction'
          and m.source_object_id=o.payment_public_transaction_id and m.canonical_object_type='order' and m.state='active')
    order by o.created_at,o.id limit p_limit
  loop
    select * into v_result from public.reconcile_commas_provider_observation_v2(
      v_row.id,v_row.payload_hash,v_row.provider_event_id,v_row.payment_public_transaction_id,null,null);
    v_scanned:=v_scanned+1;
    if v_result.match_state='exact' then v_exact:=v_exact+1; end if;
    if v_result.journey_created then v_journey:=v_journey+1; end if;
  end loop;
  return query select v_scanned,v_exact,v_journey;
end $$;

revoke all on function public.reconcile_commas_provider_observation_v2(uuid,text,text,text,jsonb,jsonb)
  from public,anon,authenticated;
revoke all on function public.reconcile_commas_provider_observations_after_ord_v2(uuid,uuid,uuid,integer)
  from public,anon,authenticated;
grant execute on function public.reconcile_commas_provider_observation_v2(uuid,text,text,text,jsonb,jsonb)
  to service_role;
grant execute on function public.reconcile_commas_provider_observations_after_ord_v2(uuid,uuid,uuid,integer)
  to service_role;
