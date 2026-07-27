-- Live Workspace domain events v1
--
-- This migration adds TraceKit's internal event outbox and browser-safe live
-- projections. It is additive: existing browser events, journey events,
-- notification state, work items, attribution credits, commissions, and ledger
-- tables remain authoritative for their own domains.

create table if not exists public.domain_events (
  event_position bigserial primary key,
  id text not null unique default gen_random_uuid()::text,
  workspace_id text not null,
  type text not null,
  version integer not null default 1,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  actor jsonb not null default '{}'::jsonb,
  subject_type text not null,
  subject_id text not null,
  subject_display_name text,
  subject jsonb not null default '{}'::jsonb,
  related_entities jsonb not null default '[]'::jsonb,
  source jsonb not null default '{}'::jsonb,
  severity text not null default 'info',
  payload jsonb not null default '{}'::jsonb,
  correlation_id text,
  causation_id text,
  trace_id text,
  deduplication_key text,
  created_at timestamptz not null default now()
);

alter table public.domain_events
  add column if not exists event_position bigserial,
  add column if not exists id text default gen_random_uuid()::text,
  add column if not exists workspace_id text,
  add column if not exists type text,
  add column if not exists version integer default 1,
  add column if not exists occurred_at timestamptz,
  add column if not exists recorded_at timestamptz default now(),
  add column if not exists actor jsonb default '{}'::jsonb,
  add column if not exists subject_type text,
  add column if not exists subject_id text,
  add column if not exists subject_display_name text,
  add column if not exists subject jsonb default '{}'::jsonb,
  add column if not exists related_entities jsonb default '[]'::jsonb,
  add column if not exists source jsonb default '{}'::jsonb,
  add column if not exists severity text default 'info',
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists correlation_id text,
  add column if not exists causation_id text,
  add column if not exists trace_id text,
  add column if not exists deduplication_key text,
  add column if not exists created_at timestamptz default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.domain_events'::regclass
      and conname = 'domain_events_type_format_check'
  ) then
    alter table public.domain_events
      add constraint domain_events_type_format_check
      check (type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$') not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.domain_events'::regclass
      and conname = 'domain_events_severity_check'
  ) then
    alter table public.domain_events
      add constraint domain_events_severity_check
      check (severity in ('info', 'success', 'warning', 'critical')) not valid;
  end if;
end $$;

create unique index if not exists domain_events_workspace_dedupe_uidx
  on public.domain_events (workspace_id, deduplication_key)
  where deduplication_key is not null and btrim(deduplication_key) <> '';

create unique index if not exists domain_events_id_uidx
  on public.domain_events (id);

create index if not exists domain_events_workspace_position_idx
  on public.domain_events (workspace_id, event_position);

create index if not exists domain_events_workspace_recorded_idx
  on public.domain_events (workspace_id, recorded_at desc, event_position desc);

create index if not exists domain_events_workspace_type_idx
  on public.domain_events (workspace_id, type, recorded_at desc);

create index if not exists domain_events_subject_idx
  on public.domain_events (workspace_id, subject_type, subject_id, event_position desc);

create index if not exists domain_events_correlation_idx
  on public.domain_events (workspace_id, correlation_id, event_position)
  where correlation_id is not null;

create table if not exists public.workspace_updates (
  update_position bigserial primary key,
  id text not null unique default gen_random_uuid()::text,
  workspace_id text not null,
  domain_event_id text,
  domain_event_position bigint,
  type text not null,
  occurred_at timestamptz not null,
  entity_type text,
  entity_id text,
  changed_fields text[] not null default '{}'::text[],
  metric jsonb,
  activity_group_id text,
  severity text not null default 'info',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.workspace_updates
  add column if not exists update_position bigserial,
  add column if not exists id text default gen_random_uuid()::text,
  add column if not exists workspace_id text,
  add column if not exists domain_event_id text,
  add column if not exists domain_event_position bigint,
  add column if not exists type text,
  add column if not exists occurred_at timestamptz,
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists changed_fields text[] default '{}'::text[],
  add column if not exists metric jsonb,
  add column if not exists activity_group_id text,
  add column if not exists severity text default 'info',
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

create unique index if not exists workspace_updates_event_type_uidx
  on public.workspace_updates (workspace_id, domain_event_id, type)
  where domain_event_id is not null;

create unique index if not exists workspace_updates_id_uidx
  on public.workspace_updates (id);

create index if not exists workspace_updates_workspace_position_idx
  on public.workspace_updates (workspace_id, update_position);

create index if not exists workspace_updates_workspace_type_idx
  on public.workspace_updates (workspace_id, type, update_position desc);

create index if not exists workspace_updates_entity_idx
  on public.workspace_updates (workspace_id, entity_type, entity_id, update_position desc)
  where entity_type is not null and entity_id is not null;

create table if not exists public.domain_event_consumer_state (
  consumer_name text not null,
  workspace_id text not null,
  last_event_position bigint not null default 0,
  last_processed_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (consumer_name, workspace_id)
);

create table if not exists public.activity_groups (
  id text primary key,
  workspace_id text not null,
  group_type text not null,
  status text not null default 'active',
  correlation_id text,
  primary_entity_type text not null,
  primary_entity_id text not null,
  primary_entity_display_name text,
  related_entities jsonb not null default '[]'::jsonb,
  first_occurred_at timestamptz not null,
  last_occurred_at timestamptz not null,
  severity text not null default 'info',
  title text not null,
  summary text not null,
  event_count integer not null default 0,
  action jsonb,
  requires_action boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.activity_groups
  add column if not exists id text,
  add column if not exists workspace_id text,
  add column if not exists group_type text,
  add column if not exists status text default 'active',
  add column if not exists correlation_id text,
  add column if not exists primary_entity_type text,
  add column if not exists primary_entity_id text,
  add column if not exists primary_entity_display_name text,
  add column if not exists related_entities jsonb default '[]'::jsonb,
  add column if not exists first_occurred_at timestamptz,
  add column if not exists last_occurred_at timestamptz,
  add column if not exists severity text default 'info',
  add column if not exists title text,
  add column if not exists summary text,
  add column if not exists event_count integer default 0,
  add column if not exists action jsonb,
  add column if not exists requires_action boolean default false,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create index if not exists activity_groups_workspace_status_idx
  on public.activity_groups (workspace_id, status, last_occurred_at desc);

create index if not exists activity_groups_workspace_entity_idx
  on public.activity_groups (workspace_id, primary_entity_type, primary_entity_id);

create index if not exists activity_groups_workspace_correlation_idx
  on public.activity_groups (workspace_id, correlation_id)
  where correlation_id is not null;

create table if not exists public.activity_group_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  activity_group_id text not null,
  domain_event_id text not null,
  domain_event_position bigint not null,
  created_at timestamptz not null default now()
);

alter table public.activity_group_events
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists workspace_id text,
  add column if not exists activity_group_id text,
  add column if not exists domain_event_id text,
  add column if not exists domain_event_position bigint,
  add column if not exists created_at timestamptz default now();

create unique index if not exists activity_group_events_group_event_uidx
  on public.activity_group_events (activity_group_id, domain_event_id);

create index if not exists activity_group_events_workspace_group_idx
  on public.activity_group_events (workspace_id, activity_group_id, domain_event_position);

comment on table public.domain_events is
  'Append-only internal domain event outbox for replayable TraceKit business changes.';

comment on table public.workspace_updates is
  'Browser-safe workspace update projection consumed by the Live Workspace SSE stream.';

comment on table public.activity_groups is
  'Deterministic activity intelligence groups derived from domain event correlations.';
