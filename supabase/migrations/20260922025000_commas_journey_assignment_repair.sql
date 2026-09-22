begin;

create or replace function public.repair_unassigned_commas_provider_purchase_journeys_v1(p_dry_run boolean default true)
returns table(eligible_events integer,people integer,journeys_created integer,events_assigned integer,already_assigned integer,failed integer)
language plpgsql security invoker set search_path=public,pg_temp as $$
declare r record; v_eligible int:=0;v_people int:=0;v_created int:=0;v_assigned int:=0;v_existing int:=0;v_failed int:=0;v_journey uuid;
begin
  select count(*),count(distinct j.person_id) into v_eligible,v_people
  from public.journey_events j
  join public.commerce_provider_attribution_observations o
    on o.organization_id::text=j.workspace_id and o.provider_event_id=j.source_record_id
   and o.provider='commas' and o.provider_event_type='product.purchased'
   and o.match_state='exact' and o.everflow_comparison_state='exact_match'
   and o.alias_state in ('all_agree','single_alias')
  where j.source_platform='commas' and j.source_connector='commas_provider_observed_checkout'
    and j.event_type='purchase' and j.person_id is not null and j.journey_id is null;

  select count(*) into v_existing from public.journey_events j
  join public.commerce_provider_attribution_observations o
    on o.organization_id::text=j.workspace_id and o.provider_event_id=j.source_record_id
   and o.provider='commas' and o.provider_event_type='product.purchased'
   and o.match_state='exact' and o.everflow_comparison_state='exact_match'
   and o.alias_state in ('all_agree','single_alias')
  where j.source_platform='commas' and j.source_connector='commas_provider_observed_checkout'
    and j.event_type='purchase' and j.person_id is not null and j.journey_id is not null;

  if p_dry_run then return query select v_eligible,v_people,0,0,v_existing,0; return; end if;

  for r in
    select j.* from public.journey_events j
    join public.commerce_provider_attribution_observations o
      on o.organization_id::text=j.workspace_id and o.provider_event_id=j.source_record_id
     and o.provider='commas' and o.provider_event_type='product.purchased'
     and o.match_state='exact' and o.everflow_comparison_state='exact_match'
     and o.alias_state in ('all_agree','single_alias')
    where j.source_platform='commas' and j.source_connector='commas_provider_observed_checkout'
      and j.event_type='purchase' and j.person_id is not null and j.journey_id is null
    order by j.workspace_id,j.person_id,j.event_time,j.id
    for update of j
  loop
    begin
      select x.journey_id into v_journey from public.journey_events x
       where x.workspace_id=r.workspace_id and x.person_id=r.person_id and x.journey_id is not null
         and x.event_time<=r.event_time and x.event_time>=r.event_time-interval '30 minutes'
       order by x.event_time desc,x.id desc limit 1;
      if v_journey is null then
        insert into public.journeys(workspace_id,person_id,started_at,ended_at,status,event_count,purchase_count,conversion_count,total_revenue,is_active,boundary_version,boundary_timeout_seconds,metadata)
        values(r.workspace_id,r.person_id,r.event_time,r.event_time,'converted',1,1,1,coalesce(r.amount,0),false,'v1',1800,jsonb_build_object('repair_version','commas-provider-purchase-v1','provenance','deterministic_provider_observed_checkout'))
        returning id into v_journey;
        v_created:=v_created+1;
      end if;
      update public.journey_events set journey_id=v_journey,updated_at=now() where id=r.id and journey_id is null;
      if found then v_assigned:=v_assigned+1; end if;
      v_journey:=null;
    exception when others then
      v_failed:=v_failed+1; v_journey:=null;
    end;
  end loop;
  return query select v_eligible,v_people,v_created,v_assigned,v_existing,v_failed;
end $$;

revoke all on function public.repair_unassigned_commas_provider_purchase_journeys_v1(boolean) from public,anon,authenticated,authenticator;
grant execute on function public.repair_unassigned_commas_provider_purchase_journeys_v1(boolean) to service_role;
comment on function public.repair_unassigned_commas_provider_purchase_journeys_v1(boolean) is 'Repairs only exact provider-observed Commas purchase events already resolved to a person and exact Everflow identity. Dry-run by default. Creates/uses a Journey only for that same person; no cross-person or attribution heuristic matching.';

commit;