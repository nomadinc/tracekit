-- TKID Continuity Relay v1. Additive and disabled by default.
create table public.tkid_relay_flows(
  id uuid primary key default gen_random_uuid(), account_id uuid not null, organization_id uuid not null,
  business_context_id text not null, source_id uuid not null, flow_key text not null, name text not null,
  status text not null default 'draft', source_origin_id uuid not null, checkout_destination text not null,
  checkout_host text not null, return_origin_id uuid not null, continuity_ttl_seconds integer not null default 5400,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(organization_id,account_id) references public.tracekit_organizations(id,owning_account_id),
  foreign key(organization_id,business_context_id) references public.tracekit_business_contexts(organization_id,id),
  foreign key(organization_id,source_id) references public.tkid_sources(organization_id,id),
  foreign key(organization_id,source_origin_id) references public.tkid_source_origins(organization_id,id),
  foreign key(organization_id,return_origin_id) references public.tkid_source_origins(organization_id,id),
  unique(organization_id,id), unique(source_id,flow_key), unique(flow_key),
  check(flow_key ~ '^[a-z0-9][a-z0-9_-]{2,63}$'), check(length(name) between 1 and 96),
  check(status in('draft','ready','enabled','paused')), check(continuity_ttl_seconds between 1800 and 7200),
  check(checkout_destination ~ '^https://[^/?#]+(?:/[^?#]*)?(?:\?[^#]*)?$'),
  check(checkout_destination !~ '@'), check(checkout_host ~ '^[a-z0-9.-]+$')
);

create table public.tkid_relay_continuities(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, business_context_id text not null,
  source_id uuid not null, flow_id uuid not null, journey_id uuid not null, browser_session_id uuid not null,
  checkout_session_id uuid not null, source_origin_id uuid not null, return_origin_id uuid not null,
  initiation_digest text not null, cookie_digest text, state text not null default 'issued',
  return_count integer not null default 0, handoff_id uuid, failure_code text,
  issued_at timestamptz not null default now(), outbound_at timestamptz, returned_at timestamptz,
  handoff_issued_at timestamptz, consumed_at timestamptz, expires_at timestamptz not null,
  erased_at timestamptz, updated_at timestamptz not null default now(),
  foreign key(organization_id,source_id) references public.tkid_sources(organization_id,id),
  foreign key(organization_id,flow_id) references public.tkid_relay_flows(organization_id,id),
  foreign key(organization_id,journey_id) references public.tkid_journeys(organization_id,id),
  foreign key(organization_id,browser_session_id) references public.tkid_browser_sessions(organization_id,id),
  foreign key(organization_id,checkout_session_id) references public.tkid_checkout_sessions(organization_id,id),
  foreign key(organization_id,source_origin_id) references public.tkid_source_origins(organization_id,id),
  foreign key(organization_id,return_origin_id) references public.tkid_source_origins(organization_id,id),
  unique(organization_id,id), unique(organization_id,initiation_digest),
  check(initiation_digest ~ '^[a-f0-9]{64}$'), check(cookie_digest is null or cookie_digest ~ '^[a-f0-9]{64}$'),
  check(state in('issued','outbound','returned','handoff_issued','consumed','expired','failed','erased')),
  check(return_count between 0 and 3), check(expires_at>issued_at),
  check((state='erased')=(erased_at is not null))
);
create unique index tkid_relay_one_open_browser_flow_uidx on public.tkid_relay_continuities(organization_id,flow_id,browser_session_id) where state in('issued','outbound','returned','handoff_issued');
create index tkid_relay_cookie_lookup_idx on public.tkid_relay_continuities(flow_id,cookie_digest) where cookie_digest is not null and state in('outbound','returned','handoff_issued');
create index tkid_relay_expiry_idx on public.tkid_relay_continuities(expires_at) where state not in('consumed','expired','failed','erased');

create table public.tkid_relay_events(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, continuity_id uuid not null,
  journey_id uuid not null, event_name text not null, evidence_state text not null default 'observed',
  occurred_at timestamptz not null default now(), erased_at timestamptz,
  foreign key(organization_id,continuity_id) references public.tkid_relay_continuities(organization_id,id),
  foreign key(organization_id,journey_id) references public.tkid_journeys(organization_id,id),
  check(event_name in('checkout_handoff_started','external_checkout_returned','cross_domain_handoff_issued','cross_domain_handoff_consumed','continuity_broken')),
  check(evidence_state='observed')
);

alter table public.tkid_abuse_counters drop constraint tkid_abuse_counters_rate_class_check;
alter table public.tkid_abuse_counters add constraint tkid_abuse_counters_rate_class_check check(rate_class in('event_accepted','event_invalid','handoff_issue','handoff_consume','checkout_association','transport','relay_out','relay_return'));

create or replace function public.erase_tkid_relay_continuity(p_organization_id uuid,p_journey_id uuid,p_erased_at timestamptz)
returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_count integer;
begin
  update public.tkid_relay_events set erased_at=p_erased_at where organization_id=p_organization_id and journey_id=p_journey_id and erased_at is null;
  update public.tkid_relay_continuities set state='erased',initiation_digest=encode(extensions.digest(id::text||':init-erased','sha256'),'hex'),cookie_digest=null,handoff_id=null,failure_code='erased_under_policy',erased_at=p_erased_at,updated_at=p_erased_at where organization_id=p_organization_id and journey_id=p_journey_id and state<>'erased';
  get diagnostics v_count=row_count; return v_count;
end $$;
create or replace function public.erase_tkid_relay_on_journey_tombstone() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if new.erased_at is not null and old.erased_at is null then perform public.erase_tkid_relay_continuity(new.organization_id,new.id,new.erased_at); end if;
  return new;
end $$;
create trigger tkid_relay_journey_erasure after update of erased_at on public.tkid_journeys for each row execute function public.erase_tkid_relay_on_journey_tombstone();

alter table public.tkid_relay_flows enable row level security;
alter table public.tkid_relay_continuities enable row level security;
alter table public.tkid_relay_events enable row level security;
revoke all on public.tkid_relay_flows,public.tkid_relay_continuities,public.tkid_relay_events from anon,authenticated;
grant select,insert,update,delete on public.tkid_relay_flows,public.tkid_relay_continuities,public.tkid_relay_events to service_role;
revoke all on function public.erase_tkid_relay_continuity(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.erase_tkid_relay_continuity(uuid,uuid,timestamptz) to service_role;
revoke all on function public.erase_tkid_relay_on_journey_tombstone() from public,anon,authenticated;
comment on table public.tkid_relay_flows is 'Server-managed continuity flows. Draft by default; destinations reference managed origins and configured checkout hosts.';
comment on table public.tkid_relay_continuities is 'Short-lived opaque relay lookup state. Contains no PII, raw IP, provider payload, or browser fingerprint.';
