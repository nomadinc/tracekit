-- Converge the Migration-055 tombstone trigger guard to owner-only execution.
-- Function definitions, ownership, trigger metadata, and default privileges are unchanged.

revoke all privileges on function
  public.erase_tkid_relay_on_journey_tombstone()
from public, anon, authenticated, service_role;
