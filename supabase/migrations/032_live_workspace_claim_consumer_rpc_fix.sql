-- Live Workspace projection claim RPC fix.
--
-- Migration 031 introduced the durable consumer lease RPC. In production, the
-- plpgsql return column names can collide with table column names unless every
-- selected column is explicitly qualified and aliased. This replacement keeps
-- the same function signature, behavior, and return shape while removing that
-- ambiguity.

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
declare
  v_claimed boolean := false;
  v_updated_rows integer := 0;
begin
  insert into public.domain_event_consumer_state as inserted_state (
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
  on conflict on constraint domain_event_consumer_state_pkey do nothing;

  update public.domain_event_consumer_state as state_row
  set
    lease_owner = p_runner_id,
    lease_expires_at = p_lease_expires_at,
    last_run_at = p_now,
    updated_at = p_now
  where state_row.workspace_id = p_workspace_id
    and state_row.consumer_name = p_consumer_name
    and (
      state_row.lease_owner is null
      or state_row.lease_expires_at is null
      or state_row.lease_expires_at <= p_now
      or state_row.lease_owner = p_runner_id
    );

  get diagnostics v_updated_rows = row_count;
  v_claimed := v_updated_rows > 0;

  return query
  select
    v_claimed as claimed,
    state_row.consumer_name as consumer_name,
    state_row.workspace_id as workspace_id,
    state_row.last_event_position as last_event_position,
    state_row.last_processed_at as last_processed_at,
    state_row.last_error as last_error,
    state_row.updated_at as updated_at,
    state_row.lease_owner as lease_owner,
    state_row.lease_expires_at as lease_expires_at,
    state_row.last_run_at as last_run_at,
    state_row.last_successful_run_at as last_successful_run_at,
    state_row.last_failed_at as last_failed_at,
    state_row.consecutive_failures as consecutive_failures,
    state_row.metadata as metadata
  from public.domain_event_consumer_state as state_row
  where state_row.workspace_id = p_workspace_id
    and state_row.consumer_name = p_consumer_name;
end;
$$;
