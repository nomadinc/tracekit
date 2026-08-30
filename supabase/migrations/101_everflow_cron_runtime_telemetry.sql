begin;

create table if not exists public.everflow_cron_runs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  started_at timestamptz not null default now(),
  backfill_started_at timestamptz,
  backfill_completed_at timestamptz,
  backfill_status text,
  backfill_processed integer,
  backfill_matched integer,
  backfill_ambiguous integer,
  backfill_unmatched integer,
  backfill_remaining integer,
  backfill_error text,
  scheduler_started_at timestamptz,
  scheduler_completed_at timestamptz,
  scheduler_status text,
  scheduler_error text,
  completed_at timestamptz,
  response_status integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_everflow_cron_runs_started_at
  on public.everflow_cron_runs(started_at desc);

alter table public.everflow_cron_runs enable row level security;
revoke all on table public.everflow_cron_runs from public, anon, authenticated;
grant select, insert, update on table public.everflow_cron_runs to service_role;

commit;
