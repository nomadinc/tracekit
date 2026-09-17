-- M14.1B: allow independent active credential purposes per commerce Connection.
-- Existing rows remain valid and retain their credential_type (currently api_key).
-- No credential material is rewritten by this migration.

drop index if exists public.commerce_provider_credentials_active_connection_uidx;

create unique index commerce_provider_credentials_active_connection_type_uidx
  on public.commerce_provider_credentials (connection_id, credential_type)
  where revoked_at is null;

-- Rotation must revoke only the expected active credential purpose. This prevents
-- an api_key rotation from accidentally revoking a webhook_signing_secret (or vice versa).
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
declare v_updated integer;
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
  insert into public.commerce_provider_credentials
    (organization_id, connection_id, credential_type, storage_backend,
     encryption_key_id, encryption_version, secret_iv, secret_ciphertext)
  values
    (p_organization_id, p_connection_id, p_credential_type, 'database_encrypted',
     p_key_id, p_encryption_version, p_secret_iv, p_secret_ciphertext)
  returning *;
end;
$$;

revoke all on function public.rotate_commerce_provider_credential(uuid, uuid, uuid, text, text, integer, bytea, bytea)
  from public, anon, authenticated;
grant execute on function public.rotate_commerce_provider_credential(uuid, uuid, uuid, text, text, integer, bytea, bytea)
  to service_role;

comment on index public.commerce_provider_credentials_active_connection_type_uidx is
  'At most one active credential version per Connection and credential purpose; permits independent api_key and webhook_signing_secret rotation.';
