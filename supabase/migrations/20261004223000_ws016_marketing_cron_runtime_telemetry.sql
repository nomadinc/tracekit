begin;

create table public.marketing_cron_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  request_id uuid not null unique,
  authorized boolean not null default true,
  started_at timestamptz not null default now(),
  scheduler_completed_at timestamptz,
  scheduler_status text,
  scheduler_error text,
  due_targets integer,
  claimed integer,
  completed integer,
  failed integer,
  response_status integer,
  deployment_commit_sha text,
  deployment_git_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (provider in ('google_ads')),
  check (scheduler_status is null or scheduler_status in ('running','completed','failed'))
);

create index marketing_cron_runs_provider_started_idx
  on public.marketing_cron_runs(provider,started_at desc);

alter table public.marketing_cron_runs enable row level security;
revoke all on table public.marketing_cron_runs from public,anon,authenticated;
grant select,insert,update on table public.marketing_cron_runs to service_role;

comment on table public.marketing_cron_runs is 'Paid-media cron invocation telemetry. Creating this table does not create or activate a cron route or reporting schedule.';

commit;
