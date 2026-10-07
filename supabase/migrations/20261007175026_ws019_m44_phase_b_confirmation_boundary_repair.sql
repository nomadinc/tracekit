-- WS-019 M4.4 Phase B confirmation-boundary repair.
--
-- M3 intentionally revokes direct INSERT on mcp_action_confirmations from
-- service_role.  The fixed acceptance fixture nevertheless needs to insert
-- its predetermined confirmation rows.  Elevate only the two fixed-purpose
-- fixture functions that perform those inserts; their existing bodies remain
-- hard-bound to Stem Labs and deterministic fixture identities.

alter function public.create_ws019_m44_phase_b_fixture(uuid, uuid)
  security definer;
alter function public.resolve_ws019_m44_phase_b_awaiting(uuid, uuid)
  security definer;

alter function public.create_ws019_m44_phase_b_fixture(uuid, uuid)
  owner to postgres;
alter function public.resolve_ws019_m44_phase_b_awaiting(uuid, uuid)
  owner to postgres;

-- Reassert the complete callable boundary after changing function security.
alter function public.create_ws019_m44_phase_b_fixture(uuid, uuid)
  set search_path = public, pg_temp;
alter function public.resolve_ws019_m44_phase_b_awaiting(uuid, uuid)
  set search_path = public, pg_temp;

revoke all on function public.create_ws019_m44_phase_b_fixture(uuid, uuid)
  from public, anon, authenticated, authenticator;
revoke all on function public.resolve_ws019_m44_phase_b_awaiting(uuid, uuid)
  from public, anon, authenticated, authenticator;
grant execute on function public.create_ws019_m44_phase_b_fixture(uuid, uuid)
  to service_role;
grant execute on function public.resolve_ws019_m44_phase_b_awaiting(uuid, uuid)
  to service_role;

-- Preserve the certified M3 table boundary explicitly.  Normal confirmation
-- writes still cannot bypass confirm_mcp_action_intent_atomic.
revoke insert on table public.mcp_action_confirmations from service_role;

comment on function public.create_ws019_m44_phase_b_fixture(uuid, uuid) is
  'Creates only the fixed Stem Labs WS-019 M4.4 Phase B acceptance fixture; SECURITY DEFINER is limited to deterministic acceptance records.';
comment on function public.resolve_ws019_m44_phase_b_awaiting(uuid, uuid) is
  'Resolves only the fixed Stem Labs WS-019 M4.4 awaiting-approval acceptance fixture; no arbitrary confirmation input is accepted.';
