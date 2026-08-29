-- TraceKit Everflow offer reference data v1.
-- Source-owned offer metadata; advertiser relationship is preserved explicitly.

create table public.everflow_offers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  network_offer_id text not null,
  network_id text,
  network_advertiser_id text,
  name text not null,
  offer_status text,
  currency_id text,
  visibility text,
  network_category_id text,
  network_offer_group_id text,
  network_tracking_domain_id text,
  destination_url text,
  preview_url text,
  thumbnail_url text,
  source_time_created timestamptz,
  source_time_saved timestamptz,
  payload_hash text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint everflow_offers_provider_account_fk
    foreign key (organization_id, connection_id, provider_account_id)
    references public.commerce_provider_accounts (organization_id, connection_id, id)
    on delete cascade,
  constraint everflow_offers_source_id_check check (length(btrim(network_offer_id)) between 1 and 128),
  constraint everflow_offers_name_check check (length(btrim(name)) between 1 and 500),
  constraint everflow_offers_status_check check (offer_status is null or offer_status in ('active','paused','pending','deleted')),
  constraint everflow_offers_hash_check check (payload_hash ~ '^[0-9a-f]{64}$'),
  unique (connection_id, provider_account_id, network_offer_id)
);

create index everflow_offers_org_connection_idx
  on public.everflow_offers (organization_id, connection_id, offer_status);
create index everflow_offers_advertiser_idx
  on public.everflow_offers (connection_id, provider_account_id, network_advertiser_id);
create index everflow_offers_connection_name_idx
  on public.everflow_offers (connection_id, name);

alter table public.everflow_offers enable row level security;
revoke all on table public.everflow_offers from anon, authenticated;
grant select, insert, update on table public.everflow_offers to service_role;

comment on table public.everflow_offers is
  'Connection-scoped normalized Everflow offer reference records. network_offer_id is source identity and network_advertiser_id preserves the advertiser ownership relationship.';
