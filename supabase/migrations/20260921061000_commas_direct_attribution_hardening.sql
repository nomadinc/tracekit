begin;

create or replace function public.backfill_commas_exact_everflow_acquisition_v1(p_dry_run boolean default true)
returns table(candidates integer,unique_clicks integer,journey_resolved integer,already_projected integer,inserted integer,unresolved integer)
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_candidates int:=0;v_unique int:=0;v_journey int:=0;v_existing int:=0;v_inserted int:=0;v_unresolved int:=0;
begin
  with exact as (
    select distinct o.organization_id,o.provider_event_id,o.person_id,
      coalesce(o.ef_transaction_id,o.transaction_id,o.tid,o.c1) tid
    from public.commerce_provider_attribution_observations o
    where o.provider='commas' and o.provider_event_type='product.purchased'
      and o.match_state='exact' and o.everflow_comparison_state='exact_match'
      and o.alias_state in ('all_agree','single_alias') and o.person_id is not null
  ) select count(*) into v_candidates from exact where tid is not null;

  with exact as (
    select distinct o.organization_id,o.provider_event_id,o.person_id,coalesce(o.ef_transaction_id,o.transaction_id,o.tid,o.c1) tid
    from public.commerce_provider_attribution_observations o where o.provider='commas' and o.provider_event_type='product.purchased' and o.match_state='exact' and o.everflow_comparison_state='exact_match' and o.alias_state in ('all_agree','single_alias') and o.person_id is not null
  ), clicks as (
    select organization_id,transaction_id,min(id::text)::uuid id,count(*) n from public.everflow_click_events group by organization_id,transaction_id
  ) select count(*) into v_unique from exact e join clicks c on c.organization_id=e.organization_id and c.transaction_id=e.tid and c.n=1;

  with exact as (
    select distinct o.organization_id,o.provider_event_id,o.person_id,coalesce(o.ef_transaction_id,o.transaction_id,o.tid,o.c1) tid
    from public.commerce_provider_attribution_observations o where o.provider='commas' and o.provider_event_type='product.purchased' and o.match_state='exact' and o.everflow_comparison_state='exact_match' and o.alias_state in ('all_agree','single_alias') and o.person_id is not null
  ), resolved as (
    select e.*,min(j.journey_id::text)::uuid journey_id,count(distinct j.journey_id) n
    from exact e join public.journey_events j on j.workspace_id=e.organization_id::text and j.person_id=e.person_id and j.source_platform='commas' and j.source_connector='commas_provider_observed_checkout' and j.source_record_id=e.provider_event_id and j.event_type='purchase' and j.journey_id is not null
    group by e.organization_id,e.provider_event_id,e.person_id,e.tid
  ) select count(*) into v_journey from resolved where n=1 and tid is not null;

  with exact_tids as (
    select distinct coalesce(o.ef_transaction_id,o.transaction_id,o.tid,o.c1) tid
    from public.commerce_provider_attribution_observations o where o.provider='commas' and o.match_state='exact' and o.everflow_comparison_state='exact_match' and o.alias_state in ('all_agree','single_alias')
  ) select count(*) into v_existing from exact_tids e where e.tid is not null and exists(select 1 from public.journey_events j where j.source_connector='everflow_firehose_acquisition_projection' and j.transaction_id=e.tid);

  if not p_dry_run then
    with exact as (
      select distinct o.organization_id,o.provider_event_id,o.person_id,coalesce(o.ef_transaction_id,o.transaction_id,o.tid,o.c1) tid
      from public.commerce_provider_attribution_observations o where o.provider='commas' and o.provider_event_type='product.purchased' and o.match_state='exact' and o.everflow_comparison_state='exact_match' and o.alias_state in ('all_agree','single_alias') and o.person_id is not null
    ), resolved as (
      select e.*,min(j.journey_id::text)::uuid journey_id,count(distinct j.journey_id) journey_n
      from exact e join public.journey_events j on j.workspace_id=e.organization_id::text and j.person_id=e.person_id and j.source_platform='commas' and j.source_connector='commas_provider_observed_checkout' and j.source_record_id=e.provider_event_id and j.event_type='purchase' and j.journey_id is not null
      group by e.organization_id,e.provider_event_id,e.person_id,e.tid
    ), clicks as (
      select organization_id,transaction_id,min(id::text)::uuid id,count(*) n from public.everflow_click_events group by organization_id,transaction_id
    ), source as (
      select distinct on (r.organization_id,r.tid) r.organization_id,r.person_id,r.journey_id,c.id click_id
      from resolved r join clicks c on c.organization_id=r.organization_id and c.transaction_id=r.tid and c.n=1
      where r.journey_n=1 and r.tid is not null
      order by r.organization_id,r.tid,r.provider_event_id
    )
    insert into public.journey_events(workspace_id,person_id,journey_id,session_id,event_type,event_time,source_platform,source_connector,source_record_id,affiliate_id,offer_id,source,sub1,sub2,sub3,sub4,sub5,transaction_id,metadata)
    select s.organization_id::text,s.person_id,s.journey_id,c.session_id,'click',c.click_at,'everflow','everflow_firehose_acquisition_projection',c.id::text,c.affiliate_id,c.offer_id,c.source_id,c.sub1,c.sub2,c.sub3,c.sub4,c.sub5,c.transaction_id,
      jsonb_build_object('provenance','everflow_click_event','relationship','deterministic_provider_observed_exact_match','backfill_version','commas-exact-everflow-v1','query_parameters',coalesce(c.query_parameters,'{}'::jsonb))
    from source s join public.everflow_click_events c on c.id=s.click_id
    where not exists(select 1 from public.journey_events j where j.workspace_id=s.organization_id::text and j.source_platform='everflow' and j.source_connector='everflow_firehose_acquisition_projection' and j.source_record_id=c.id::text and j.event_type='click');
    get diagnostics v_inserted=row_count;
  end if;
  v_unresolved:=greatest(v_candidates-v_existing-v_inserted,0);
  return query select v_candidates,v_unique,v_journey,v_existing,v_inserted,v_unresolved;
end $$;

revoke all on function public.backfill_commas_exact_everflow_acquisition_v1(boolean) from public,anon,authenticated,authenticator;
grant execute on function public.backfill_commas_exact_everflow_acquisition_v1(boolean) to service_role;
comment on function public.backfill_commas_exact_everflow_acquisition_v1(boolean) is 'Backfills only deterministic Commas provider-observed exact Everflow relationships with one unique Everflow click and one already-assigned Commas purchase Journey. Never uses contact/time heuristics.';

alter table public.commerce_provider_attribution_observations add column if not exists tkid text;
comment on column public.commerce_provider_attribution_observations.tkid is 'Provider-observed TraceKit Journey identity from Commas checkout additional_params when prospectively supplied.';

commit;