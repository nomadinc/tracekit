-- Phase 2.8 blocker pass: distributed abuse counters and durable TKID erasure.
-- Disabled infrastructure only; no schedules, sources, retention jobs, or repositories activate.

create table public.tkid_abuse_counters(
  organization_id uuid not null, source_id uuid not null, rate_class text not null, key_hash text not null,
  window_start timestamptz not null, window_seconds integer not null, count integer not null default 0,
  expires_at timestamptz not null, updated_at timestamptz not null default now(),
  primary key(organization_id,source_id,rate_class,key_hash,window_start),
  foreign key(organization_id,source_id) references public.tkid_sources(organization_id,id),
  check(rate_class in('event_accepted','event_invalid','handoff_issue','handoff_consume','checkout_association','transport')),
  check(key_hash ~ '^[a-f0-9]{64}$'), check(window_seconds between 10 and 3600), check(count>=0), check(expires_at>window_start)
);
create index tkid_abuse_counters_expiry_idx on public.tkid_abuse_counters(expires_at);

create or replace function public.consume_tkid_abuse_limit(
  p_organization_id uuid,p_source_id uuid,p_rate_class text,p_key_hash text,p_limit integer,p_window_seconds integer,p_now timestamptz
) returns table(allowed boolean,current_count integer,limit_value integer,reset_at timestamptz)
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_start timestamptz; v_count integer;
begin
  if p_limit<1 or p_limit>10000 or p_window_seconds<10 or p_window_seconds>3600 or p_key_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid abuse policy' using errcode='22023'; end if;
  if not exists(select 1 from public.tkid_sources s where s.organization_id=p_organization_id and s.id=p_source_id and s.status in('shadow','active')) then raise exception 'source unavailable' using errcode='P0002'; end if;
  v_start=to_timestamp(floor(extract(epoch from p_now)/p_window_seconds)*p_window_seconds);
  insert into public.tkid_abuse_counters(organization_id,source_id,rate_class,key_hash,window_start,window_seconds,count,expires_at)
  values(p_organization_id,p_source_id,p_rate_class,p_key_hash,v_start,p_window_seconds,1,v_start+make_interval(secs=>p_window_seconds*2))
  on conflict(organization_id,source_id,rate_class,key_hash,window_start) do update set count=public.tkid_abuse_counters.count+1,updated_at=now()
  returning count into v_count;
  return query select v_count<=p_limit,v_count,p_limit,v_start+make_interval(secs=>p_window_seconds);
end $$;

create table public.tkid_erasure_runs(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, journey_id uuid not null,
  policy_id text not null, actor_context text not null, reason_code text not null, status text not null default 'queued',
  attempt integer not null default 0, last_error_code text, started_at timestamptz, completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(organization_id,journey_id) references public.tkid_journeys(organization_id,id),
  unique(organization_id,journey_id,policy_id),
  check(status in('queued','running','object_failed','database_failed','completed','cancelled')), check(attempt>=0),
  check(actor_context in('product_admin','retention_worker','privacy_request_worker'))
);
create table public.tkid_erasure_objects(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, erasure_run_id uuid not null,
  evidence_id uuid not null, object_reference text not null, status text not null default 'pending', erased_at timestamptz,
  last_error_code text, updated_at timestamptz not null default now(),
  foreign key(erasure_run_id) references public.tkid_erasure_runs(id),
  foreign key(organization_id,evidence_id) references public.tkid_event_evidence(organization_id,id),
  unique(erasure_run_id,evidence_id), check(status in('pending','erased','failed')), check((status='erased')=(erased_at is not null))
);

alter table public.tkid_event_evidence add column erasure_run_id uuid references public.tkid_erasure_runs(id);
alter table public.tkid_events add column erased_at timestamptz, add column erasure_run_id uuid references public.tkid_erasure_runs(id);
alter table public.tkid_commerce_links add column tkid_erased_at timestamptz, add column erasure_run_id uuid references public.tkid_erasure_runs(id);
alter table public.tkid_handoffs add column erased_at timestamptz, add column erasure_run_id uuid references public.tkid_erasure_runs(id);
alter table public.tkid_journeys add column erasure_policy_id text, add column erasure_run_id uuid references public.tkid_erasure_runs(id);

create or replace function public.complete_tkid_journey_erasure(p_run_id uuid,p_organization_id uuid,p_completed_at timestamptz)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_run public.tkid_erasure_runs%rowtype;
begin
  select * into v_run from public.tkid_erasure_runs where id=p_run_id and organization_id=p_organization_id for update;
  if not found then return false; end if;
  if v_run.status='completed' then return true; end if;
  if exists(select 1 from public.tkid_erasure_objects where erasure_run_id=p_run_id and status<>'erased') then raise exception 'Evidence object erasure incomplete' using errcode='55000'; end if;
  update public.tkid_event_evidence set bounded_payload='{}',erased_at=p_completed_at,erasure_run_id=p_run_id where organization_id=p_organization_id and event_id in(select id from public.tkid_events where organization_id=p_organization_id and journey_id=v_run.journey_id);
  update public.tkid_events set funnel_step_id=null,offer_id=null,offer_version_id=null,cta_id=null,cta_version=null,price_amount=null,currency=null,recurring=null,billing_cadence=null,trial_state=null,terms_version=null,disclosure_version=null,affirmative_action=null,displayed_descriptor=null,descriptor_version=null,milestone=null,duration_bucket=null,action_type=null,error_code=null,error_category=null,app_version=null,page_id=null,erased_at=p_completed_at,erasure_run_id=p_run_id where organization_id=p_organization_id and journey_id=v_run.journey_id;
  update public.tkid_browser_sessions set device_class=null,browser_family=null,os_family=null where organization_id=p_organization_id and journey_id=v_run.journey_id;
  update public.tkid_checkout_sessions set state='abandoned' where organization_id=p_organization_id and journey_id=v_run.journey_id and state<>'server_confirmed';
  update public.tkid_handoffs set issued_origin='erased',target_origin='erased',token_digest=encode(extensions.digest(id::text||':erased','sha256'),'hex'),erased_at=p_completed_at,erasure_run_id=p_run_id where organization_id=p_organization_id and journey_id=v_run.journey_id;
  update public.tkid_commerce_links set provider_order_reference=null,charge_reference='erased:'||id::text,parent_charge_reference=null,tkid_erased_at=p_completed_at,erasure_run_id=p_run_id where organization_id=p_organization_id and journey_id=v_run.journey_id;
  update public.tkid_journeys set state='erased',completeness='erased',ended_at=coalesce(ended_at,p_completed_at),erased_at=p_completed_at,erasure_policy_id=v_run.policy_id,erasure_run_id=p_run_id,updated_at=p_completed_at where organization_id=p_organization_id and id=v_run.journey_id;
  update public.tkid_erasure_runs set status='completed',completed_at=p_completed_at,last_error_code=null,updated_at=p_completed_at where id=p_run_id;
  update public.tracekit_investigation_freshness f set reasons=f.reasons||jsonb_build_array(jsonb_build_object('code','underlying_tkid_evidence_erased','journey_id',v_run.journey_id,'policy_id',v_run.policy_id)),updated_at=p_completed_at where f.organization_id=p_organization_id and exists(select 1 from public.tracekit_investigation_dependencies d where d.investigation_id=f.investigation_id and d.organization_id=p_organization_id and d.resource_type='tkid_journey');
  return true;
end $$;

do $$ declare t text; begin foreach t in array array['tkid_abuse_counters','tkid_erasure_runs','tkid_erasure_objects'] loop
  execute format('alter table public.%I enable row level security',t); execute format('revoke all on public.%I from anon,authenticated',t); execute format('grant select,insert,update,delete on public.%I to service_role',t);
end loop; end $$;
revoke all on function public.consume_tkid_abuse_limit(uuid,uuid,text,text,integer,integer,timestamptz) from public,anon,authenticated;
revoke all on function public.complete_tkid_journey_erasure(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.consume_tkid_abuse_limit(uuid,uuid,text,text,integer,integer,timestamptz) to service_role;
grant execute on function public.complete_tkid_journey_erasure(uuid,uuid,timestamptz) to service_role;
comment on table public.tkid_abuse_counters is 'Ephemeral distributed security counters; key_hash cannot be used as Product analytics identity.';
comment on table public.tkid_erasure_runs is 'Durable idempotent TKID erasure saga; does not delete canonical Commerce.';
