-- Browser Touchpoint Ingestion v1.
-- Additive raw-event storage and public browser ingestion configuration.
--
-- Production already has public.events_raw from the earlier browser collector:
--   id, session_id, type, payload, created_at, site_key, tkid, ts, url,
--   referrer, event, utm_*, click_ids, identity, meta.
--
-- This migration must therefore upgrade events_raw in place. Do not drop,
-- rename, truncate, or recreate the table; preserve legacy columns and rows.

create extension if not exists pgcrypto;

-- New installs get a minimal table first. Existing production tables are left
-- untouched here and are upgraded by the ALTER TABLE statements below.
create table if not exists public.events_raw (
  id uuid primary key default gen_random_uuid()
);

alter table public.events_raw add column if not exists event_id text;
alter table public.events_raw add column if not exists workspace_id text default 'default';
alter table public.events_raw add column if not exists received_at timestamptz default now();
alter table public.events_raw add column if not exists event_time timestamptz;
alter table public.events_raw add column if not exists event_type text;
alter table public.events_raw add column if not exists normalized_event_type text;
alter table public.events_raw add column if not exists tkid text;
alter table public.events_raw add column if not exists session_id text;
alter table public.events_raw add column if not exists source text default 'public_event_api';
alter table public.events_raw add column if not exists schema_version integer default 1;
alter table public.events_raw add column if not exists raw_payload jsonb default '{}'::jsonb;
alter table public.events_raw add column if not exists request_context jsonb default '{}'::jsonb;
alter table public.events_raw add column if not exists payload_hash text;
alter table public.events_raw add column if not exists normalization_status text default 'pending';
alter table public.events_raw add column if not exists normalization_error text;
alter table public.events_raw add column if not exists normalization_job_id uuid;
alter table public.events_raw add column if not exists normalized_journey_event_id uuid references public.journey_events(id) on delete set null;
alter table public.events_raw add column if not exists person_id uuid references public.people(id) on delete set null;
alter table public.events_raw add column if not exists journey_id uuid references public.journeys(id) on delete set null;
alter table public.events_raw add column if not exists normalization_attempts integer default 0;
alter table public.events_raw add column if not exists normalized_at timestamptz;
alter table public.events_raw add column if not exists created_at timestamptz default now();
alter table public.events_raw add column if not exists updated_at timestamptz default now();

comment on table public.events_raw is
  'Append-only browser raw events. Includes legacy collector columns plus canonical Browser Touchpoint Ingestion v1 columns.';

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events_raw' and column_name = 'site_key'
  ) then
    comment on column public.events_raw.site_key is
      'Legacy collector workspace/site key. Browser Touchpoint Ingestion v1 backfills workspace_id from this column when present.';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events_raw' and column_name = 'payload'
  ) then
    comment on column public.events_raw.payload is
      'Legacy collector raw payload. Browser Touchpoint Ingestion v1 backfills raw_payload from this column when present.';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events_raw' and column_name = 'ts'
  ) then
    comment on column public.events_raw.ts is
      'Legacy collector client timestamp. Browser Touchpoint Ingestion v1 backfills event_time from this column when present.';
  end if;
end $$;

-- Backfill canonical fields from the legacy collector columns. Column checks are
-- guarded so this remains safe on fresh installs and after partial migration
-- failures. Type-sensitive timestamp conversion avoids assuming legacy ts is
-- always timestamptz.
do $$
declare
  v_site_key_exists boolean;
  v_payload_exists boolean;
  v_event_exists boolean;
  v_type_exists boolean;
  v_created_at_exists boolean;
  v_created_at_data_type text;
  v_created_at_udt_name text;
  v_ts_exists boolean;
  v_ts_data_type text;
  v_ts_udt_name text;
  v_event_expr text;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events_raw' and column_name = 'site_key'
  ) into v_site_key_exists;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events_raw' and column_name = 'payload'
  ) into v_payload_exists;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events_raw' and column_name = 'event'
  ) into v_event_exists;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events_raw' and column_name = 'type'
  ) into v_type_exists;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events_raw' and column_name = 'created_at'
  ) into v_created_at_exists;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events_raw' and column_name = 'ts'
  ) into v_ts_exists;

  if v_site_key_exists then
    update public.events_raw
       set workspace_id = coalesce(nullif(btrim(site_key::text), ''), 'default')
     where workspace_id is null or btrim(workspace_id) = '';
  end if;

  update public.events_raw
     set workspace_id = 'default'
   where workspace_id is null or btrim(workspace_id) = '';

  update public.events_raw
     set event_id = 'legacy_' || id::text
   where event_id is null or btrim(event_id) = '';

  if v_created_at_exists then
    select data_type, udt_name
      into v_created_at_data_type, v_created_at_udt_name
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'events_raw'
       and column_name = 'created_at';

    if v_created_at_data_type in ('timestamp with time zone', 'timestamp without time zone', 'date') then
      update public.events_raw
         set received_at = created_at::timestamptz
       where received_at is null and created_at is not null;
    elsif v_created_at_data_type in ('integer', 'bigint', 'numeric', 'double precision', 'real') then
      update public.events_raw
         set received_at = to_timestamp(
           case
             when abs(created_at::numeric) > 100000000000 then created_at::numeric / 1000
             else created_at::numeric
           end
         )
       where received_at is null and created_at is not null;
    elsif v_created_at_data_type in ('text', 'character varying', 'character') then
      update public.events_raw
         set received_at = created_at::timestamptz
       where received_at is null
         and created_at is not null
         and btrim(created_at::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}';
    end if;
  end if;

  update public.events_raw
     set received_at = now()
   where received_at is null;

  if v_ts_exists then
    select data_type, udt_name
      into v_ts_data_type, v_ts_udt_name
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'events_raw'
       and column_name = 'ts';

    if v_ts_data_type in ('timestamp with time zone', 'timestamp without time zone', 'date') then
      update public.events_raw
         set event_time = ts::timestamptz
       where event_time is null and ts is not null;
    elsif v_ts_data_type in ('integer', 'bigint', 'numeric', 'double precision', 'real') then
      update public.events_raw
         set event_time = to_timestamp(
           case
             when abs(ts::numeric) > 100000000000 then ts::numeric / 1000
             else ts::numeric
           end
         )
       where event_time is null and ts is not null;
    elsif v_ts_data_type in ('text', 'character varying', 'character') then
      update public.events_raw
         set event_time = ts::timestamptz
       where event_time is null
         and ts is not null
         and btrim(ts::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}';
    end if;
  end if;

  update public.events_raw
     set event_time = received_at
   where event_time is null;

  v_event_expr := '''custom''';
  if v_type_exists then
    v_event_expr := format('coalesce(nullif(btrim(%I::text), ''''), %s)', 'type', v_event_expr);
  end if;
  if v_event_exists then
    v_event_expr := format('coalesce(nullif(btrim(%I::text), ''''), %s)', 'event', v_event_expr);
  end if;

  execute 'update public.events_raw set event_type = ' || v_event_expr ||
    ' where event_type is null or btrim(event_type) = ''''';

  update public.events_raw
     set event_type = 'custom'
   where event_type is null or btrim(event_type) = '';

  update public.events_raw
     set normalized_event_type =
       case lower(btrim(event_type))
         when 'page_view' then 'page_view'
         when 'pageview' then 'page_view'
         when 'page.view' then 'page_view'
         when 'click' then 'click'
         when 'outbound_click' then 'click'
         when 'identify' then 'identify'
         when 'lead' then 'lead'
         when 'form_submit' then 'lead'
         when 'checkout_started' then 'checkout_started'
         when 'initiate_checkout' then 'checkout_started'
         when 'custom' then 'custom'
         else 'custom'
       end
   where normalized_event_type is null or btrim(normalized_event_type) = '';

  if v_payload_exists then
    update public.events_raw
       set raw_payload = coalesce(to_jsonb(payload), '{}'::jsonb)
     where raw_payload is null or raw_payload = '{}'::jsonb;
  end if;

  update public.events_raw
     set raw_payload = '{}'::jsonb
   where raw_payload is null;

  update public.events_raw
     set request_context = '{}'::jsonb
   where request_context is null;

  update public.events_raw
     set source = 'legacy_browser_event'
   where source is null
      or btrim(source) = ''
      or (source = 'public_event_api' and event_id like 'legacy_%');

  update public.events_raw
     set schema_version = 1
   where schema_version is null;

  update public.events_raw
     set normalization_status = 'pending'
   where normalization_status is null or btrim(normalization_status) = '';

  update public.events_raw
     set normalization_attempts = 0
   where normalization_attempts is null;

  if v_created_at_exists then
    if v_created_at_data_type in ('timestamp with time zone', 'timestamp without time zone', 'date') then
      update public.events_raw
         set updated_at = created_at::timestamptz
       where updated_at is null and created_at is not null;
    elsif v_created_at_data_type in ('integer', 'bigint', 'numeric', 'double precision', 'real') then
      update public.events_raw
         set updated_at = to_timestamp(
           case
             when abs(created_at::numeric) > 100000000000 then created_at::numeric / 1000
             else created_at::numeric
           end
         )
       where updated_at is null and created_at is not null;
    elsif v_created_at_data_type in ('text', 'character varying', 'character') then
      update public.events_raw
         set updated_at = created_at::timestamptz
       where updated_at is null
         and created_at is not null
         and btrim(created_at::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}';
    end if;
  end if;

  if v_created_at_exists and v_created_at_data_type in ('timestamp with time zone', 'timestamp without time zone', 'date') then
    update public.events_raw
       set created_at = now()
     where created_at is null;
  end if;

  update public.events_raw
     set updated_at = now()
   where updated_at is null;
end $$;

-- Apply NOT NULL constraints only after backfill. These checks keep reruns safe
-- and fail loudly if an unexpected legacy type prevented a canonical value from
-- being populated.
do $$
begin
  if exists (
    select 1 from public.events_raw
     where event_id is null
        or btrim(event_id) = ''
        or workspace_id is null
        or btrim(workspace_id) = ''
        or received_at is null
        or event_type is null
        or btrim(event_type) = ''
        or source is null
        or btrim(source) = ''
        or schema_version is null
        or raw_payload is null
        or request_context is null
        or normalization_status is null
        or normalization_attempts is null
        or created_at is null
        or updated_at is null
  ) then
    raise exception 'events_raw canonical backfill left required columns null or blank';
  end if;

  alter table public.events_raw alter column event_id set not null;
  alter table public.events_raw alter column workspace_id set not null;
  alter table public.events_raw alter column received_at set not null;
  alter table public.events_raw alter column event_type set not null;
  alter table public.events_raw alter column source set not null;
  alter table public.events_raw alter column schema_version set not null;
  alter table public.events_raw alter column raw_payload set not null;
  alter table public.events_raw alter column request_context set not null;
  alter table public.events_raw alter column normalization_status set not null;
  alter table public.events_raw alter column normalization_attempts set not null;
  alter table public.events_raw alter column created_at set not null;
  alter table public.events_raw alter column updated_at set not null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.events_raw'::regclass
       and conname = 'events_raw_event_id_check'
  ) then
    alter table public.events_raw
      add constraint events_raw_event_id_check check (length(btrim(event_id)) > 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.events_raw'::regclass
       and conname = 'events_raw_workspace_id_check'
  ) then
    alter table public.events_raw
      add constraint events_raw_workspace_id_check check (length(btrim(workspace_id)) > 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.events_raw'::regclass
       and conname = 'events_raw_source_check'
  ) then
    alter table public.events_raw
      add constraint events_raw_source_check check (length(btrim(source)) > 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.events_raw'::regclass
       and conname = 'events_raw_status_check'
  ) then
    alter table public.events_raw
      add constraint events_raw_status_check check (
        normalization_status in (
          'pending',
          'processing',
          'normalized',
          'duplicate',
          'invalid',
          'unsupported',
          'error',
          'review'
        )
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.events_raw'::regclass
       and conname = 'events_raw_browser_event_type_check'
  ) then
    alter table public.events_raw
      add constraint events_raw_browser_event_type_check check (
        normalized_event_type is null or normalized_event_type in (
          'page_view',
          'click',
          'identify',
          'lead',
          'checkout_started',
          'custom'
        )
      ) not valid;
  end if;
end $$;

alter table public.events_raw validate constraint events_raw_event_id_check;
alter table public.events_raw validate constraint events_raw_workspace_id_check;
alter table public.events_raw validate constraint events_raw_source_check;
alter table public.events_raw validate constraint events_raw_status_check;
alter table public.events_raw validate constraint events_raw_browser_event_type_check;

create unique index if not exists events_raw_workspace_event_uidx
  on public.events_raw (workspace_id, event_id);

create index if not exists events_raw_normalization_scan_idx
  on public.events_raw (workspace_id, normalization_status, received_at, event_id);

create index if not exists events_raw_workspace_tkid_event_time_idx
  on public.events_raw (workspace_id, tkid, event_time, event_id)
  where tkid is not null;

create index if not exists events_raw_workspace_session_event_time_idx
  on public.events_raw (workspace_id, session_id, event_time, event_id)
  where session_id is not null;

create index if not exists events_raw_workspace_event_time_idx
  on public.events_raw (workspace_id, event_time, event_id);

create table if not exists public.browser_event_sources (
  workspace_id text primary key,
  public_write_key_hash text not null,
  allowed_origins text[] not null default '{}',
  cross_subdomain_cookie_domain text,
  rate_limit_per_minute integer not null default 120,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint browser_event_sources_workspace_id_check check (length(btrim(workspace_id)) > 0),
  constraint browser_event_sources_write_key_hash_check check (length(btrim(public_write_key_hash)) > 0),
  constraint browser_event_sources_rate_limit_check check (rate_limit_per_minute > 0)
);

create index if not exists browser_event_sources_active_idx
  on public.browser_event_sources (workspace_id)
  where is_active = true;

-- Use only real production journey_events columns: workspace_id, metadata,
-- event_time, id, and source_platform.
create index if not exists journey_events_browser_tkid_idx
  on public.journey_events (workspace_id, ((metadata->>'tkid')), event_time, id)
  where source_platform = 'browser' and metadata ? 'tkid';
