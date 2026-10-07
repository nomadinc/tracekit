-- WS-019 M4.4: converge presentation-state privileges after platform default
-- privileges granted service_role broader access when the table was created.
-- This migration is deliberately table-specific; it does not alter defaults.

revoke all privileges on table public.mcp_action_notification_states
  from service_role;

revoke all privileges on table public.mcp_action_notification_states
  from public, anon, authenticated, authenticator;

grant select, insert, update on table public.mcp_action_notification_states
  to service_role;
