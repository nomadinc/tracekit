-- Connector Runtime v1 durable jobs, tasks, errors, and WowBoost staging.

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.integration_import_jobs') is not null then
    alter table public.integration_import_jobs
      add column if not exists workspace_id text not null default 'default',
      add column if not exists connector_id text,
      add column if not exists job_type text,
      add column if not exists phase text,
      add column if not exists requested_from text,
      add column if not exists requested_to text,
      add column if not exists records_discovered integer not null default 0,
      add column if not exists records_processed integer not null default 0,
      add column if not exists records_succeeded integer not null default 0,
      add column if not exists records_failed integer not null default 0,
      add column if not exists records_skipped integer not null default 0,
      add column if not exists retries integer not null default 0,
      add column if not exists current_cursor text,
      add column if not exists current_page integer,
      add column if not exists last_error text,
      add column if not exists next_run_at timestamptz,
      add column if not exists metadata jsonb not null default '{}'::jsonb;

    create index if not exists integration_import_jobs_runtime_lookup_idx
      on public.integration_import_jobs (workspace_id, connector_id, job_type, status, requested_from, requested_to);

    create index if not exists integration_import_jobs_runtime_updated_idx
      on public.integration_import_jobs (updated_at desc);
  end if;
end
$$;

create table if not exists public.connector_import_tasks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.integration_import_jobs(id) on delete cascade,
  workspace_id text not null default 'default',
  connector_id text not null,
  task_type text not null,
  phase text not null,
  status text not null default 'queued',
  cursor text,
  page integer,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  dedupe_key text not null,
  payload jsonb not null default '{}'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_id, dedupe_key)
);

create index if not exists connector_import_tasks_job_status_idx
  on public.connector_import_tasks (job_id, status, available_at);

create index if not exists connector_import_tasks_connector_status_idx
  on public.connector_import_tasks (workspace_id, connector_id, status, available_at);

create index if not exists connector_import_tasks_phase_idx
  on public.connector_import_tasks (job_id, phase, status);

create table if not exists public.integration_import_errors (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.integration_import_jobs(id) on delete cascade,
  task_id uuid references public.connector_import_tasks(id) on delete set null,
  connector_id text not null,
  record_identifier text,
  error_class text not null,
  http_status integer,
  attempt integer not null default 1,
  message text,
  response_excerpt text,
  classification text not null default 'transient',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists integration_import_errors_job_idx
  on public.integration_import_errors (job_id, created_at desc);

create index if not exists integration_import_errors_connector_idx
  on public.integration_import_errors (connector_id, created_at desc);

create table if not exists public.wowboost_order_reference_stage (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null default 'default',
  job_id uuid not null references public.integration_import_jobs(id) on delete cascade,
  connector_id text not null,
  requested_from text not null,
  requested_to text not null,
  export_page integer not null,
  order_number text not null,
  order_id text not null,
  transaction_id text,
  order_date timestamptz,
  reference_id text,
  source_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_id, order_number, order_id)
);

create index if not exists wowboost_order_reference_stage_job_order_number_idx
  on public.wowboost_order_reference_stage (job_id, order_number);

create index if not exists wowboost_order_reference_stage_workspace_order_number_idx
  on public.wowboost_order_reference_stage (workspace_id, order_number);

create index if not exists wowboost_order_reference_stage_job_export_page_idx
  on public.wowboost_order_reference_stage (job_id, export_page);
