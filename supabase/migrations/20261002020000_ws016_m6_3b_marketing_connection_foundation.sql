-- WS-016 M6.3b: minimal paid-media connection foundation.
--
-- This migration intentionally stops at authorization and provider-account
-- discovery. Reporting hierarchy, spend ingestion, schedules, and evidence
-- remain owned by the dedicated marketing connector workstreams.
--
-- Secrets are encrypted before persistence. Browser roles receive no direct
-- table access.

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
  constraint marketing_provider_connections_org_account_fk
    foreign key (organization_id, account_id)
    references public.tracekit_organizations(id, owning_account_id),
  constraint marketing_provider_connections_provider_check
    check (provider ~ '^[a-z][a-z0-9_]*$'),
  constraint marketing_provider_connections_environment_check
    check (environment in ('sandbox','staging','production')),
  constraint marketing_provider_connections_status_check
    check (status in ('draft','connected','degraded','disabled','revoked')),
  constraint marketing_provider_connections_capabilities_safe_check
    check (public.financial_reconciliation_metadata_is_safe(capabilities)),
  constraint marketing_provider_connections_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata))
);

create unique index marketing_provider_connections_org_id_uidx
  on public.marketing_provider_connections(organization_id,id);
create index marketing_provider_connections_org_provider_idx
  on public.marketing_provider_connections(organization_id,provider,status);
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
  constraint marketing_provider_accounts_scope_unique
    unique (organization_id,connection_id,id),
  constraint marketing_provider_accounts_org_account_fk
    foreign key (organization_id,account_id)
    references public.tracekit_organizations(id,owning_account_id),
  constraint marketing_provider_accounts_connection_fk
    foreign key (organization_id,connection_id)
    references public.marketing_provider_connections(organization_id,id),
  constraint marketing_provider_accounts_parent_fk
    foreign key (organization_id,connection_id,parent_provider_account_id)
    references public.marketing_provider_accounts(organization_id,connection_id,id),
  constraint marketing_provider_accounts_provider_check
    check (provider ~ '^[a-z][a-z0-9_]*$'),
  constraint marketing_provider_accounts_type_check
    check (account_type in ('manager','advertiser','hybrid','unknown')),
  constraint marketing_provider_accounts_depth_check
    check (hierarchy_depth is null or hierarchy_depth >= 0),
  constraint marketing_provider_accounts_currency_check
    check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint marketing_provider_accounts_status_check
    check (status in ('active','degraded','disabled','revoked')),
  constraint marketing_provider_accounts_discovery_check
    check (last_discovered_at >= first_discovered_at),
  constraint marketing_provider_accounts_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(metadata)),
  unique(connection_id,provider_account_external_id)
);

create index marketing_provider_accounts_selected_idx
  on public.marketing_provider_accounts(organization_id,connection_id,selected_for_sync,status);

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
  constraint marketing_provider_credentials_connection_fk
    foreign key (organization_id,connection_id)
    references public.marketing_provider_connections(organization_id,id),
  constraint marketing_provider_credentials_type_check
    check (nullif(btrim(credential_type),'') is not null),
  constraint marketing_provider_credentials_backend_check
    check (storage_backend in ('database_encrypted','managed_secret')),
  constraint marketing_provider_credentials_material_check check (
    (storage_backend='database_encrypted'
      and secret_reference is null
      and encryption_key_id is not null
      and encryption_version is not null
      and secret_iv is not null
      and secret_ciphertext is not null)
    or
    (storage_backend='managed_secret'
      and secret_reference is not null
      and encryption_key_id is null
      and encryption_version is null
      and secret_iv is null
      and secret_ciphertext is null)
  ),
  constraint marketing_provider_credentials_metadata_safe_check
    check (public.financial_reconciliation_metadata_is_safe(public_metadata))
);

create unique index marketing_provider_credentials_active_type_uidx
  on public.marketing_provider_credentials(connection_id,credential_type)
  where revoked_at is null;
create index marketing_provider_credentials_history_idx
  on public.marketing_provider_credentials(connection_id,credential_type,created_at desc);

create or replace function public.marketing_provider_credential_version_guard()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if old.revoked_at is null
     and new.revoked_at is not null
     and (to_jsonb(new)-array['revoked_at','rotated_at','updated_at'])
       = (to_jsonb(old)-array['revoked_at','rotated_at','updated_at']) then
    return new;
  end if;
  raise exception 'marketing provider credential versions are immutable; rotate by revoking and inserting'
    using errcode='55000';
end $$;

create trigger marketing_provider_credential_version_guard_trigger
before update on public.marketing_provider_credentials
for each row execute function public.marketing_provider_credential_version_guard();

create or replace function public.rotate_marketing_provider_credential(
  p_organization_id uuid,
  p_connection_id uuid,
  p_previous_id uuid,
  p_credential_type text,
  p_key_id text,
  p_encryption_version integer,
  p_secret_iv bytea,
  p_secret_ciphertext bytea,
  p_public_metadata jsonb default '{}'::jsonb
)
returns setof public.marketing_provider_credentials
language plpgsql security invoker set search_path=public as $$
declare v_updated integer;
begin
  if nullif(btrim(p_credential_type),'') is null then
    raise exception 'credential type is required' using errcode='22023';
  end if;

  update public.marketing_provider_credentials
  set revoked_at=now(), rotated_at=now(), updated_at=now()
  where id=p_previous_id
    and organization_id=p_organization_id
    and connection_id=p_connection_id
    and credential_type=p_credential_type
    and revoked_at is null;

  get diagnostics v_updated=row_count;
  if v_updated <> 1 then return; end if;

  return query
  insert into public.marketing_provider_credentials(
    organization_id,connection_id,credential_type,storage_backend,
    encryption_key_id,encryption_version,secret_iv,secret_ciphertext,public_metadata
  ) values (
    p_organization_id,p_connection_id,p_credential_type,'database_encrypted',
    p_key_id,p_encryption_version,p_secret_iv,p_secret_ciphertext,coalesce(p_public_metadata,'{}'::jsonb)
  ) returning *;
end $$;

alter table public.marketing_provider_connections enable row level security;
alter table public.marketing_provider_accounts enable row level security;
alter table public.marketing_provider_credentials enable row level security;

revoke all on table public.marketing_provider_connections from public,anon,authenticated;
revoke all on table public.marketing_provider_accounts from public,anon,authenticated;
revoke all on table public.marketing_provider_credentials from public,anon,authenticated;
revoke all on function public.rotate_marketing_provider_credential(
  uuid,uuid,uuid,text,text,integer,bytea,bytea,jsonb
) from public,anon,authenticated,authenticator;
grant execute on function public.rotate_marketing_provider_credential(
  uuid,uuid,uuid,text,text,integer,bytea,bytea,jsonb
) to service_role;

comment on table public.marketing_provider_connections is
  'WS-016 paid-media authorization connections; connection does not imply certified ingestion.';
comment on table public.marketing_provider_accounts is
  'Advertising accounts discovered under a paid-media authorization connection.';
comment on table public.marketing_provider_credentials is
  'Encrypted/versioned paid-media credentials; no plaintext provider secrets.';
