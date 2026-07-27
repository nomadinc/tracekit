-- Operations Center Work Items v1
--
-- Work Items are the persistent workflow layer for Health, Notifications,
-- Customer 360, connector diagnostics, and future MCP access. They do not
-- replace source engines; they store stable workflow state and bounded evidence
-- snapshots keyed by deterministic source identity.

create table if not exists public.work_items (
  id text primary key,
  workspace_id text not null,
  type text not null,
  category text not null,
  source text not null,
  source_key text not null,
  title text not null,
  summary text not null,
  severity text not null,
  priority text not null,
  status text not null default 'open',
  lifecycle_state text not null,
  assigned_to text,
  related_person_id text,
  related_journey_id text,
  related_order_id text,
  related_conversion_id text,
  related_commission_id text,
  related_connector_id text,
  related_health_finding_id text,
  related_notification_id text,
  deep_link text,
  evidence jsonb not null default '{}'::jsonb,
  resolution jsonb not null default '{}'::jsonb,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  dismissed_at timestamptz,
  resolution_code text,
  resolution_note text,
  resolved_by text,
  recurrence_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.work_items
  add column if not exists id text,
  add column if not exists workspace_id text,
  add column if not exists type text,
  add column if not exists category text,
  add column if not exists source text,
  add column if not exists source_key text,
  add column if not exists title text,
  add column if not exists summary text,
  add column if not exists severity text,
  add column if not exists priority text,
  add column if not exists status text default 'open',
  add column if not exists lifecycle_state text,
  add column if not exists assigned_to text,
  add column if not exists related_person_id text,
  add column if not exists related_journey_id text,
  add column if not exists related_order_id text,
  add column if not exists related_conversion_id text,
  add column if not exists related_commission_id text,
  add column if not exists related_connector_id text,
  add column if not exists related_health_finding_id text,
  add column if not exists related_notification_id text,
  add column if not exists deep_link text,
  add column if not exists evidence jsonb default '{}'::jsonb,
  add column if not exists resolution jsonb default '{}'::jsonb,
  add column if not exists first_detected_at timestamptz default now(),
  add column if not exists last_detected_at timestamptz default now(),
  add column if not exists acknowledged_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists dismissed_at timestamptz,
  add column if not exists resolution_code text,
  add column if not exists resolution_note text,
  add column if not exists resolved_by text,
  add column if not exists recurrence_count integer default 0,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.work_items'::regclass
      and conname = 'work_items_status_check'
  ) then
    alter table public.work_items
      add constraint work_items_status_check
      check (status in ('open', 'acknowledged', 'in_progress', 'resolved', 'dismissed')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.work_items'::regclass
      and conname = 'work_items_priority_check'
  ) then
    alter table public.work_items
      add constraint work_items_priority_check
      check (priority in ('urgent', 'high', 'normal', 'low')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.work_items'::regclass
      and conname = 'work_items_severity_check'
  ) then
    alter table public.work_items
      add constraint work_items_severity_check
      check (severity in ('critical', 'warning', 'info', 'healthy')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.work_items'::regclass
      and conname = 'work_items_lifecycle_check'
  ) then
    alter table public.work_items
      add constraint work_items_lifecycle_check
      check (lifecycle_state in ('not_applicable', 'needs_configuration', 'initializing', 'healthy', 'degraded', 'failing', 'resolved')) not valid;
  end if;
end $$;

create unique index if not exists work_items_workspace_source_uidx
  on public.work_items (workspace_id, source, source_key);

create index if not exists work_items_workspace_status_priority_idx
  on public.work_items (workspace_id, status, priority, updated_at desc, id);

create index if not exists work_items_workspace_category_status_idx
  on public.work_items (workspace_id, category, status, updated_at desc, id);

create index if not exists work_items_workspace_assignee_status_idx
  on public.work_items (workspace_id, assigned_to, status, updated_at desc, id);

create index if not exists work_items_workspace_person_status_idx
  on public.work_items (workspace_id, related_person_id, status, updated_at desc)
  where related_person_id is not null;

create index if not exists work_items_workspace_order_status_idx
  on public.work_items (workspace_id, related_order_id, status, updated_at desc)
  where related_order_id is not null;

create index if not exists work_items_workspace_health_idx
  on public.work_items (workspace_id, related_health_finding_id)
  where related_health_finding_id is not null;

create table if not exists public.work_item_activity (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  work_item_id text not null,
  activity_type text not null,
  actor_id text,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.work_item_activity
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists workspace_id text,
  add column if not exists work_item_id text,
  add column if not exists activity_type text,
  add column if not exists actor_id text,
  add column if not exists body text,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

create index if not exists work_item_activity_item_timeline_idx
  on public.work_item_activity (workspace_id, work_item_id, created_at desc, id desc);

alter table public.notification_states
  add column if not exists work_item_id text;

create index if not exists notification_states_workspace_work_item_idx
  on public.notification_states (workspace_id, work_item_id)
  where work_item_id is not null;

comment on table public.work_items is
  'Workspace-scoped operational workflow records synchronized from Health, connector, attribution, commission, and customer evidence.';

comment on column public.work_items.source_key is
  'Stable source-specific identity used with workspace_id and source to prevent duplicate Work Items across sync runs.';

comment on table public.work_item_activity is
  'Audit-style activity timeline for Work Item workflow transitions and notes.';
