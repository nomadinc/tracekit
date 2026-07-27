-- TraceKit Notification Engine read state.
--
-- Notifications are derived from the Health Engine on demand. This table stores
-- only workspace-scoped presentation state such as read and dismissed flags; it
-- does not duplicate health rules or mutate customer, journey, attribution, or
-- payout data.

create table if not exists public.notification_states (
  workspace_id text not null,
  notification_id text not null,
  health_finding_id text not null,
  read_at timestamptz,
  dismissed_at timestamptz,
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, notification_id)
);

alter table public.notification_states
  add column if not exists workspace_id text,
  add column if not exists notification_id text,
  add column if not exists health_finding_id text,
  add column if not exists read_at timestamptz,
  add column if not exists dismissed_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists notification_states_workspace_updated_idx
  on public.notification_states (workspace_id, updated_at desc);

create index if not exists notification_states_workspace_finding_idx
  on public.notification_states (workspace_id, health_finding_id);

comment on table public.notification_states is
  'Workspace-scoped read/dismiss state for Health Engine-derived notifications.';
