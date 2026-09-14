-- Operational routing outcomes only. No provider payload or canonical identity is retained.
create table public.everflow_firehose_routing_observations (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'everflow' check (provider = 'everflow'),
  event_type text not null check (event_type in ('click', 'conversion', 'conversion_update')),
  network_id text not null check (char_length(network_id) between 1 and 128),
  routing_result text not null check (routing_result in ('resolved', 'unknown_network', 'ambiguous_network', 'routing_unavailable')),
  received_at timestamptz not null,
  observed_at timestamptz not null default now()
);

create index everflow_firehose_routing_observations_observed_at_idx
  on public.everflow_firehose_routing_observations (observed_at);
create index everflow_firehose_routing_observations_network_observed_idx
  on public.everflow_firehose_routing_observations (network_id, observed_at desc);

alter table public.everflow_firehose_routing_observations enable row level security;
revoke all on public.everflow_firehose_routing_observations from public, anon, authenticated;
grant select, insert on public.everflow_firehose_routing_observations to service_role;

-- Daily operational retention: observations expire after 14 days, independent of
-- canonical Firehose Evidence and without touching queue or polling state.
select cron.schedule(
  'tracekit-everflow-firehose-routing-observation-retention',
  '15 3 * * *',
  $$delete from public.everflow_firehose_routing_observations
      where observed_at < now() - interval '14 days';$$
);
