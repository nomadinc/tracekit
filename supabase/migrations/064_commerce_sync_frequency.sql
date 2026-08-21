-- Per-connection cadence for the single five-minute scheduler.
-- Disabled by default through the existing schedule activation controls.
alter table public.commerce_sync_schedules
  add column sync_frequency text not null default 'hourly',
  add constraint commerce_sync_schedules_frequency_check
    check (sync_frequency in ('hourly','30_minutes','15_minutes','5_minutes','manual'));

comment on column public.commerce_sync_schedules.sync_frequency is
  'Automatic cadence selected for this connection; manual is never cron-selected.';
