-- WS-016 M6.3b: paid-media authorization persistence foundation.
-- Intentionally limited to Connection -> Provider Account -> encrypted Credential.
-- Connecting an account does not activate or certify ingestion.

create extension if not exists pgcrypto;

create table public.marketing_provider_connections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  organization_id uuid not null,
  provider text not null,
  display_name text not null,
  environment text not null default 'production',
  status text not null default 'draft',
  provider_identity_id text,
  capabilities jsonb not null default '{}'::jsonb,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_code text,
  reauthorization_required boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id,account_id)
    references public.tracekit_organizations(id,owning_account_id),
  check (provider ~ '^[a-z][a-z0-9_]*$'),
  check (environment in ('sandbox','staging','production')),
  check (status in ('draft','connected','degraded','disabled','revoked')),
  check (public.financial_reconciliation_metadata_is_safe(capabilities)),
  check (public.financial_reconciliation_metadata_is_safe(metadata))
);
create unique index marketing_provider_connections_org_id_uidx
  on public.marketing_provider_connections(organization_id,id);
create unique index marketing_provider_connections_active_identity_uidx
  on public.marketing_provider_connections(organization_id,provider,provider_identity_id)
  where status <> 'revoked' and provider_identity_id is not null;

create table public.marketing_provider_accounts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  organization_id uuid not null,
  connection_id uuid not null,
  provider text not null,
  provider_account_external_id text not null,
  provider_account_label text,
  parent_provider_account_id uuid,
  account_type text not null default 'unknown',
  hierarchy_depth integer,
  is_manager boolean not null default false,
  eligible_for_spend_sync boolean not null default false,
  currency text,
  timezone_name text,
  timezone_offset_minutes integer,
  status text not null default 'active',
  selected_for_sync boolean not null default false,
  first_discovered_at timestamptz not null default now(),
  last_discovered_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,connection_id,id),
  unique(connection_id,provider_account_external_id),
  foreign key (organization_id,account_id)
    references public.tracekit_organizations(id,owning_account_id),
  foreign key (organization_id,connection_id)
    references public.marketing_provider_connections(organization_id,id),
  foreign key (organization_id,connection_id,parent_provider_account_id)
    references public.marketing_provider_accounts(organization_id,connection_id,id),
  check (provider ~ '^[a-z][a-z0-9_]*$'),
  check (account_type in ('manager','advertiser','hybrid','unknown')),
  check (hierarchy_depth is null or hierarchy_depth >= 0),
  check (currency is null or currency ~ '^[A-Z]{3}$'),
  check (status in ('active','degraded','disabled','revoked')),
  check (last_discovered_at >= first_discovered_at),
  check (public.financial_reconciliation_metadata_is_safe(metadata))
);

create table public.marketing_provider_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  credential_type text not null,
  storage_backend text not null default 'database_encrypted',
  secret_reference text,
  encryption_key_id text,
  encryption_version integer,
  secret_iv bytea,
  secret_ciphertext bytea,
  public_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (organization_id,connection_id)
    references public.marketing_provider_connections(organization_id,id),
  check (nullif(btrim(credential_type),'') is not null),
  check (storage_backend in ('database_encrypted','managed_secret')),
  check (
    (storage_backend='database_encrypted' and secret_reference is null
      and encryption_key_id is not null and encryption_version is not null
      and secret_iv is not null and secret_ciphertext is not null)
    or
    (storage_backend='managed_secret' and secret_reference is not null
      and encryption_key_id is null and encryption_version is null
      and secret_iv is null and secret_ciphertext is null)
  ),
  check (public.financial_reconciliation_metadata_is_safe(public_metadata))
);
create unique index marketing_provider_credentials_active_type_uidx
  on public.marketing_provider_credentials(connection_id,credential_type)
  where revoked_at is null;

create or replace function public.marketing_provider_credential_version_guard()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if old.revoked_at is null and new.revoked_at is not null
    and (to_jsonb(new)-array['revoked_at','rotated_at','updated_at'])
      = (to_jsonb(old)-array['revoked_at','rotated_at','updated_at']) then
    return new;
  end if;
  raise exception 'marketing provider credential versions are immutable'
    using errcode='55000';
end $$;
create trigger marketing_provider_credential_version_guard_trigger
before update on public.marketing_provider_credentials
for each row execute function public.marketing_provider_credential_version_guard();

alter table public.marketing_provider_connections enable row level security;
alter table public.marketing_provider_accounts enable row level security;
alter table public.marketing_provider_credentials enable row level security;
revoke all on table public.marketing_provider_connections from public,anon,authenticated;
revoke all on table public.marketing_provider_accounts from public,anon,authenticated;
revoke all on table public.marketing_provider_credentials from public,anon,authenticated;

comment on table public.marketing_provider_connections is
  'Paid-media authorization connections; connected status does not certify ingestion.';
comment on table public.marketing_provider_credentials is
  'Encrypted paid-media credentials; plaintext provider secrets are never persisted.';
