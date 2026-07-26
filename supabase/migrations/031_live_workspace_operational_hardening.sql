-- Live Workspace operational hardening v1
--
-- Additive hardening for durable projection replay. Existing domain_events,
-- workspace_updates, and activity_groups remain the canonical Live Workspace
-- event/projection architecture.

alter table public.domain_event_consumer_state
  add column if not exists lease_owner text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists last_run_at timestamptz,
  add column if not exists last_successful_run_at timestamptz,
  add column if not exists last_failed_at timestamptz,
  add column if not exists consecutive_failures integer not null default 0,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists domain_event_consumer_state_lease_idx
  on public.domain_event_consumer_state (lease_expires_at)
  where lease_owner is not null;

create table if not exists public.domain_event_projection_failures (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  consumer_name text not null,
  event_id text not null,
  event_position bigint not null,
  attempt_count integer not null default 1,
  first_failed_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now(),
  next_retry_at timestamptz,
  status text not null default 'retrying',
  error_code text,
  safe_error_summary text,
  resolved_at timestamptz,
  resolved_by text,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.domain_event_projection_failures
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists workspace_id text,
  add column if not exists consumer_name text,
  add column if not exists event_id text,
  add column if not exists event_position bigint,
  add column if not exists attempt_count integer default 1,
  add column if not exists first_failed_at timestamptz default now(),
  add column if not exists last_failed_at timestamptz default now(),
  add column if not exists next_retry_at timestamptz,
  add column if not exists status text default 'retrying',
  add column if not exists error_code text,
  add column if not exists safe_error_summary text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by text,
  add column if not exists resolution_note text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists domain_event_projection_failures_active_uidx
  on public.domain_event_projection_failures (workspace_id, consumer_name, event_id)
  where status in ('open', 'retrying', 'poison');

create index if not exists domain_event_projection_failures_workspace_status_idx
  on public.domain_event_projection_failures (workspace_id, status, last_failed_at desc);

create index if not exists domain_event_projection_failures_event_idx
  on public.domain_event_projection_failures (workspace_id, event_position);

create table if not exists public.domain_event_projection_audit (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  consumer_name text not null,
  action text not null,
  requested_from_position bigint,
  reason text,
  actor text,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.domain_event_projection_audit
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists workspace_id text,
  add column if not exists consumer_name text,
  add column if not exists action text,
  add column if not exists requested_from_position bigint,
  add column if not exists reason text,
  add column if not exists actor text,
  add column if not exists result jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

create index if not exists domain_event_projection_audit_workspace_idx
  on public.domain_event_projection_audit (workspace_id, created_at desc);

create or replace function public.claim_domain_event_consumer(
  p_workspace_id text,
  p_consumer_name text,
  p_runner_id text,
  p_lease_expires_at timestamptz,
  p_now timestamptz default now()
)
returns table(
  claimed boolean,
  consumer_name text,
  workspace_id text,
  last_event_position bigint,
  last_processed_at timestamptz,
  last_error text,
  updated_at timestamptz,
  lease_owner text,
  lease_expires_at timestamptz,
  last_run_at timestamptz,
  last_successful_run_at timestamptz,
  last_failed_at timestamptz,
  consecutive_failures integer,
  metadata jsonb
)
language plpgsql
as $$
begin
  insert into public.domain_event_consumer_state (
    consumer_name,
    workspace_id,
    last_event_position,
    last_run_at,
    updated_at,
    metadata
  )
  values (
    p_consumer_name,
    p_workspace_id,
    0,
    p_now,
    p_now,
    '{}'::jsonb
  )
  on conflict (consumer_name, workspace_id) do nothing;

  update public.domain_event_consumer_state s
  set
    lease_owner = p_runner_id,
    lease_expires_at = p_lease_expires_at,
    last_run_at = p_now,
    updated_at = p_now
  where s.workspace_id = p_workspace_id
    and s.consumer_name = p_consumer_name
    and (
      s.lease_owner is null
      or s.lease_expires_at is null
      or s.lease_expires_at <= p_now
      or s.lease_owner = p_runner_id
    );

  if found then
    return query
    select
      true,
      s.consumer_name,
      s.workspace_id,
      s.last_event_position,
      s.last_processed_at,
      s.last_error,
      s.updated_at,
      s.lease_owner,
      s.lease_expires_at,
      s.last_run_at,
      s.last_successful_run_at,
      s.last_failed_at,
      s.consecutive_failures,
      s.metadata
    from public.domain_event_consumer_state s
    where s.workspace_id = p_workspace_id
      and s.consumer_name = p_consumer_name;
  else
    return query
    select
      false,
      s.consumer_name,
      s.workspace_id,
      s.last_event_position,
      s.last_processed_at,
      s.last_error,
      s.updated_at,
      s.lease_owner,
      s.lease_expires_at,
      s.last_run_at,
      s.last_successful_run_at,
      s.last_failed_at,
      s.consecutive_failures,
      s.metadata
    from public.domain_event_consumer_state s
    where s.workspace_id = p_workspace_id
      and s.consumer_name = p_consumer_name;
  end if;
end;
$$;

comment on table public.domain_event_projection_failures is
  'Structured, safe projection failure records for Live Workspace durable replay.';

comment on table public.domain_event_projection_audit is
  'Administrative audit trail for manual and scheduled projection replay requests.';
