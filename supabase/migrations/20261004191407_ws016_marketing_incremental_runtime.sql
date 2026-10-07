begin;

create table public.marketing_reporting_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  provider text not null,
  mode text not null default 'manual',
  window_start date not null,
  window_end date not null,
  status text not null default 'running',
  provider_rows integer not null default 0,
  evidence_created integer not null default 0,
  evidence_reused integer not null default 0,
  facts_created integer not null default 0,
  facts_updated integer not null default 0,
  facts_unchanged integer not null default 0,
  error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (organization_id,account_id) references public.tracekit_organizations(id,owning_account_id),
  foreign key (organization_id,connection_id) references public.marketing_provider_connections(organization_id,id),
  foreign key (organization_id,connection_id,provider_account_id) references public.marketing_provider_accounts(organization_id,connection_id,id),
  check (provider ~ '^[a-z][a-z0-9_]*$'),
  check (mode in ('manual','scheduled')),
  check (status in ('running','completed','failed')),
  check (window_end>=window_start)
);

create table public.marketing_reporting_checkpoints (
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  provider text not null,
  resource text not null,
  last_successful_report_date date,
  overlap_days integer not null default 7,
  last_run_id uuid,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_code text,
  updated_at timestamptz not null default now(),
  primary key (organization_id,connection_id,provider_account_id,resource),
  foreign key (organization_id,connection_id) references public.marketing_provider_connections(organization_id,id),
  foreign key (organization_id,connection_id,provider_account_id) references public.marketing_provider_accounts(organization_id,connection_id,id),
  foreign key (last_run_id) references public.marketing_reporting_runs(id) on delete set null,
  check (provider ~ '^[a-z][a-z0-9_]*$'),
  check (resource='campaign_daily'),
  check (overlap_days between 1 and 30)
);

create table public.marketing_reporting_schedules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  provider text not null,
  resource text not null default 'campaign_daily',
  enabled boolean not null default false,
  activation_state text not null default 'disabled',
  sync_frequency text not null default 'manual',
  next_run_at timestamptz,
  last_enqueued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,connection_id,provider_account_id,resource),
  foreign key (organization_id,account_id) references public.tracekit_organizations(id,owning_account_id),
  foreign key (organization_id,connection_id) references public.marketing_provider_connections(organization_id,id),
  foreign key (organization_id,connection_id,provider_account_id) references public.marketing_provider_accounts(organization_id,connection_id,id),
  check (provider ~ '^[a-z][a-z0-9_]*$'),
  check (resource='campaign_daily'),
  check (activation_state in ('disabled','enabled','paused')),
  check (sync_frequency in ('manual','hourly','daily')),
  check (not enabled or activation_state='enabled')
);

create index marketing_reporting_runs_lookup_idx on public.marketing_reporting_runs(organization_id,provider_account_id,started_at desc);
create index marketing_reporting_schedules_due_idx on public.marketing_reporting_schedules(enabled,activation_state,next_run_at) where enabled;

alter table public.marketing_reporting_runs enable row level security;
alter table public.marketing_reporting_checkpoints enable row level security;
alter table public.marketing_reporting_schedules enable row level security;
revoke all on table public.marketing_reporting_runs from public,anon,authenticated;
revoke all on table public.marketing_reporting_checkpoints from public,anon,authenticated;
revoke all on table public.marketing_reporting_schedules from public,anon,authenticated;

comment on table public.marketing_reporting_runs is 'Paid-media reporting ingestion run telemetry; records bounded manual and future scheduled executions.';
comment on table public.marketing_reporting_checkpoints is 'Paid-media reporting incremental checkpoints and explicit revision-overlap policy.';
comment on table public.marketing_reporting_schedules is 'Paid-media reporting schedules. Rows are created disabled/manual until a later explicit activation milestone.';

commit;
