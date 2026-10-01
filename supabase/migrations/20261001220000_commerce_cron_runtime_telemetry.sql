begin;

create table if not exists public.commerce_cron_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  request_id uuid not null unique,
  authorized boolean not null,
  started_at timestamptz not null default now(),
  scheduler_started_at timestamptz,
  scheduler_completed_at timestamptz,
  scheduler_status text,
  scheduler_error text,
  due_targets integer,
  attempted integer,
  completed integer,
  failed integer,
  deep_reconciliation_due integer,
  response_status integer,
  deployment_commit_sha text,
  deployment_git_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_cron_runs_provider_check check (provider in ('commas'))
);

create index if not exists idx_commerce_cron_runs_provider_started_at
  on public.commerce_cron_runs(provider,started_at desc);

alter table public.commerce_cron_runs enable row level security;
revoke all on table public.commerce_cron_runs from public,anon,authenticated;
grant select,insert,update on table public.commerce_cron_runs to service_role;

commit;
