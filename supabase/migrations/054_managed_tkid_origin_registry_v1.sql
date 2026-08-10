-- Managed TKID exact-origin registry. Additive, service-only, and inactive by default.
create table public.tkid_source_origins (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  organization_id uuid not null,
  business_context_id text not null,
  source_id uuid not null,
  canonical_origin text not null,
  role text not null default 'multi_purpose',
  lifecycle_status text not null default 'pending',
  verification_method text not null default 'dns_txt',
  verification_state text not null default 'unissued',
  verified_at timestamptz,
  verified_by_context text,
  retired_at timestamptz,
  reactivated_at timestamptz,
  last_observed_at timestamptz,
  accepted_event_count bigint not null default 0,
  rejected_event_count bigint not null default 0,
  handoff_issue_count bigint not null default 0,
  handoff_consume_count bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(organization_id,account_id) references public.tracekit_organizations(id,owning_account_id),
  foreign key(organization_id,business_context_id) references public.tracekit_business_contexts(organization_id,id),
  foreign key(organization_id,source_id) references public.tkid_sources(organization_id,id),
  unique(organization_id,id),
  unique(source_id,canonical_origin),
  check(canonical_origin ~ '^https://([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?::[0-9]{1,5})?$'),
  check(canonical_origin !~ '[*?#/]$' and canonical_origin !~ '^https://[^/]+/'),
  check(role in('frontend','checkout_return','oto','confirmation','multi_purpose')),
  check(lifecycle_status in('pending','verified','active','retired')),
  check(verification_method in('dns_txt')),
  check(verification_state in('unissued','issued','verified','failed','expired')),
  check((lifecycle_status in('verified','active','retired'))=(verified_at is not null)),
  check(lifecycle_status<>'active' or verification_state='verified'),
  check((lifecycle_status='retired')=(retired_at is not null)),
  check(accepted_event_count>=0 and rejected_event_count>=0 and handoff_issue_count>=0 and handoff_consume_count>=0)
);

create table public.tkid_origin_verifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_id uuid not null,
  origin_id uuid not null,
  method text not null default 'dns_txt',
  state text not null default 'issued',
  record_name text not null,
  token_digest text not null,
  token_hint text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  verified_at timestamptz,
  superseded_at timestamptz,
  executor_context text not null default 'product_admin',
  created_at timestamptz not null default now(),
  foreign key(organization_id,source_id) references public.tkid_sources(organization_id,id),
  foreign key(organization_id,origin_id) references public.tkid_source_origins(organization_id,id),
  unique(organization_id,id),
  check(method='dns_txt'),
  check(state in('issued','verified','failed','expired','superseded')),
  check(token_digest ~ '^[a-f0-9]{64}$'),
  check(token_hint ~ '^[A-Za-z0-9_-]{4,12}$'),
  check(expires_at>issued_at),
  check(executor_context in('product_admin','server','verification_worker'))
);
create unique index tkid_origin_verifications_live_uidx on public.tkid_origin_verifications(origin_id) where state='issued';
create index tkid_source_origins_active_idx on public.tkid_source_origins(source_id,canonical_origin) where lifecycle_status='active';

alter table public.tkid_event_evidence add column origin_id uuid, add column observed_origin text;
alter table public.tkid_events add column origin_id uuid, add column observed_origin text;
alter table public.tkid_journeys add column started_origin_id uuid, add column started_origin text;
alter table public.tkid_handoffs add column issued_origin_id uuid, add column target_origin_id uuid;
alter table public.tkid_event_evidence add foreign key(organization_id,origin_id) references public.tkid_source_origins(organization_id,id);
alter table public.tkid_events add foreign key(organization_id,origin_id) references public.tkid_source_origins(organization_id,id);
alter table public.tkid_journeys add foreign key(organization_id,started_origin_id) references public.tkid_source_origins(organization_id,id);
alter table public.tkid_handoffs add foreign key(organization_id,issued_origin_id) references public.tkid_source_origins(organization_id,id);
alter table public.tkid_handoffs add foreign key(organization_id,target_origin_id) references public.tkid_source_origins(organization_id,id);

create or replace function public.tkid_active_origin(p_public_source_id text,p_canonical_origin text)
returns table(origin_id uuid,account_id uuid,organization_id uuid,business_context_id text,source_id uuid,source_status text,capture_mode text,rate_limit_per_minute integer)
language sql stable security definer set search_path=public as $$
  select o.id,o.account_id,o.organization_id,o.business_context_id,o.source_id,s.status,s.capture_mode,s.rate_limit_per_minute
  from public.tkid_source_origins o join public.tkid_sources s on s.organization_id=o.organization_id and s.id=o.source_id
  where s.public_source_id=p_public_source_id and s.status in('shadow','active') and o.lifecycle_status='active' and o.canonical_origin=p_canonical_origin
$$;

alter table public.tkid_source_origins enable row level security;
alter table public.tkid_origin_verifications enable row level security;
revoke all on public.tkid_source_origins,public.tkid_origin_verifications from anon,authenticated;
grant select,insert,update,delete on public.tkid_source_origins,public.tkid_origin_verifications to service_role;
revoke all on function public.tkid_active_origin(text,text) from public,anon,authenticated;
grant execute on function public.tkid_active_origin(text,text) to service_role;

comment on table public.tkid_source_origins is 'Product/Admin-managed exact origins. Lifecycle changes never rewrite historical TKID origin provenance.';
comment on table public.tkid_origin_verifications is 'Server-only DNS TXT challenge digests and verification history; plaintext challenges are returned only once.';
comment on column public.tkid_sources.allowed_origins is 'Legacy sandbox/development compatibility only. Production authorization uses tkid_source_origins.';
