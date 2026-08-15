-- Make the two proven legacy credential-key lineages explicit without rewriting
-- credential ciphertext. Version 2 remains reserved for the future rotation key.

do $migration$
begin
  if to_regclass('public.integrations_credentials') is null then
    return;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'integrations_credentials'
      and column_name = 'password_key_version'
      and data_type = 'smallint'
  ) then
    raise exception 'password_key_version smallint prerequisite is missing';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.integrations_credentials'::regclass
      and c.conname = 'integrations_credentials_password_key_lineage_check'
      and not (
        c.contype = 'c'
        and pg_catalog.pg_get_constraintdef(c.oid, false) = 'CHECK ((password_key_version = ANY (ARRAY[1, 2, 3])))'
      )
  ) then
    raise exception 'integrations_credentials_password_key_lineage_check exists with an incompatible definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.integrations_credentials'::regclass
      and c.conname = 'integrations_credentials_password_key_lineage_check'
  ) then
    alter table public.integrations_credentials
      add constraint integrations_credentials_password_key_lineage_check
      check (password_key_version in (1, 2, 3)) not valid;
  end if;

  alter table public.integrations_credentials
    validate constraint integrations_credentials_password_key_lineage_check;

  comment on column public.integrations_credentials.password_key_version is
    'Deterministic server-side key lineage: 1=legacy-b, 2=future rotation key, 3=legacy-c (decrypt-only).';
end
$migration$;

-- Production classification is deliberately not embedded here. A separately
-- approved operator transaction must map the two cryptographically proven
-- Legacy C primary keys to version 3 using an ephemeral, reviewed identifier
-- list. It must assert 18 total rows, exactly two target rows, version 1 before
-- update, unchanged IV/ciphertext fingerprints, and zero active target rows.
