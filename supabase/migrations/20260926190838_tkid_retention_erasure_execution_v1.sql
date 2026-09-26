-- Generic TKID retention and erasure execution v1.
-- Policies are inert until explicitly approved, assigned to a source, and the
-- source-scoped executor control is enabled. No tenant policy rows are seeded.

create table public.tkid_retention_policies (
  id text primary key,
  status text not null default 'draft',
  retention_seconds bigint not null,
  grace_seconds bigint not null default 0,
  data_classes text[] not null,
  selector_version text not null,
  policy_version integer not null default 1,
  provenance text not null,
  description text not null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (id ~ '^tkret_[a-z0-9][a-z0-9_-]{7,79}$'),
  check (status in ('draft','active','retired')),
  check (retention_seconds between 3600 and 315576000),
  check (grace_seconds between 0 and 31557600),
  check (cardinality(data_classes) between 1 and 16),
  check (data_classes <@ array['journey','browser_session','event','event_evidence','checkout_session','handoff','relay_continuity','commerce_link']::text[]),
  check (selector_version = 'tkid-retention-selector-v1'),
  check (policy_version > 0),
  check (length(provenance) between 1 and 160 and length(description) between 1 and 500),
  check ((status = 'active') = (approved_at is not null))
);

create table public.tkid_erasure_policies (
  id text primary key,
  status text not null default 'draft',
  object_classes text[] not null,
  preservation_exceptions text[] not null default array['canonical_commerce']::text[],
  execution_strategy text not null,
  policy_version integer not null default 1,
  provenance text not null,
  description text not null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (id ~ '^tkerase_[a-z0-9][a-z0-9_-]{5,77}$'),
  check (status in ('draft','active','retired')),
  check (cardinality(object_classes) between 1 and 16),
  check (object_classes <@ array['journey','browser_session','event','event_evidence','checkout_session','handoff','relay_continuity','commerce_link']::text[]),
  check (preservation_exceptions <@ array['canonical_commerce','attribution_identity','commerce_identity']::text[]),
  check ('canonical_commerce' = any(preservation_exceptions)),
  check (execution_strategy = 'tkid-object-first-v1'),
  check (policy_version > 0),
  check (length(provenance) between 1 and 160 and length(description) between 1 and 500),
  check ((status = 'active') = (approved_at is not null))
);

create table public.tkid_privacy_execution_controls (
  organization_id uuid not null,
  source_id uuid not null,
  execution_state text not null default 'stopped',
  batch_size integer not null default 25,
  lease_seconds integer not null default 300,
  state_reason text,
  state_changed_at timestamptz not null default now(),
  last_scheduler_at timestamptz,
  last_completed_at timestamptz,
  last_failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id,source_id),
  foreign key (organization_id,source_id) references public.tkid_sources(organization_id,id),
  check (execution_state in ('stopped','enabled','paused')),
  check (batch_size between 1 and 100),
  check (lease_seconds between 30 and 1800),
  check (state_reason is null or length(state_reason) between 1 and 240),
  check (last_failure_code is null or last_failure_code ~ '^[a-z0-9_]{1,80}$')
);

alter table public.tkid_erasure_runs
  add column source_id uuid,
  add column retention_policy_id text,
  add column selected_cutoff timestamptz,
  add column selector_version text,
  add column correlation_id text,
  add column lease_owner text,
  add column lease_expires_at timestamptz,
  add column next_attempt_at timestamptz,
  add column selected_object_count integer not null default 0;

update public.tkid_erasure_runs r
set source_id=j.source_id
from public.tkid_journeys j
where j.organization_id=r.organization_id and j.id=r.journey_id and r.source_id is null;

alter table public.tkid_erasure_runs
  add foreign key (organization_id,source_id) references public.tkid_sources(organization_id,id),
  add constraint tkid_erasure_runs_selector_version_check check (selector_version is null or selector_version='tkid-retention-selector-v1'),
  add constraint tkid_erasure_runs_correlation_check check (correlation_id is null or length(correlation_id) between 8 and 160),
  add constraint tkid_erasure_runs_lease_check check ((lease_owner is null)=(lease_expires_at is null)),
  add constraint tkid_erasure_runs_selected_count_check check (selected_object_count>=0);

alter table public.tkid_erasure_objects
  add column object_type text not null default 'protected_evidence',
  add column attempt integer not null default 0,
  add column claimed_at timestamptz;

alter table public.tkid_erasure_objects
  add constraint tkid_erasure_objects_type_check check (object_type in ('protected_evidence','tkid_event_evidence')),
  add constraint tkid_erasure_objects_attempt_check check (attempt>=0);

create index tkid_journeys_retention_selector_idx
  on public.tkid_journeys(organization_id,source_id,started_at,id)
  where erased_at is null;
create index tkid_erasure_runs_claim_idx
  on public.tkid_erasure_runs(status,next_attempt_at,lease_expires_at,created_at)
  where status in ('queued','running','object_failed','database_failed');
create index tkid_erasure_objects_work_idx
  on public.tkid_erasure_objects(erasure_run_id,status,id)
  where status in ('pending','failed');

alter table public.tkid_retention_policies enable row level security;
alter table public.tkid_erasure_policies enable row level security;
alter table public.tkid_privacy_execution_controls enable row level security;
revoke all on public.tkid_retention_policies,public.tkid_erasure_policies,public.tkid_privacy_execution_controls from public,anon,authenticated,authenticator;
grant select,insert,update on public.tkid_retention_policies,public.tkid_erasure_policies,public.tkid_privacy_execution_controls to service_role;

create or replace function public.preview_tkid_retention_selection_v1(
  p_organization_id uuid,p_source_id uuid,p_limit integer default 25,p_now timestamptz default now()
) returns table(journey_id uuid,started_at timestamptz,cutoff_at timestamptz,retention_policy_id text,erasure_policy_id text)
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare s public.tkid_sources%rowtype; rp public.tkid_retention_policies%rowtype; ep public.tkid_erasure_policies%rowtype; v_cutoff timestamptz;
begin
  if p_limit<1 or p_limit>100 then raise exception 'invalid_selection_limit' using errcode='22023'; end if;
  select * into s from public.tkid_sources where organization_id=p_organization_id and id=p_source_id;
  if not found then raise exception 'source_unavailable' using errcode='P0002'; end if;
  select * into rp from public.tkid_retention_policies where id=s.retention_policy_id and status='active';
  if not found then raise exception 'retention_policy_unapproved' using errcode='55000'; end if;
  select * into ep from public.tkid_erasure_policies where id=s.erasure_policy_id and status='active';
  if not found then raise exception 'erasure_policy_unapproved' using errcode='55000'; end if;
  v_cutoff=p_now-make_interval(secs=>(rp.retention_seconds+rp.grace_seconds)::double precision);
  return query
    select j.id,j.started_at,v_cutoff,rp.id,ep.id
    from public.tkid_journeys j
    where j.organization_id=p_organization_id and j.source_id=p_source_id and j.erased_at is null
      and j.started_at<v_cutoff
      and not exists(select 1 from public.tkid_erasure_runs r where r.organization_id=j.organization_id and r.journey_id=j.id and r.status<>'cancelled')
    order by j.started_at,j.id limit p_limit;
end $$;

create or replace function public.create_tkid_retention_erasure_runs_v1(
  p_organization_id uuid,p_source_id uuid,p_limit integer,p_now timestamptz,p_actor_user_id uuid,p_correlation_id text,p_confirmation text
) returns table(run_id uuid,journey_id uuid,created boolean)
language plpgsql security invoker set search_path=public,pg_temp as $$
declare x record; s public.tkid_sources%rowtype; v_run uuid; v_created boolean; v_objects integer;
begin
  if p_confirmation<>'create-tkid-retention-erasure-runs' or nullif(btrim(p_correlation_id),'') is null then raise exception 'explicit_retention_confirmation_required' using errcode='22023'; end if;
  if p_limit<1 or p_limit>100 then raise exception 'invalid_selection_limit' using errcode='22023'; end if;
  select * into s from public.tkid_sources where organization_id=p_organization_id and id=p_source_id;
  if not found then raise exception 'source_unavailable' using errcode='P0002'; end if;
  for x in select * from public.preview_tkid_retention_selection_v1(p_organization_id,p_source_id,p_limit,p_now) loop
    v_run=(md5(p_organization_id::text||':'||p_source_id::text||':'||x.journey_id::text||':'||x.retention_policy_id||':'||x.erasure_policy_id))::uuid;
    insert into public.tkid_erasure_runs(id,organization_id,source_id,journey_id,policy_id,retention_policy_id,actor_context,reason_code,status,selected_cutoff,selector_version,correlation_id,next_attempt_at)
    values(v_run,p_organization_id,p_source_id,x.journey_id,x.erasure_policy_id,x.retention_policy_id,'retention_worker','retention_expired','queued',x.cutoff_at,'tkid-retention-selector-v1',btrim(p_correlation_id),p_now)
    on conflict on constraint tkid_erasure_runs_organization_id_journey_id_policy_id_key do nothing;
    v_created=found;
    if v_created then
      insert into public.tkid_erasure_objects(organization_id,erasure_run_id,evidence_id,object_reference,object_type,status)
      select e.organization_id,v_run,e.id,'tkid_event_evidence:'||e.id::text,'tkid_event_evidence','pending'
      from public.tkid_event_evidence e join public.tkid_events ev on ev.organization_id=e.organization_id and ev.evidence_id=e.id
      where ev.organization_id=p_organization_id and ev.journey_id=x.journey_id and e.erased_at is null
      on conflict(erasure_run_id,evidence_id) do nothing;
      get diagnostics v_objects=row_count;
      update public.tkid_erasure_runs set selected_object_count=v_objects where id=v_run;
    end if;
    return query select v_run,x.journey_id,v_created;
  end loop;
  insert into public.tracekit_audit_events(actor_user_id,account_id,organization_id,action,target_type,target_id,result,permission_evaluated,correlation_id,metadata)
  values(p_actor_user_id,s.account_id,p_organization_id,'tkid.retention_runs_created','tkid_source',p_source_id::text,'success','admin.manage_feature_access',btrim(p_correlation_id),jsonb_build_object('limit',p_limit,'selector_version','tkid-retention-selector-v1'));
end $$;

create or replace function public.schedule_tkid_retention_v1(p_worker_id text,p_limit integer default 25,p_now timestamptz default now())
returns table(source_id uuid,runs_created integer)
language plpgsql security invoker set search_path=public,pg_temp as $$
declare c record; v_count integer;
begin
  if nullif(btrim(p_worker_id),'') is null or p_limit<1 or p_limit>100 then raise exception 'invalid_scheduler_request' using errcode='22023'; end if;
  for c in select ctl.organization_id,ctl.source_id,least(ctl.batch_size,p_limit) batch_size
    from public.tkid_privacy_execution_controls ctl where ctl.execution_state='enabled' order by ctl.organization_id,ctl.source_id limit 100
  loop
    select count(*) into v_count from public.create_tkid_retention_erasure_runs_v1(c.organization_id,c.source_id,c.batch_size,p_now,null,'scheduler:'||left(btrim(p_worker_id),120),'create-tkid-retention-erasure-runs') where created;
    update public.tkid_privacy_execution_controls ctl set last_scheduler_at=p_now,updated_at=p_now where ctl.organization_id=c.organization_id and ctl.source_id=c.source_id;
    return query select c.source_id,v_count;
  end loop;
end $$;

create or replace function public.claim_tkid_erasure_run_v1(p_worker_id text,p_now timestamptz default now())
returns table(run_id uuid,organization_id uuid,source_id uuid,journey_id uuid,policy_id text,attempt integer,lease_expires_at timestamptz)
language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.tkid_erasure_runs%rowtype; v_lease integer;
begin
  if nullif(btrim(p_worker_id),'') is null then raise exception 'worker_identity_required' using errcode='22023'; end if;
  select er.* into r from public.tkid_erasure_runs er
  join public.tkid_privacy_execution_controls ctl on ctl.organization_id=er.organization_id and ctl.source_id=er.source_id and ctl.execution_state='enabled'
  where er.status in ('queued','running','object_failed','database_failed') and coalesce(er.next_attempt_at,'-infinity')<=p_now
    and (er.lease_expires_at is null or er.lease_expires_at<=p_now)
  order by er.created_at,er.id for update of er skip locked limit 1;
  if not found then return; end if;
  select ctl.lease_seconds into v_lease from public.tkid_privacy_execution_controls ctl where ctl.organization_id=r.organization_id and ctl.source_id=r.source_id;
  update public.tkid_erasure_runs er set status='running',attempt=er.attempt+1,started_at=coalesce(er.started_at,p_now),lease_owner=btrim(p_worker_id),lease_expires_at=p_now+make_interval(secs=>v_lease),last_error_code=null,updated_at=p_now where er.id=r.id;
  return query select r.id,r.organization_id,r.source_id,r.journey_id,r.policy_id,r.attempt+1,p_now+make_interval(secs=>v_lease);
end $$;

create or replace function public.erase_tkid_erasure_object_v1(p_run_id uuid,p_object_id uuid,p_worker_id text,p_now timestamptz default now())
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.tkid_erasure_runs%rowtype; o public.tkid_erasure_objects%rowtype;
begin
  select * into r from public.tkid_erasure_runs where id=p_run_id for update;
  if not found or r.status<>'running' or r.lease_owner is distinct from btrim(p_worker_id) or r.lease_expires_at<=p_now then raise exception 'erasure_lease_unavailable' using errcode='55000'; end if;
  select * into o from public.tkid_erasure_objects where id=p_object_id and erasure_run_id=p_run_id for update;
  if not found then return false; end if;
  if o.status='erased' then return true; end if;
  if o.object_type<>'tkid_event_evidence' then
    update public.tkid_erasure_objects set status='failed',attempt=attempt+1,last_error_code='unsupported_object_type',updated_at=p_now where id=p_object_id;
    return false;
  end if;
  update public.tkid_event_evidence set bounded_payload='{}',erased_at=coalesce(erased_at,p_now),erasure_run_id=p_run_id where organization_id=r.organization_id and source_id=r.source_id and id=o.evidence_id;
  if not found then
    update public.tkid_erasure_objects set status='failed',attempt=attempt+1,last_error_code='evidence_scope_conflict',updated_at=p_now where id=p_object_id;
    return false;
  end if;
  update public.tkid_erasure_objects set status='erased',attempt=attempt+1,claimed_at=coalesce(claimed_at,p_now),erased_at=p_now,last_error_code=null,updated_at=p_now where id=p_object_id;
  return true;
end $$;

create or replace function public.complete_tkid_erasure_run_v2(p_run_id uuid,p_worker_id text,p_now timestamptz default now())
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.tkid_erasure_runs%rowtype; s public.tkid_sources%rowtype; v_ok boolean;
begin
  select * into r from public.tkid_erasure_runs where id=p_run_id for update;
  if not found then return false; end if;
  if r.status='completed' then return true; end if;
  if r.status<>'running' or r.lease_owner is distinct from btrim(p_worker_id) or r.lease_expires_at<=p_now then raise exception 'erasure_lease_unavailable' using errcode='55000'; end if;
  if exists(select 1 from public.tkid_erasure_objects where erasure_run_id=p_run_id and status<>'erased') then raise exception 'erasure_objects_incomplete' using errcode='55000'; end if;
  v_ok=public.complete_tkid_journey_erasure(p_run_id,r.organization_id,p_now);
  update public.tkid_erasure_runs set lease_owner=null,lease_expires_at=null where id=p_run_id;
  select * into s from public.tkid_sources where organization_id=r.organization_id and id=r.source_id;
  update public.tkid_privacy_execution_controls set last_completed_at=p_now,last_failure_code=null,updated_at=p_now where organization_id=r.organization_id and source_id=r.source_id;
  insert into public.tracekit_audit_events(actor_user_id,account_id,organization_id,action,target_type,target_id,result,permission_evaluated,correlation_id,metadata)
  values(null,s.account_id,r.organization_id,'tkid.retention_erasure_completed','tkid_erasure_run',p_run_id::text,'success','service_role',coalesce(r.correlation_id,'retention-executor'),jsonb_build_object('source_id',r.source_id,'journey_id',r.journey_id,'policy_id',r.policy_id,'retention_policy_id',r.retention_policy_id,'selected_object_count',r.selected_object_count,'execution_context','retention_worker'));
  return v_ok;
end $$;

create or replace function public.fail_tkid_erasure_run_v1(p_run_id uuid,p_worker_id text,p_error_code text,p_now timestamptz default now())
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.tkid_erasure_runs%rowtype; v_code text;
begin
  v_code=lower(regexp_replace(coalesce(p_error_code,'executor_failure'),'[^a-z0-9_]+','_','g'));
  if v_code !~ '^[a-z0-9_]{1,80}$' then v_code='executor_failure'; end if;
  select * into r from public.tkid_erasure_runs where id=p_run_id for update;
  if not found or r.lease_owner is distinct from btrim(p_worker_id) then return false; end if;
  update public.tkid_erasure_runs set status=case when exists(select 1 from public.tkid_erasure_objects where erasure_run_id=p_run_id and status='failed') then 'object_failed' else 'database_failed' end,last_error_code=v_code,next_attempt_at=p_now+make_interval(secs=>least(3600,30*(2^least(attempt,6)))::integer),lease_owner=null,lease_expires_at=null,updated_at=p_now where id=p_run_id;
  update public.tkid_privacy_execution_controls set last_failure_code=v_code,updated_at=p_now where organization_id=r.organization_id and source_id=r.source_id;
  return true;
end $$;

create or replace function public.retry_tkid_erasure_run_v1(p_run_id uuid,p_organization_id uuid,p_correlation_id text,p_confirmation text)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.tkid_erasure_runs%rowtype; s public.tkid_sources%rowtype;
begin
  if p_confirmation<>'retry-tkid-erasure-run' or nullif(btrim(p_correlation_id),'') is null then raise exception 'explicit_retry_confirmation_required' using errcode='22023'; end if;
  select * into r from public.tkid_erasure_runs where id=p_run_id and organization_id=p_organization_id for update;
  if not found then return false; end if;
  if r.status not in ('object_failed','database_failed') then raise exception 'run_not_retryable' using errcode='55000'; end if;
  update public.tkid_erasure_objects set status='pending',last_error_code=null where erasure_run_id=p_run_id and status='failed';
  update public.tkid_erasure_runs set status='queued',next_attempt_at=now(),last_error_code=null,lease_owner=null,lease_expires_at=null,correlation_id=btrim(p_correlation_id),updated_at=now() where id=p_run_id;
  select * into s from public.tkid_sources where organization_id=r.organization_id and id=r.source_id;
  insert into public.tracekit_audit_events(actor_user_id,account_id,organization_id,action,target_type,target_id,result,permission_evaluated,correlation_id,metadata)
  values(null,s.account_id,r.organization_id,'tkid.retention_erasure_retry_queued','tkid_erasure_run',p_run_id::text,'success','admin.manage_feature_access',btrim(p_correlation_id),jsonb_build_object('prior_status',r.status));
  return true;
end $$;

create or replace function public.set_tkid_privacy_executor_state_v1(
  p_organization_id uuid,p_source_id uuid,p_state text,p_reason text,p_actor_user_id uuid,p_correlation_id text,p_confirmation text
) returns table(source_id uuid,execution_state text,changed boolean,audit_event_id uuid)
language plpgsql security invoker set search_path=public,pg_temp as $$
declare s public.tkid_sources%rowtype; old_state text; v_audit uuid;
begin
  if p_state not in ('enabled','paused','stopped') or nullif(btrim(p_reason),'') is null or nullif(btrim(p_correlation_id),'') is null or p_confirmation<>'set-tkid-privacy-executor-state' then raise exception 'explicit_executor_confirmation_required' using errcode='22023'; end if;
  select * into s from public.tkid_sources where organization_id=p_organization_id and id=p_source_id for update;
  if not found then raise exception 'source_unavailable' using errcode='P0002'; end if;
  if p_state='enabled' and (not exists(select 1 from public.tkid_retention_policies where id=s.retention_policy_id and status='active') or not exists(select 1 from public.tkid_erasure_policies where id=s.erasure_policy_id and status='active')) then raise exception 'privacy_policy_unapproved' using errcode='55000'; end if;
  select ctl.execution_state into old_state from public.tkid_privacy_execution_controls ctl where ctl.organization_id=p_organization_id and ctl.source_id=p_source_id for update;
  insert into public.tkid_privacy_execution_controls(organization_id,source_id,execution_state,state_reason,state_changed_at)
  values(p_organization_id,p_source_id,p_state,btrim(p_reason),now())
  on conflict on constraint tkid_privacy_execution_controls_pkey do update set execution_state=excluded.execution_state,state_reason=excluded.state_reason,state_changed_at=case when public.tkid_privacy_execution_controls.execution_state is distinct from excluded.execution_state then now() else public.tkid_privacy_execution_controls.state_changed_at end,updated_at=now();
  insert into public.tracekit_audit_events(actor_user_id,account_id,organization_id,action,target_type,target_id,result,permission_evaluated,correlation_id,metadata)
  values(p_actor_user_id,s.account_id,p_organization_id,'tkid.privacy_executor_state_changed','tkid_source',p_source_id::text,'success','admin.manage_feature_access',btrim(p_correlation_id),jsonb_build_object('prior_state',old_state,'resulting_state',p_state,'reason',btrim(p_reason))) returning id into v_audit;
  return query select p_source_id,p_state,old_state is distinct from p_state,v_audit;
end $$;

create or replace function public.get_tkid_privacy_status_v1(p_organization_id uuid,p_source_id uuid)
returns table(source_id uuid,retention_policy_id text,retention_policy_status text,erasure_policy_id text,erasure_policy_status text,oldest_retained_evidence timestamptz,next_eligible_cutoff timestamptz,pending_runs bigint,claimed_objects bigint,succeeded_objects bigint,failed_objects bigint,last_completed_run timestamptz,last_failure text,executor_state text,executor_enabled boolean)
language sql stable security invoker set search_path=public,pg_temp as $$
select s.id,s.retention_policy_id,rp.status,s.erasure_policy_id,ep.status,
  (select min(e.received_at) from public.tkid_event_evidence e where e.organization_id=s.organization_id and e.source_id=s.id and e.erased_at is null),
  case when rp.status='active' then now()-make_interval(secs=>(rp.retention_seconds+rp.grace_seconds)::double precision) end,
  (select count(*) from public.tkid_erasure_runs r where r.organization_id=s.organization_id and r.source_id=s.id and r.status in ('queued','running','object_failed','database_failed')),
  (select count(*) from public.tkid_erasure_objects o join public.tkid_erasure_runs r on r.id=o.erasure_run_id where r.organization_id=s.organization_id and r.source_id=s.id and o.status='pending' and r.status='running'),
  (select count(*) from public.tkid_erasure_objects o join public.tkid_erasure_runs r on r.id=o.erasure_run_id where r.organization_id=s.organization_id and r.source_id=s.id and o.status='erased'),
  (select count(*) from public.tkid_erasure_objects o join public.tkid_erasure_runs r on r.id=o.erasure_run_id where r.organization_id=s.organization_id and r.source_id=s.id and o.status='failed'),
  (select max(completed_at) from public.tkid_erasure_runs r where r.organization_id=s.organization_id and r.source_id=s.id and r.status='completed'),
  (select last_error_code from public.tkid_erasure_runs r where r.organization_id=s.organization_id and r.source_id=s.id and last_error_code is not null order by updated_at desc limit 1),
  coalesce(ctl.execution_state,'stopped'),coalesce(ctl.execution_state='enabled',false)
from public.tkid_sources s
left join public.tkid_retention_policies rp on rp.id=s.retention_policy_id
left join public.tkid_erasure_policies ep on ep.id=s.erasure_policy_id
left join public.tkid_privacy_execution_controls ctl on ctl.organization_id=s.organization_id and ctl.source_id=s.id
where s.organization_id=p_organization_id and s.id=p_source_id;
$$;

create or replace function public.list_tkid_erasure_failures_v1(p_organization_id uuid,p_source_id uuid,p_limit integer default 25)
returns table(run_id uuid,journey_id uuid,run_status text,object_id uuid,object_type text,error_code text,attempt integer,updated_at timestamptz)
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
  if p_limit<1 or p_limit>100 then raise exception 'invalid_failure_limit' using errcode='22023'; end if;
  return query select r.id,r.journey_id,r.status,o.id,o.object_type,coalesce(o.last_error_code,r.last_error_code),greatest(r.attempt,o.attempt),greatest(r.updated_at,o.updated_at)
  from public.tkid_erasure_runs r left join public.tkid_erasure_objects o on o.erasure_run_id=r.id and o.status='failed'
  where r.organization_id=p_organization_id and r.source_id=p_source_id and r.status in ('object_failed','database_failed')
  order by r.updated_at desc,r.id,o.id limit p_limit;
end $$;

-- Converge the M1 ingestion start gate to require executable privacy policies
-- and an explicitly enabled source-scoped executor.
create or replace function public.set_tkid_source_ingestion_state_v1(
  p_organization_id uuid,p_source_id uuid,p_state text,p_reason text,p_actor_user_id uuid,p_correlation_id text,p_confirmation text
) returns table(source_id uuid,ingestion_state text,changed boolean,audit_event_id uuid)
language plpgsql security invoker set search_path=public,pg_temp as $$
declare s public.tkid_sources%rowtype; v_changed boolean; v_audit uuid;
begin
  if p_state not in ('enabled','stopped') or nullif(btrim(p_reason),'') is null or nullif(btrim(p_correlation_id),'') is null or p_confirmation<>'set-tkid-source-ingestion-state' then raise exception 'explicit_ingestion_state_confirmation_required' using errcode='22023'; end if;
  select * into s from public.tkid_sources where organization_id=p_organization_id and id=p_source_id for update;
  if not found then raise exception 'source_unavailable' using errcode='P0002'; end if;
  if p_state='enabled' then
    if s.status not in ('shadow','active') or s.abuse_adapter is distinct from 'supabase_fixed_window_v1' or s.proof_max_journeys is null or s.proof_max_events is null or s.proof_starts_at is null or s.proof_ends_at is null or s.proof_ends_at<=s.proof_starts_at then raise exception 'source_proof_configuration_incomplete' using errcode='55000'; end if;
    if not exists(select 1 from public.tkid_retention_policies where id=s.retention_policy_id and status='active') then raise exception 'retention_policy_unapproved' using errcode='55000'; end if;
    if not exists(select 1 from public.tkid_erasure_policies where id=s.erasure_policy_id and status='active') then raise exception 'erasure_policy_unapproved' using errcode='55000'; end if;
    if not exists(select 1 from public.tkid_privacy_execution_controls ctl where ctl.organization_id=p_organization_id and ctl.source_id=p_source_id and ctl.execution_state='enabled') then raise exception 'privacy_executor_disabled' using errcode='55000'; end if;
  end if;
  v_changed=s.ingestion_state is distinct from p_state;
  if v_changed then update public.tkid_sources src set ingestion_state=p_state,ingestion_state_changed_at=now(),ingestion_state_reason=btrim(p_reason),updated_at=now() where src.organization_id=p_organization_id and src.id=p_source_id; end if;
  insert into public.tracekit_audit_events(actor_user_id,account_id,organization_id,action,target_type,target_id,result,permission_evaluated,correlation_id,metadata)
  values(p_actor_user_id,s.account_id,p_organization_id,case when p_state='enabled' then 'tkid.source_ingestion_started' else 'tkid.source_ingestion_stopped' end,'tkid_source',p_source_id::text,'success','admin.manage_feature_access',btrim(p_correlation_id),jsonb_build_object('state',p_state,'changed',v_changed,'reason',btrim(p_reason))) returning id into v_audit;
  return query select p_source_id,p_state,v_changed,v_audit;
end $$;

do $$ declare f regprocedure; begin
  foreach f in array array[
    'public.preview_tkid_retention_selection_v1(uuid,uuid,integer,timestamptz)'::regprocedure,
    'public.create_tkid_retention_erasure_runs_v1(uuid,uuid,integer,timestamptz,uuid,text,text)'::regprocedure,
    'public.schedule_tkid_retention_v1(text,integer,timestamptz)'::regprocedure,
    'public.claim_tkid_erasure_run_v1(text,timestamptz)'::regprocedure,
    'public.erase_tkid_erasure_object_v1(uuid,uuid,text,timestamptz)'::regprocedure,
    'public.complete_tkid_erasure_run_v2(uuid,text,timestamptz)'::regprocedure,
    'public.fail_tkid_erasure_run_v1(uuid,text,text,timestamptz)'::regprocedure,
    'public.retry_tkid_erasure_run_v1(uuid,uuid,text,text)'::regprocedure,
    'public.set_tkid_privacy_executor_state_v1(uuid,uuid,text,text,uuid,text,text)'::regprocedure,
    'public.get_tkid_privacy_status_v1(uuid,uuid)'::regprocedure,
    'public.list_tkid_erasure_failures_v1(uuid,uuid,integer)'::regprocedure
  ] loop
    execute format('revoke all on function %s from public,anon,authenticated,authenticator',f);
    execute format('grant execute on function %s to service_role',f);
  end loop;
end $$;

revoke all on function public.set_tkid_source_ingestion_state_v1(uuid,uuid,text,text,uuid,text,text) from public,anon,authenticated,authenticator;
grant execute on function public.set_tkid_source_ingestion_state_v1(uuid,uuid,text,text,uuid,text,text) to service_role;

comment on table public.tkid_retention_policies is 'Approved executable TKID retention policy registry. Draft and retired policies never satisfy ingestion readiness.';
comment on table public.tkid_erasure_policies is 'Approved executable TKID erasure policy registry preserving canonical Commerce while redacting TKID behavioral state.';
comment on table public.tkid_privacy_execution_controls is 'Audited source-scoped retention scheduler and erasure executor control; stopped by default.';
comment on function public.preview_tkid_retention_selection_v1(uuid,uuid,integer,timestamptz) is 'Read-only bounded deterministic retention preview ordered by journey age and identity.';
comment on function public.get_tkid_privacy_status_v1(uuid,uuid) is 'Read-only service operator status containing bounded counts and safe failure codes only.';
