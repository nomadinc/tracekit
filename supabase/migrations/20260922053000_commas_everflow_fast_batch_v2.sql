begin;
create or replace function public.backfill_commas_exact_everflow_acquisition_batch_v2(p_limit integer default 20,p_dry_run boolean default true)
returns table(selected_tids integer,inserted integer,has_more boolean)
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_selected int:=0;v_inserted int:=0;v_has_more boolean:=false;
begin
 if p_limit<1 or p_limit>25 then raise exception 'p_limit must be between 1 and 25'; end if;
 create temporary table if not exists pg_temp.commas_ef_fast_batch(organization_id uuid,tid text,person_id uuid,journey_id uuid,click_id uuid primary key) on commit drop;
 truncate pg_temp.commas_ef_fast_batch;
 insert into pg_temp.commas_ef_fast_batch
 select distinct on (o.organization_id,coalesce(o.ef_transaction_id,o.transaction_id,o.tid,o.c1))
   o.organization_id,coalesce(o.ef_transaction_id,o.transaction_id,o.tid,o.c1),o.person_id,j.journey_id,c.id
 from public.commerce_provider_attribution_observations o
 join public.journey_events j on j.workspace_id=o.organization_id::text and j.person_id=o.person_id
  and j.source_platform='commas' and j.source_connector='commas_provider_observed_checkout'
  and j.source_record_id=o.provider_event_id and j.event_type='purchase' and j.journey_id is not null
 join public.everflow_click_events c on c.organization_id=o.organization_id
  and c.transaction_id=coalesce(o.ef_transaction_id,o.transaction_id,o.tid,o.c1)
 where o.provider='commas' and o.provider_event_type='product.purchased' and o.match_state='exact'
  and o.everflow_comparison_state='exact_match' and o.alias_state in ('all_agree','single_alias') and o.person_id is not null
  and not exists(select 1 from public.everflow_click_events c2 where c2.organization_id=c.organization_id and c2.transaction_id=c.transaction_id and c2.id<>c.id)
  and not exists(select 1 from public.journey_events x where x.workspace_id=o.organization_id::text and x.source_platform='everflow'
   and x.source_connector='everflow_firehose_acquisition_projection' and x.source_record_id=c.id::text and x.event_type='click')
  and not exists(select 1 from public.journey_events j2 where j2.workspace_id=o.organization_id::text and j2.person_id=o.person_id
   and j2.source_platform='commas' and j2.source_connector='commas_provider_observed_checkout' and j2.transaction_id=coalesce(o.ef_transaction_id,o.transaction_id,o.tid,o.c1)
   and j2.journey_id is not null and j2.journey_id<>j.journey_id)
 order by o.organization_id,coalesce(o.ef_transaction_id,o.transaction_id,o.tid,o.c1),o.provider_event_id
 limit p_limit+1;
 select count(*)>p_limit into v_has_more from pg_temp.commas_ef_fast_batch;
 delete from pg_temp.commas_ef_fast_batch where click_id in (select click_id from pg_temp.commas_ef_fast_batch order by organization_id,tid offset p_limit);
 get diagnostics v_selected=row_count;
 v_selected:=(select count(*) from pg_temp.commas_ef_fast_batch);
 if not p_dry_run then
  insert into public.journey_events(workspace_id,person_id,journey_id,session_id,event_type,event_time,source_platform,source_connector,source_record_id,affiliate_id,offer_id,source,sub1,sub2,sub3,sub4,sub5,transaction_id,metadata)
  select b.organization_id::text,b.person_id,b.journey_id,c.session_id,'click',c.click_at,'everflow','everflow_firehose_acquisition_projection',c.id::text,c.affiliate_id,c.offer_id,c.source_id,c.sub1,c.sub2,c.sub3,c.sub4,c.sub5,c.transaction_id,
   jsonb_build_object('provenance','everflow_click_event','relationship','deterministic_provider_observed_exact_match','backfill_version','commas-exact-everflow-fast-batch-v2','query_parameters',coalesce(c.query_parameters,'{}'::jsonb))
  from pg_temp.commas_ef_fast_batch b join public.everflow_click_events c on c.id=b.click_id
  on conflict(workspace_id,source_platform,source_connector,source_record_id,event_type) do nothing;
  get diagnostics v_inserted=row_count;
 end if;
 return query select v_selected,v_inserted,v_has_more;
end $$;
revoke all on function public.backfill_commas_exact_everflow_acquisition_batch_v2(integer,boolean) from public,anon,authenticated,authenticator;
grant execute on function public.backfill_commas_exact_everflow_acquisition_batch_v2(integer,boolean) to service_role;
comment on function public.backfill_commas_exact_everflow_acquisition_batch_v2(integer,boolean) is 'Fast bounded exact Commas→Everflow projection. Selects only limit+1 unprojected TIDs, preserves unique-click/single-Journey/idempotency gates, and avoids full-cohort counts.';
commit;