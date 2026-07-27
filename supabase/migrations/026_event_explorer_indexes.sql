-- Event Explorer read-path indexes.
--
-- These indexes are additive and support server-side pagination/filtering for
-- the read-only /v1/events explorer. They do not change browser normalization,
-- identity resolution, journey construction, attribution, or payout behavior.

create index if not exists browser_events_raw_explorer_status_time_idx
  on public.browser_events_raw (workspace_id, normalization_status, event_time desc, id desc);

create index if not exists browser_events_raw_explorer_type_time_idx
  on public.browser_events_raw (workspace_id, normalized_event_type, event_time desc, id desc)
  where normalized_event_type is not null;

create index if not exists browser_events_raw_explorer_source_time_idx
  on public.browser_events_raw (workspace_id, source, event_time desc, id desc);

create index if not exists journey_events_explorer_type_time_idx
  on public.journey_events (workspace_id, event_type, event_time desc, id desc);

create index if not exists journey_events_explorer_source_platform_time_idx
  on public.journey_events (workspace_id, source_platform, event_time desc, id desc);

create index if not exists journey_events_explorer_affiliate_time_idx
  on public.journey_events (workspace_id, affiliate_id, event_time desc, id desc)
  where affiliate_id is not null;
