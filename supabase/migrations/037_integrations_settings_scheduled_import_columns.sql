-- Scheduled import settings used by the deployed integration scheduler.
-- This migration is intentionally additive: it preserves the existing
-- integrations_settings table, rows, and columns.

do $$
declare
  lookback_column_missing boolean;
begin
  select not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'integrations_settings'
      and column_name = 'auto_import_lookback_hours'
  )
  into lookback_column_missing;

  alter table public.integrations_settings
    add column if not exists auto_import_enabled boolean not null default false,
    add column if not exists auto_import_interval_minutes integer not null default 60,
    add column if not exists auto_import_lookback_hours integer not null default 2,
    add column if not exists last_run_at timestamptz,
    add column if not exists last_success_at timestamptz,
    add column if not exists last_error text;

  -- When auto_import_lookback_hours is newly added, existing rows receive the
  -- table default first. Replace that one-time default with the connector
  -- defaults used by the application. On rerun, leave existing values intact.
  if lookback_column_missing then
    update public.integrations_settings
    set auto_import_lookback_hours = case
      when platform = 'wowsuite:wowboost' then 72
      when platform = 'wowboost' then 72
      when platform = 'wowsuite' then 72
      when platform = 'paypal' or platform like 'paypal:%' then 30
      when platform like 'nmi:%' or platform = 'paydiverse' or platform like 'paydiverse:%' then 30
      else 2
    end;
  else
    update public.integrations_settings
    set auto_import_lookback_hours = case
      when platform = 'wowsuite:wowboost' then 72
      when platform = 'wowboost' then 72
      when platform = 'wowsuite' then 72
      when platform = 'paypal' or platform like 'paypal:%' then 30
      when platform like 'nmi:%' or platform = 'paydiverse' or platform like 'paydiverse:%' then 30
      else 2
    end
    where auto_import_lookback_hours is null;
  end if;
end $$;
