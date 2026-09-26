begin;

create or replace function public.backfill_commas_exact_everflow_acquisition_batch_v1(p_limit integer default 20,p_dry_run boolean default true)
returns table(eligible_tids integer,selected_tids integer,inserted integer,remaining_tids integer)
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_eligible int:=0;v_selected int:=0;v_inserted int:=0;v_remaining int:=0;
begin
 if p_limit<1 or p_limit>25 then raise exception 'p_limit must be between 1 and 25'; end if;
 create temporary table if not exists pg_temp.commas_ef_batch(organization_id uuid,tid text,person_id uuid,journey_id uuid,click_id uuid primary key) on commit drop;
 truncate pg_temp.commas_ef_batch;

 with exact as (
  select distinct o.organization_id,o.provider_event_id,o.person_id,coalesce(o.ef_transaction_id,o.transaction_id,o.tid,o.c1) tid
  from public.commerce_provider_attribution_observations o
  where o.provider='commas' and o.provider_event_type='product.purchased' and o.match_state='exact'
    and o.everflow_comparison_state='exact_match' and o.alias_state in ('all_agree','single_alias') and o.person_id is not null
 ), resolved as (
  select e.organization_id,e.tid,e.person_id,min(j.journey_id::text)::uuid journey_id,count(distinct j.journey_id) journey_n
  from exact e join public.journey_events j on j.workspace_id=e.organization_id::text and j.person_id=e.person_id
   and j.source_platform='commas' and j.source_connector='commas_provider_observed_checkout'
   and j.source_record_id=e.provider_event_id and j.event_type='purchase' and j.journey_id is not null
  where e.tid is not null group by 1,2,3
 ), clicks as (
  select organization_id,transaction_id,min(id::text)::uuid click_id,count(*) n
  from public.everflow_click_events group by 1,2
 ), eligible as (
  select r.organization_id,r.tid,r.person_id,r.journey_id,c.click_id
  from resolved r join clicks c on c.organization_id=r.organization_id and c.transaction_id=r.tid and c.n=1
  where r.journey_n=1 and not exists(
   select 1 from public.journey_events j where j.workspace_id=r.organization_id::text
    and j.source_platform='everflow' and j.source_connector='everflow_firehose_acquisition_projection'
    and j.source_record_id=c.click_id::text and j.event_type='click'
  )
 )
 select count(*) into v_eligible from eligible;

 insert into pg_temp.commas_ef_batch
 with exact as (
  select distinct o.organization_id,o.provider_event_id,o.person_id,coalesce(o.ef_transaction_id,o.transaction_id,o.tid,o.c1) tid
  from public.commerce_provider_attribution_observations o
  where o.provider='commas' and o.provider_event_type='product.purchased' and o.match_state='exact'
    and o.everflow_comparison_state='exact_match' and o.alias_state in ('all_agree','single_alias') and o.person_id is not null
 ), resolved as (
  select e.organization_id,e.tid,e.person_id,min(j.journey_id::text)::uuid journey_id,count(distinct j.journey_id) journey_n
  from exact e join public.journey_events j on j.workspace_id=e.organization_id::text and j.person_id=e.person_id
   and j.source_platform='commas' and j.source_connector='commas_provider_observed_checkout'
   and j.source_record_id=e.provider_event_id and j.event_type='purchase' and j.journey_id is not null
  where e.tid is not null group by 1,2,3
 ), clicks as (
  select organization_id,transaction_id,min(id::text)::uuid click_id,count(*) n from public.everflow_click_events group by 1,2
 )
 select r.organization_id,r.tid,r.person_id,r.journey_id,c.click_id
 from resolved r join clicks c on c.organization_id=r.organization_id and c.transaction_id=r.tid and c.n=1
 where r.journey_n=1 and not exists(select 1 from public.journey_events j where j.workspace_id=r.organization_id::text and j.source_platform='everflow' and j.source_connector='everflow_firehose_acquisition_projection' and j.source_record_id=c.click_id::text and j.event_type='click')
 order by r.organization_id,r.tid limit p_limit;
 get diagnostics v_selected=row_count;

 if not p_dry_run then
  insert into public.journey_events(workspace_id,person_id,journey_id,session_id,event_type,event_time,source_platform,source_connector,source_record_id,affiliate_id,offer_id,source,sub1,sub2,sub3,sub4,sub5,transaction_id,metadata)
  select b.organization_id::text,b.person_id,b.journey_id,c.session_id,'click',c.click_at,'everflow','everflow_firehose_acquisition_projection',c.id::text,c.affiliate_id,c.offer_id,c.source_id,c.sub1,c.sub2,c.sub3,c.sub4,c.sub5,c.transaction_id,
   jsonb_build_object('provenance','everflow_click_event','relationship','deterministic_provider_observed_exact_match','backfill_version','commas-exact-everflow-batch-v1','query_parameters',coalesce(c.query_parameters,'{}'::jsonb))
  from pg_temp.commas_ef_batch b join public.everflow_click_events c on c.id=b.click_id
  on conflict(workspace_id,source_platform,source_connector,source_record_id,event_type) do nothing;
  get diagnostics v_inserted=row_count;
 end if;
 v_remaining:=greatest(v_eligible-case when p_dry_run then 0 else v_inserted end,0);
 return query select v_eligible,v_selected,v_inserted,v_remaining;
end $$;

revoke all on function public.backfill_commas_exact_everflow_acquisition_batch_v1(integer,boolean) from public,anon,authenticated,authenticator;
grant execute on function public.backfill_commas_exact_everflow_acquisition_batch_v1(integer,boolean) to service_role;
comment on function public.backfill_commas_exact_everflow_acquisition_batch_v1(integer,boolean) is 'Bounded idempotent Commas exact Everflow acquisition projection. Max 25 TIDs per invocation; exact provider evidence + one Journey + one click only; dry-run by default.';
commit;