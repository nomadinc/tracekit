-- Complete per-type credential rotation without rewriting credential material
-- or creating a second uniqueness index.

do $$
declare
  v_index text;
begin
  if exists (
    select 1
    from public.commerce_provider_credentials
    where nullif(btrim(credential_type), '') is null
  ) then
    raise exception 'commerce_provider_credentials contains blank credential_type values';
  end if;

  if exists (
    select 1
    from public.commerce_provider_credentials
    where revoked_at is null
    group by connection_id, credential_type
    having count(*) > 1
  ) then
    raise exception 'commerce_provider_credentials contains duplicate active connection/type rows';
  end if;

  select pg_get_indexdef(to_regclass('public.commerce_provider_credentials_active_type_uidx'))
    into v_index;

  if v_index is null
    or v_index not ilike '%UNIQUE INDEX commerce_provider_credentials_active_type_uidx%'
    or v_index not ilike '%(connection_id, credential_type)%'
    or v_index not ilike '%revoked_at IS NULL%' then
    raise exception 'authoritative commerce credential active-type index is missing or incompatible';
  end if;
end
$$;

alter table public.commerce_provider_credentials
  drop constraint if exists commerce_provider_credentials_type_nonblank_check;

alter table public.commerce_provider_credentials
  add constraint commerce_provider_credentials_type_nonblank_check
  check (nullif(btrim(credential_type), '') is not null);

create or replace function public.rotate_commerce_provider_credential(
  p_organization_id uuid,
  p_connection_id uuid,
  p_previous_id uuid,
  p_credential_type text,
  p_key_id text,
  p_encryption_version integer,
  p_secret_iv bytea,
  p_secret_ciphertext bytea
)
returns setof public.commerce_provider_credentials
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_updated integer;
begin
  if nullif(btrim(p_credential_type), '') is null then
    raise exception 'credential type is required' using errcode = '22023';
  end if;

  update public.commerce_provider_credentials
  set revoked_at = now(), rotated_at = now(), updated_at = now()
  where id = p_previous_id
    and organization_id = p_organization_id
    and connection_id = p_connection_id
    and credential_type = p_credential_type
    and revoked_at is null;

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    return;
  end if;

  return query
  insert into public.commerce_provider_credentials (
    organization_id,
    connection_id,
    credential_type,
    storage_backend,
    encryption_key_id,
    encryption_version,
    secret_iv,
    secret_ciphertext
  )
  values (
    p_organization_id,
    p_connection_id,
    p_credential_type,
    'database_encrypted',
    p_key_id,
    p_encryption_version,
    p_secret_iv,
    p_secret_ciphertext
  )
  returning *;
end;
$$;

revoke all on function public.rotate_commerce_provider_credential(
  uuid, uuid, uuid, text, text, integer, bytea, bytea
) from public, anon, authenticated, authenticator;

grant execute on function public.rotate_commerce_provider_credential(
  uuid, uuid, uuid, text, text, integer, bytea, bytea
) to service_role;

comment on index public.commerce_provider_credentials_active_type_uidx is
  'At most one active credential version per Connection and credential purpose; permits independent api_key and webhook_signing_secret rotation.';

comment on function public.rotate_commerce_provider_credential(
  uuid, uuid, uuid, text, text, integer, bytea, bytea
) is
  'Rotates exactly one active credential purpose on a scoped Commerce Connection; blank credential types and cross-type revocation are rejected.';

