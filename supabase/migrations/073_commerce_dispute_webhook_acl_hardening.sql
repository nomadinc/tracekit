-- Tighten service_role privileges left broad by the systemic table ACL baseline.
-- Ownership remains unchanged; this migration changes no data or schema.

revoke all on public.commerce_dispute_webhook_events,
  public.commerce_provider_disputes,
  public.commerce_provider_dispute_lifecycle_events
from service_role, public, anon, authenticated;

grant select, insert on public.commerce_dispute_webhook_events to service_role;
grant select, insert, update on public.commerce_provider_disputes to service_role;
grant select, insert on public.commerce_provider_dispute_lifecycle_events to service_role;

alter table public.commerce_dispute_webhook_events enable row level security;
alter table public.commerce_provider_disputes enable row level security;
alter table public.commerce_provider_dispute_lifecycle_events enable row level security;
