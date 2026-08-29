-- Everflow event/reversal state history.
-- Preserves distinct provider states while the main evidence table remains the latest-state projection.

create table if not exists public.everflow_conversion_state_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  sync_run_id uuid not null,
  source_identity text not null,
  conversion_id text not null,
  transaction_id text,
  conversion_at timestamptz not null,
  is_event boolean not null default false,
  event_name text,
  previous_status text,
  status text,
  transition_type text not null,
  payload_hash text not null,
  previous_payload_hash text,
  revenue numeric,
  payout numeric,
  effective_revenue numeric not null default 0,
  effective_payout numeric not null default 0,
  revenue_delta numeric not null default 0,
  payout_delta numeric not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  observation_count integer not null default 1,
  constraint everflow_conversion_state_history_provider_account_fk
    foreign key (organization_id, connection_id, provider_account_id)
    references public.commerce_provider_accounts (organization_id, connection_id, id),
  constraint everflow_conversion_state_history_sync_run_fk
    foreign key (organization_id, connection_id, provider_account_id, sync_run_id)
    references public.commerce_sync_runs (organization_id, connection_id, provider_account_id, id),
  constraint everflow_conversion_state_history_payload_hash_check
    check (payload_hash ~ '^[0-9a-f]{64}$'),
  constraint everflow_conversion_state_history_previous_payload_hash_check
    check (previous_payload_hash is null or previous_payload_hash ~ '^[0-9a-f]{64}$'),
  constraint everflow_conversion_state_history_transition_check
    check (transition_type in ('observed','approved','rejected','reversal','reinstated','updated','unchanged')),
  constraint everflow_conversion_state_history_observation_count_check
    check (observation_count >= 1)
);

create unique index if not exists everflow_conversion_state_history_identity_uidx
  on public.everflow_conversion_state_history
    (connection_id, provider_account_id, source_identity, payload_hash);

create index if not exists everflow_conversion_state_history_time_idx
  on public.everflow_conversion_state_history
    (organization_id, connection_id, provider_account_id, conversion_at desc);

create index if not exists everflow_conversion_state_history_transition_idx
  on public.everflow_conversion_state_history
    (organization_id, connection_id, transition_type, last_seen_at desc);

alter table public.everflow_conversion_state_history enable row level security;
revoke all on table public.everflow_conversion_state_history from anon, authenticated;
grant select, insert, update, delete on table public.everflow_conversion_state_history to service_role;

comment on table public.everflow_conversion_state_history is
  'Protected Everflow state-transition evidence. The latest-state projection remains everflow_conversion_events; this table preserves distinct observed states and financial deltas.';
comment on column public.everflow_conversion_state_history.revenue_delta is
  'Change in effective approved revenue from the previous observed provider state. Approved-to-rejected transitions are negative reversals.';
comment on column public.everflow_conversion_state_history.payout_delta is
  'Change in effective approved payout from the previous observed provider state. Approved-to-rejected transitions are negative reversals.';
