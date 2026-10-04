-- WS-019 M5B: presentation state for governed-action notifications.
-- Authoritative lifecycle evidence remains in existing immutable/governed MCP tables.
create table if not exists public.mcp_action_notification_states (
  organization_id uuid not null references public.tracekit_organizations(id),
  notification_id text not null,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, notification_id)
);
alter table public.mcp_action_notification_states enable row level security;
revoke all on table public.mcp_action_notification_states from public,anon,authenticated,authenticator;
grant select,insert,update on table public.mcp_action_notification_states to service_role;
create index if not exists mcp_action_notification_states_org_updated_idx on public.mcp_action_notification_states(organization_id,updated_at desc);
comment on table public.mcp_action_notification_states is 'Presentation-only read/dismiss state for governed-action notifications; action lifecycle truth remains in MCP intent/confirmation/execution/recovery records.';
