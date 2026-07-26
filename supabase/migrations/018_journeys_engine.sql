-- Journey Engine v1: canonical customer journeys built from journey_events.

create extension if not exists pgcrypto;

create table if not exists public.journeys (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null default 'default',
  person_id uuid not null references public.people(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  status text not null default 'active',
  entry_event_id uuid references public.journey_events(id) on delete set null,
  conversion_event_id uuid references public.journey_events(id) on delete set null,
  conversion_count integer not null default 0,
  purchase_count integer not null default 0,
  total_revenue numeric not null default 0,
  event_count integer not null default 0,
  is_active boolean not null default true,
  boundary_version text not null default 'v1_inactivity_timeout',
  boundary_timeout_seconds integer not null default 2592000,
  attribution_window_config jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journeys_status_check check (status in ('active', 'completed', 'abandoned')),
  constraint journeys_source_identity_check check (
    length(btrim(workspace_id)) > 0
    and boundary_timeout_seconds > 0
  ),
  constraint journeys_summary_counts_check check (
    event_count >= 0
    and purchase_count >= 0
    and conversion_count >= 0
  ),
  constraint journeys_time_order_check check (ended_at >= started_at)
);

alter table public.journey_events
  add column if not exists journey_id uuid references public.journeys(id) on delete set null;

create unique index if not exists journeys_entry_event_uidx
  on public.journeys (workspace_id, entry_event_id)
  where entry_event_id is not null;

create index if not exists journeys_person_timeline_idx
  on public.journeys (workspace_id, person_id, started_at, id);

create index if not exists journeys_status_idx
  on public.journeys (workspace_id, status, updated_at desc);

create index if not exists journeys_active_idx
  on public.journeys (workspace_id, person_id, is_active, ended_at desc)
  where is_active = true;

create index if not exists journey_events_journey_timeline_idx
  on public.journey_events (workspace_id, journey_id, event_time, id)
  where journey_id is not null;

create index if not exists journey_events_unassigned_backfill_idx
  on public.journey_events (workspace_id, person_id, event_time, id)
  where person_id is not null and journey_id is null;
