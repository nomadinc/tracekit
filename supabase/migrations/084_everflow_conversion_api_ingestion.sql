-- Everflow live conversion ingestion v1.
-- Extends the protected historical conversion evidence table instead of creating a parallel live-conversion store.

alter table public.everflow_conversion_events
  alter column id set default gen_random_uuid(),
  alter column import_id drop not null,
  alter column source_row drop not null,
  drop constraint if exists everflow_conversion_events_source_row_check,
  add column provider_account_id uuid,
  add column sync_run_id uuid,
  add column ingestion_method text not null default 'historical_file',
  add column payload_hash text,
  add column last_seen_at timestamptz not null default now(),
  add column currency text,
  add column payout numeric,
  add column payout_type text,
  add column revenue_type text,
  add column order_id text,
  add column coupon_code text,
  add column is_event boolean not null default false,
  add column is_view_through boolean,
  add column is_scrub boolean,
  add column network_id text,
  add column advertiser_id text,
  add column advertiser_name text,
  add column adv1 text,
  add column adv2 text,
  add column adv3 text,
  add column adv4 text,
  add column adv5 text,
  add constraint everflow_conversion_events_provider_account_fk
    foreign key (organization_id, connection_id, provider_account_id)
    references public.commerce_provider_accounts (organization_id, connection_id, id),
  add constraint everflow_conversion_events_sync_run_fk
    foreign key (organization_id, connection_id, provider_account_id, sync_run_id)
    references public.commerce_sync_runs (organization_id, connection_id, provider_account_id, id),
  add constraint everflow_conversion_events_ingestion_method_check
    check (ingestion_method in ('historical_file', 'api')) not valid,
  add constraint everflow_conversion_events_payload_hash_check
    check (payload_hash is null or payload_hash ~ '^[0-9a-f]{64}$') not valid,
  add constraint everflow_conversion_events_ingestion_shape_check
    check (
      (ingestion_method = 'historical_file'
        and import_id is not null
        and source_row is not null
        and source_row >= 2)
      or
      (ingestion_method = 'api'
        and import_id is null
        and source_row is null
        and provider_account_id is not null
        and sync_run_id is not null
        and payload_hash is not null)
    ) not valid;

-- Historical rows retain their import-scoped identity. API rows are idempotent by
-- connected Network + source conversion identity; NULL provider_account_id values
-- on historical rows do not collide in this unique index.
create unique index everflow_conversion_events_api_identity_uidx
  on public.everflow_conversion_events (connection_id, provider_account_id, source_identity);

create index everflow_conversion_events_api_time_idx
  on public.everflow_conversion_events
    (organization_id, connection_id, provider_account_id, conversion_at desc)
  where provider_account_id is not null;

create index everflow_conversion_events_api_conversion_idx
  on public.everflow_conversion_events
    (connection_id, provider_account_id, conversion_id)
  where provider_account_id is not null;

-- The source-event UUID is durable. Merge-upserts may observe changed source
-- fields, but they must never move the primary key once a row exists.
create or replace function public.everflow_conversion_events_preserve_id()
returns trigger
language plpgsql
as $$
begin
  new.id := old.id;
  return new;
end;
$$;

create trigger everflow_conversion_events_preserve_id_trigger
  before update on public.everflow_conversion_events
  for each row execute function public.everflow_conversion_events_preserve_id();

-- Existing RLS posture remains server-only. Repeat the grants explicitly so the
-- migration is self-documenting about live API ingestion access.
alter table public.everflow_conversion_events enable row level security;
revoke all on table public.everflow_conversion_events from anon, authenticated;
grant select, insert, update, delete on table public.everflow_conversion_events to service_role;
revoke all on function public.everflow_conversion_events_preserve_id() from public, anon, authenticated;
grant execute on function public.everflow_conversion_events_preserve_id() to service_role;

comment on column public.everflow_conversion_events.ingestion_method is
  'Origin of the protected Everflow evidence row: historical_file or authenticated Network API.';
comment on column public.everflow_conversion_events.sync_run_id is
  'Commerce sync run that most recently observed an API conversion; NULL for protected historical-file evidence.';
comment on column public.everflow_conversion_events.payload_hash is
  'SHA-256 of normalized API evidence after raw IP addresses have been replaced with hashes.';
