-- Browser Touchpoint Ingestion v1 canonical raw ledger.
--
-- public.events_raw remains a legacy intake/archive table. New browser events
-- are written to public.browser_events_raw only.

create extension if not exists pgcrypto;

create table if not exists public.browser_events_raw (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  workspace_id text not null default 'default',
  received_at timestamptz not null default now(),
  event_time timestamptz not null default now(),
  event_type text not null,
  normalized_event_type text,
  tkid text,
  session_id text,
  person_id uuid references public.people(id) on delete set null,
  journey_id uuid references public.journeys(id) on delete set null,
  source text not null default 'browser_sdk',
  schema_version integer not null default 1,
  raw_payload jsonb not null default '{}'::jsonb,
  request_context jsonb not null default '{}'::jsonb,
  payload_hash text,
  normalization_status text not null default 'pending',
  normalization_error text,
  normalization_attempts integer not null default 0,
  normalization_job_id uuid,
  normalized_journey_event_id uuid references public.journey_events(id) on delete set null,
  normalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.browser_events_raw add column if not exists event_id text;
alter table public.browser_events_raw add column if not exists workspace_id text default 'default';
alter table public.browser_events_raw add column if not exists received_at timestamptz default now();
alter table public.browser_events_raw add column if not exists event_time timestamptz default now();
alter table public.browser_events_raw add column if not exists event_type text;
alter table public.browser_events_raw add column if not exists normalized_event_type text;
alter table public.browser_events_raw add column if not exists tkid text;
alter table public.browser_events_raw add column if not exists session_id text;
alter table public.browser_events_raw add column if not exists person_id uuid references public.people(id) on delete set null;
alter table public.browser_events_raw add column if not exists journey_id uuid references public.journeys(id) on delete set null;
alter table public.browser_events_raw add column if not exists source text default 'browser_sdk';
alter table public.browser_events_raw add column if not exists schema_version integer default 1;
alter table public.browser_events_raw add column if not exists raw_payload jsonb default '{}'::jsonb;
alter table public.browser_events_raw add column if not exists request_context jsonb default '{}'::jsonb;
alter table public.browser_events_raw add column if not exists payload_hash text;
alter table public.browser_events_raw add column if not exists normalization_status text default 'pending';
alter table public.browser_events_raw add column if not exists normalization_error text;
alter table public.browser_events_raw add column if not exists normalization_attempts integer default 0;
alter table public.browser_events_raw add column if not exists normalization_job_id uuid;
alter table public.browser_events_raw add column if not exists normalized_journey_event_id uuid references public.journey_events(id) on delete set null;
alter table public.browser_events_raw add column if not exists normalized_at timestamptz;
alter table public.browser_events_raw add column if not exists created_at timestamptz default now();
alter table public.browser_events_raw add column if not exists updated_at timestamptz default now();

update public.browser_events_raw
   set workspace_id = 'default'
 where workspace_id is null or btrim(workspace_id) = '';

update public.browser_events_raw
   set event_id = 'event_' || id::text
 where event_id is null or btrim(event_id) = '';

update public.browser_events_raw
   set received_at = now()
 where received_at is null;

update public.browser_events_raw
   set event_time = received_at
 where event_time is null;

update public.browser_events_raw
   set event_type = coalesce(nullif(btrim(normalized_event_type), ''), 'custom')
 where event_type is null or btrim(event_type) = '';

update public.browser_events_raw
   set source = 'browser_sdk'
 where source is null or btrim(source) = '';

update public.browser_events_raw
   set schema_version = 1
 where schema_version is null;

update public.browser_events_raw
   set raw_payload = '{}'::jsonb
 where raw_payload is null;

update public.browser_events_raw
   set request_context = '{}'::jsonb
 where request_context is null;

update public.browser_events_raw
   set normalization_status = 'pending'
 where normalization_status is null or btrim(normalization_status) = '';

update public.browser_events_raw
   set normalization_attempts = 0
 where normalization_attempts is null;

update public.browser_events_raw
   set created_at = now()
 where created_at is null;

update public.browser_events_raw
   set updated_at = now()
 where updated_at is null;

do $$
begin
  alter table public.browser_events_raw alter column event_id set not null;
  alter table public.browser_events_raw alter column workspace_id set not null;
  alter table public.browser_events_raw alter column received_at set not null;
  alter table public.browser_events_raw alter column event_time set not null;
  alter table public.browser_events_raw alter column event_type set not null;
  alter table public.browser_events_raw alter column source set not null;
  alter table public.browser_events_raw alter column schema_version set not null;
  alter table public.browser_events_raw alter column raw_payload set not null;
  alter table public.browser_events_raw alter column request_context set not null;
  alter table public.browser_events_raw alter column normalization_status set not null;
  alter table public.browser_events_raw alter column normalization_attempts set not null;
  alter table public.browser_events_raw alter column created_at set not null;
  alter table public.browser_events_raw alter column updated_at set not null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.browser_events_raw'::regclass
       and conname = 'browser_events_raw_event_id_check'
  ) then
    alter table public.browser_events_raw
      add constraint browser_events_raw_event_id_check check (length(btrim(event_id)) > 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.browser_events_raw'::regclass
       and conname = 'browser_events_raw_workspace_id_check'
  ) then
    alter table public.browser_events_raw
      add constraint browser_events_raw_workspace_id_check check (length(btrim(workspace_id)) > 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.browser_events_raw'::regclass
       and conname = 'browser_events_raw_source_check'
  ) then
    alter table public.browser_events_raw
      add constraint browser_events_raw_source_check check (length(btrim(source)) > 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.browser_events_raw'::regclass
       and conname = 'browser_events_raw_status_check'
  ) then
    alter table public.browser_events_raw
      add constraint browser_events_raw_status_check check (
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
     where conrelid = 'public.browser_events_raw'::regclass
       and conname = 'browser_events_raw_browser_event_type_check'
  ) then
    alter table public.browser_events_raw
      add constraint browser_events_raw_browser_event_type_check check (
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

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.browser_events_raw'::regclass
       and conname = 'browser_events_raw_schema_version_check'
  ) then
    alter table public.browser_events_raw
      add constraint browser_events_raw_schema_version_check check (schema_version > 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.browser_events_raw'::regclass
       and conname = 'browser_events_raw_attempts_check'
  ) then
    alter table public.browser_events_raw
      add constraint browser_events_raw_attempts_check check (normalization_attempts >= 0) not valid;
  end if;
end $$;

alter table public.browser_events_raw validate constraint browser_events_raw_event_id_check;
alter table public.browser_events_raw validate constraint browser_events_raw_workspace_id_check;
alter table public.browser_events_raw validate constraint browser_events_raw_source_check;
alter table public.browser_events_raw validate constraint browser_events_raw_status_check;
alter table public.browser_events_raw validate constraint browser_events_raw_browser_event_type_check;
alter table public.browser_events_raw validate constraint browser_events_raw_schema_version_check;
alter table public.browser_events_raw validate constraint browser_events_raw_attempts_check;

create unique index if not exists browser_events_raw_workspace_event_uidx
  on public.browser_events_raw (workspace_id, event_id);

create index if not exists browser_events_raw_normalization_scan_idx
  on public.browser_events_raw (workspace_id, normalization_status, received_at, event_id);

create index if not exists browser_events_raw_workspace_tkid_event_time_idx
  on public.browser_events_raw (workspace_id, tkid, event_time, event_id)
  where tkid is not null;

create index if not exists browser_events_raw_workspace_session_event_time_idx
  on public.browser_events_raw (workspace_id, session_id, event_time, event_id)
  where session_id is not null;

create index if not exists browser_events_raw_workspace_event_time_idx
  on public.browser_events_raw (workspace_id, event_time, event_id);

create index if not exists browser_events_raw_normalized_journey_event_idx
  on public.browser_events_raw (normalized_journey_event_id)
  where normalized_journey_event_id is not null;

create index if not exists browser_events_raw_person_idx
  on public.browser_events_raw (workspace_id, person_id)
  where person_id is not null;

create index if not exists browser_events_raw_journey_idx
  on public.browser_events_raw (workspace_id, journey_id)
  where journey_id is not null;

comment on table public.browser_events_raw is
  'Canonical Browser Touchpoint Ingestion v1 append-only raw ledger. public.events_raw is legacy archive/intake and is not used by the v1 browser path.';

comment on column public.browser_events_raw.session_id is
  'Browser SDK session identifier. Text by design, e.g. tks_..., to avoid legacy events_raw bigint semantics.';

-- Optional explicit legacy bridge.
-- Disabled by default: this function is created but never invoked by migration.
-- It copies only legacy rows that migration 020 marked as legacy_browser_event or
-- deterministic legacy_* records, preserving original payload/timestamps and
-- casting legacy session_id values to text. Run manually only after deciding to
-- normalize selected legacy events through Browser Touchpoint v1.
create or replace function public.copy_legacy_events_raw_to_browser_events_raw(p_limit integer default 1000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
begin
  insert into public.browser_events_raw (
    event_id,
    workspace_id,
    received_at,
    event_time,
    event_type,
    normalized_event_type,
    tkid,
    session_id,
    source,
    schema_version,
    raw_payload,
    request_context,
    payload_hash,
    normalization_status,
    normalization_attempts,
    created_at,
    updated_at
  )
  select
    coalesce(nullif(btrim(er.event_id), ''), 'legacy_' || er.id::text),
    coalesce(nullif(btrim(er.workspace_id), ''), 'default'),
    er.received_at,
    coalesce(er.event_time, er.received_at),
    coalesce(nullif(btrim(er.event_type), ''), 'custom'),
    case
      when er.normalized_event_type in ('page_view', 'click', 'identify', 'lead', 'checkout_started', 'custom')
        then er.normalized_event_type
      else 'custom'
    end,
    nullif(btrim(er.tkid::text), ''),
    nullif(btrim(er.session_id::text), ''),
    'legacy_events_raw',
    1,
    coalesce(er.raw_payload, '{}'::jsonb),
    coalesce(er.request_context, '{}'::jsonb),
    er.payload_hash,
    'pending',
    0,
    coalesce(er.created_at, now()),
    coalesce(er.updated_at, er.created_at, now())
  from public.events_raw er
  where (er.source = 'legacy_browser_event' or er.event_id like 'legacy_%')
    and er.event_id is not null
  order by er.received_at, er.event_id
  limit greatest(1, least(coalesce(p_limit, 1000), 10000))
  on conflict (workspace_id, event_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end $$;
