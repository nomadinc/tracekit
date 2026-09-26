-- Generic, source-scoped bounded TKID proof enforcement.
-- Reservations are intentionally conservative: a failed persistence attempt
-- keeps its capacity reservation so concurrent workers can never overshoot.

alter table public.tkid_sources
  add column ingestion_state text not null default 'stopped',
  add column ingestion_state_changed_at timestamptz not null default now(),
  add column ingestion_state_reason text;

alter table public.tkid_sources
  add constraint tkid_sources_ingestion_state_check
  check (ingestion_state in ('enabled','stopped'));

create table public.tkid_proof_journey_claims (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_id uuid not null,
  origin_id uuid not null,
  bootstrap_key uuid not null,
  journey_id uuid not null,
  browser_session_id uuid not null,
  claimed_at timestamptz not null default now(),
  foreign key (organization_id,source_id) references public.tkid_sources(organization_id,id),
  foreign key (organization_id,origin_id) references public.tkid_source_origins(organization_id,id),
  unique (organization_id,source_id,bootstrap_key),
  unique (organization_id,source_id,journey_id)
);

create table public.tkid_proof_event_claims (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_id uuid not null,
  origin_id uuid not null,
  journey_id uuid not null,
  event_id uuid not null,
  claimed_at timestamptz not null default now(),
  foreign key (organization_id,source_id) references public.tkid_sources(organization_id,id),
  foreign key (organization_id,origin_id) references public.tkid_source_origins(organization_id,id),
  unique (organization_id,source_id,event_id)
);

create table public.tkid_proof_rejection_evidence (
  organization_id uuid not null,
  source_id uuid not null,
  origin_id uuid not null,
  reason text not null,
  claim_type text not null,
  rejected_count bigint not null default 1,
  first_rejected_at timestamptz not null,
  last_rejected_at timestamptz not null,
  primary key (organization_id,source_id,origin_id,reason,claim_type),
  foreign key (organization_id,source_id) references public.tkid_sources(organization_id,id),
  foreign key (organization_id,origin_id) references public.tkid_source_origins(organization_id,id),
  check (reason in ('proof_not_started','proof_expired','journey_budget_exhausted','event_budget_exhausted','proof_disabled','source_disabled','ingestion_stopped','unsupported_abuse_adapter','invalid_claim','abuse_control_unavailable','rate_limited','invalid_event','duplicate_event')),
  check (claim_type in ('bootstrap','event','request')),
  check (rejected_count > 0)
);

create index tkid_proof_journey_claims_scope_idx on public.tkid_proof_journey_claims(organization_id,source_id,origin_id,claimed_at);
create index tkid_proof_event_claims_scope_idx on public.tkid_proof_event_claims(organization_id,source_id,origin_id,claimed_at);
create index tkid_proof_rejection_scope_idx on public.tkid_proof_rejection_evidence(organization_id,source_id,origin_id,last_rejected_at desc);

alter table public.tkid_proof_journey_claims enable row level security;
alter table public.tkid_proof_event_claims enable row level security;
alter table public.tkid_proof_rejection_evidence enable row level security;
revoke all on public.tkid_proof_journey_claims,public.tkid_proof_event_claims,public.tkid_proof_rejection_evidence from public,anon,authenticated,authenticator;
grant select,insert,update on public.tkid_proof_journey_claims,public.tkid_proof_event_claims,public.tkid_proof_rejection_evidence to service_role;

create or replace function public.record_tkid_proof_rejection_v1(
  p_organization_id uuid,p_source_id uuid,p_origin_id uuid,p_reason text,p_claim_type text,p_now timestamptz
) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if p_reason not in ('proof_not_started','proof_expired','journey_budget_exhausted','event_budget_exhausted','proof_disabled','source_disabled','ingestion_stopped','unsupported_abuse_adapter','invalid_claim','abuse_control_unavailable','rate_limited','invalid_event','duplicate_event')
     or p_claim_type not in ('bootstrap','event','request') then
    raise exception 'invalid proof rejection classification' using errcode='22023';
  end if;
  insert into public.tkid_proof_rejection_evidence(organization_id,source_id,origin_id,reason,claim_type,rejected_count,first_rejected_at,last_rejected_at)
  values(p_organization_id,p_source_id,p_origin_id,p_reason,p_claim_type,1,p_now,p_now)
  on conflict(organization_id,source_id,origin_id,reason,claim_type)
  do update set rejected_count=public.tkid_proof_rejection_evidence.rejected_count+1,last_rejected_at=excluded.last_rejected_at;
end $$;

create or replace function public.claim_tkid_proof_capacity_v1(
  p_organization_id uuid,
  p_source_id uuid,
  p_origin_id uuid,
  p_claim_type text,
  p_journey_id uuid,
  p_browser_session_id uuid default null,
  p_bootstrap_key uuid default null,
  p_event_id uuid default null,
  p_now timestamptz default now()
) returns table(
  decision text,reused boolean,journey_id uuid,browser_session_id uuid,
  claimed_journeys bigint,claimed_events bigint,max_journeys integer,max_events integer,
  starts_at timestamptz,ends_at timestamptz,ingestion_state text
) language plpgsql security invoker set search_path=public,pg_temp as $$
declare s public.tkid_sources%rowtype; o public.tkid_source_origins%rowtype;
  j public.tkid_proof_journey_claims%rowtype; e public.tkid_proof_event_claims%rowtype;
  v_j bigint; v_e bigint; v_reason text;
begin
  if p_claim_type not in ('bootstrap','event') or p_journey_id is null then raise exception 'invalid proof claim' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||p_source_id::text,0));
  select src.* into s from public.tkid_sources src where src.organization_id=p_organization_id and src.id=p_source_id for update;
  select ori.* into o from public.tkid_source_origins ori where ori.organization_id=p_organization_id and ori.id=p_origin_id and ori.source_id=p_source_id for update;
  if not found or s.id is null or s.status not in ('shadow','active') or o.lifecycle_status<>'active' then
    return query select 'source_disabled',false,p_journey_id,p_browser_session_id,0::bigint,0::bigint,s.proof_max_journeys,s.proof_max_events,s.proof_starts_at,s.proof_ends_at,coalesce(s.ingestion_state,'stopped'); return;
  end if;
  if s.ingestion_state<>'enabled' then v_reason='ingestion_stopped';
  elsif s.abuse_adapter is distinct from 'supabase_fixed_window_v1' then v_reason='unsupported_abuse_adapter';
  elsif s.proof_max_journeys is null or s.proof_max_events is null or s.proof_starts_at is null or s.proof_ends_at is null then v_reason='proof_disabled';
  elsif p_now<s.proof_starts_at then v_reason='proof_not_started';
  elsif p_now>=s.proof_ends_at then v_reason='proof_expired';
  end if;
  select count(*) into v_j from public.tkid_proof_journey_claims jc where jc.organization_id=p_organization_id and jc.source_id=p_source_id and jc.origin_id=p_origin_id;
  select count(*) into v_e from public.tkid_proof_event_claims ec where ec.organization_id=p_organization_id and ec.source_id=p_source_id and ec.origin_id=p_origin_id;
  if v_reason is not null then
    perform public.record_tkid_proof_rejection_v1(p_organization_id,p_source_id,p_origin_id,v_reason,p_claim_type,p_now);
    return query select v_reason,false,p_journey_id,p_browser_session_id,v_j,v_e,s.proof_max_journeys,s.proof_max_events,s.proof_starts_at,s.proof_ends_at,s.ingestion_state; return;
  end if;
  if p_claim_type='bootstrap' then
    if p_bootstrap_key is null or p_browser_session_id is null then v_reason='invalid_claim';
    else
      select jc.* into j from public.tkid_proof_journey_claims jc where jc.organization_id=p_organization_id and jc.source_id=p_source_id and jc.bootstrap_key=p_bootstrap_key;
      if found then return query select 'accepted',true,j.journey_id,j.browser_session_id,v_j,v_e,s.proof_max_journeys,s.proof_max_events,s.proof_starts_at,s.proof_ends_at,s.ingestion_state; return; end if;
      select jc.* into j from public.tkid_proof_journey_claims jc where jc.organization_id=p_organization_id and jc.source_id=p_source_id and jc.journey_id=p_journey_id;
      if found then return query select 'accepted',true,j.journey_id,j.browser_session_id,v_j,v_e,s.proof_max_journeys,s.proof_max_events,s.proof_starts_at,s.proof_ends_at,s.ingestion_state; return; end if;
      if v_j>=s.proof_max_journeys then v_reason='journey_budget_exhausted';
      else
        insert into public.tkid_proof_journey_claims(organization_id,source_id,origin_id,bootstrap_key,journey_id,browser_session_id,claimed_at)
        values(p_organization_id,p_source_id,p_origin_id,p_bootstrap_key,p_journey_id,p_browser_session_id,p_now);
        v_j=v_j+1;
      end if;
    end if;
  else
    if p_event_id is null then v_reason='invalid_claim';
    else
      select ec.* into e from public.tkid_proof_event_claims ec where ec.organization_id=p_organization_id and ec.source_id=p_source_id and ec.event_id=p_event_id;
      if found then return query select 'accepted',true,p_journey_id,p_browser_session_id,v_j,v_e,s.proof_max_journeys,s.proof_max_events,s.proof_starts_at,s.proof_ends_at,s.ingestion_state; return; end if;
      if not exists(select 1 from public.tkid_proof_journey_claims jc where jc.organization_id=p_organization_id and jc.source_id=p_source_id and jc.origin_id=p_origin_id and jc.journey_id=p_journey_id) then v_reason='invalid_claim';
      elsif v_e>=s.proof_max_events then v_reason='event_budget_exhausted';
      else
        insert into public.tkid_proof_event_claims(organization_id,source_id,origin_id,journey_id,event_id,claimed_at)
        values(p_organization_id,p_source_id,p_origin_id,p_journey_id,p_event_id,p_now);
        v_e=v_e+1;
      end if;
    end if;
  end if;
  if v_reason is not null then
    perform public.record_tkid_proof_rejection_v1(p_organization_id,p_source_id,p_origin_id,v_reason,p_claim_type,p_now);
    return query select v_reason,false,p_journey_id,p_browser_session_id,v_j,v_e,s.proof_max_journeys,s.proof_max_events,s.proof_starts_at,s.proof_ends_at,s.ingestion_state; return;
  end if;
  return query select 'accepted',false,p_journey_id,p_browser_session_id,v_j,v_e,s.proof_max_journeys,s.proof_max_events,s.proof_starts_at,s.proof_ends_at,s.ingestion_state;
end $$;

create or replace function public.set_tkid_source_ingestion_state_v1(
  p_organization_id uuid,p_source_id uuid,p_state text,p_reason text,p_actor_user_id uuid,p_correlation_id text,p_confirmation text
) returns table(source_id uuid,ingestion_state text,changed boolean,audit_event_id uuid)
language plpgsql security invoker set search_path=public,pg_temp as $$
declare s public.tkid_sources%rowtype; v_changed boolean; v_audit uuid;
begin
  if p_state not in ('enabled','stopped') or nullif(btrim(p_reason),'') is null or nullif(btrim(p_correlation_id),'') is null or p_confirmation<>'set-tkid-source-ingestion-state' then raise exception 'explicit ingestion-state confirmation required' using errcode='22023'; end if;
  select src.* into s from public.tkid_sources src where src.organization_id=p_organization_id and src.id=p_source_id for update;
  if not found then raise exception 'source unavailable' using errcode='P0002'; end if;
  if p_state='enabled' and (s.status not in ('shadow','active') or s.abuse_adapter is distinct from 'supabase_fixed_window_v1' or s.proof_max_journeys is null or s.proof_max_events is null or s.proof_starts_at is null or s.proof_ends_at is null or s.proof_ends_at<=s.proof_starts_at) then raise exception 'source proof configuration incomplete' using errcode='55000'; end if;
  v_changed=s.ingestion_state is distinct from p_state;
  if v_changed then update public.tkid_sources src set ingestion_state=p_state,ingestion_state_changed_at=now(),ingestion_state_reason=btrim(p_reason),updated_at=now() where src.id=p_source_id; end if;
  insert into public.tracekit_audit_events(actor_user_id,account_id,organization_id,action,target_type,target_id,result,permission_evaluated,correlation_id,metadata)
  values(p_actor_user_id,s.account_id,p_organization_id,case when p_state='enabled' then 'tkid.source_ingestion_started' else 'tkid.source_ingestion_stopped' end,'tkid_source',p_source_id::text,'success','admin.manage_feature_access',p_correlation_id,jsonb_build_object('state',p_state,'changed',v_changed,'reason',btrim(p_reason))) returning id into v_audit;
  return query select p_source_id,p_state,v_changed,v_audit;
end $$;

create or replace function public.get_tkid_bounded_proof_status_v1(p_organization_id uuid,p_source_id uuid,p_origin_id uuid)
returns table(source_id uuid,origin_id uuid,ingestion_state text,max_journeys integer,max_events integer,claimed_journeys bigint,accepted_events bigint,reserved_events bigint,rejected_counts jsonb,starts_at timestamptz,ends_at timestamptz,terminal_reason text,last_observation timestamptz)
language sql stable security invoker set search_path=public,pg_temp as $$
  select s.id,o.id,s.ingestion_state,s.proof_max_journeys,s.proof_max_events,
    (select count(*) from public.tkid_proof_journey_claims j where j.organization_id=s.organization_id and j.source_id=s.id and j.origin_id=o.id),
    (select count(*) from public.tkid_proof_event_claims c join public.tkid_events e on e.organization_id=c.organization_id and e.source_id=c.source_id and e.id=c.event_id where c.organization_id=s.organization_id and c.source_id=s.id and c.origin_id=o.id),
    (select count(*) from public.tkid_proof_event_claims c where c.organization_id=s.organization_id and c.source_id=s.id and c.origin_id=o.id),
    coalesce((select jsonb_object_agg(x.reason,x.total) from (select r.reason,sum(r.rejected_count) total from public.tkid_proof_rejection_evidence r where r.organization_id=s.organization_id and r.source_id=s.id and r.origin_id=o.id group by r.reason) x),'{}'::jsonb),
    s.proof_starts_at,s.proof_ends_at,
    case when s.ingestion_state<>'enabled' then 'ingestion_stopped' when now()<s.proof_starts_at then 'proof_not_started' when now()>=s.proof_ends_at then 'proof_expired' when (select count(*) from public.tkid_proof_journey_claims j where j.organization_id=s.organization_id and j.source_id=s.id and j.origin_id=o.id)>=s.proof_max_journeys then 'journey_budget_exhausted' when (select count(*) from public.tkid_proof_event_claims c where c.organization_id=s.organization_id and c.source_id=s.id and c.origin_id=o.id)>=s.proof_max_events then 'event_budget_exhausted' else null end,
    (select max(e.received_at) from public.tkid_proof_event_claims c join public.tkid_events e on e.organization_id=c.organization_id and e.source_id=c.source_id and e.id=c.event_id where c.organization_id=s.organization_id and c.source_id=s.id and c.origin_id=o.id)
  from public.tkid_sources s join public.tkid_source_origins o on o.organization_id=s.organization_id and o.source_id=s.id
  where s.organization_id=p_organization_id and s.id=p_source_id and o.id=p_origin_id;
$$;

revoke all on function public.record_tkid_proof_rejection_v1(uuid,uuid,uuid,text,text,timestamptz) from public,anon,authenticated,authenticator;
revoke all on function public.claim_tkid_proof_capacity_v1(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,timestamptz) from public,anon,authenticated,authenticator;
revoke all on function public.set_tkid_source_ingestion_state_v1(uuid,uuid,text,text,uuid,text,text) from public,anon,authenticated,authenticator;
revoke all on function public.get_tkid_bounded_proof_status_v1(uuid,uuid,uuid) from public,anon,authenticated,authenticator;
grant execute on function public.record_tkid_proof_rejection_v1(uuid,uuid,uuid,text,text,timestamptz) to service_role;
grant execute on function public.claim_tkid_proof_capacity_v1(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,timestamptz) to service_role;
grant execute on function public.set_tkid_source_ingestion_state_v1(uuid,uuid,text,text,uuid,text,text) to service_role;
grant execute on function public.get_tkid_bounded_proof_status_v1(uuid,uuid,uuid) to service_role;

comment on table public.tkid_proof_journey_claims is 'Durable conservative Stage-1 journey capacity reservations; retries reuse identities and reservations are not automatically released.';
comment on table public.tkid_proof_event_claims is 'Durable conservative Stage-1 event capacity reservations; persisted acceptance is derived by joining TKID events.';
comment on table public.tkid_proof_rejection_evidence is 'Cardinality-bounded safe operational rejection counts by source, origin, reason, and claim type; no raw IP, request bodies, credentials, or customer data.';
comment on column public.tkid_sources.ingestion_state is 'Audited source-scoped operational kill switch. New and existing sources fail closed as stopped until explicitly enabled.';
comment on column public.tkid_sources.ingestion_state_reason is 'Last operator-supplied bounded reason for an audited ingestion state transition.';
comment on column public.tkid_source_origins.accepted_event_count is 'Legacy non-authoritative counter. Use get_tkid_bounded_proof_status_v1 for bounded-proof accepted event state.';
comment on column public.tkid_source_origins.rejected_event_count is 'Legacy non-authoritative counter. Use get_tkid_bounded_proof_status_v1 for bounded-proof rejection state.';
comment on column public.tkid_source_origins.last_observed_at is 'Legacy non-authoritative observation timestamp. Use get_tkid_bounded_proof_status_v1 for bounded-proof last accepted observation.';
comment on function public.claim_tkid_proof_capacity_v1(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,timestamptz) is 'Atomically reserves bounded proof capacity under a per-source transaction advisory lock. Failed persistence retains capacity to prevent overshoot.';
