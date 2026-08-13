-- Persist the server-side encryption-key version used by each integration credential.
-- This migration is additive and converges if the exact DDL was installed earlier
-- through the separately reviewed operational security procedure.

do $migration$
begin
  if to_regclass('public.integrations_credentials') is null then
    -- The legacy table is an optional hosted prerequisite in the repository's
    -- fresh baseline, matching Migration 004's established guard semantics.
    return;
  end if;

  alter table public.integrations_credentials
    add column if not exists password_key_version smallint;

  update public.integrations_credentials
  set password_key_version = 1
  where password_key_version is null;

  alter table public.integrations_credentials
    alter column password_key_version set default 1,
    alter column password_key_version set not null;

  if exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.integrations_credentials'::regclass
      and c.conname = 'integrations_credentials_password_key_version_check'
      and not (
        c.contype = 'c'
        and pg_catalog.pg_get_constraintdef(c.oid, false) = 'CHECK ((password_key_version > 0))'
      )
  ) then
    raise exception 'integrations_credentials_password_key_version_check exists with an incompatible definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.integrations_credentials'::regclass
      and c.conname = 'integrations_credentials_password_key_version_check'
  ) then
    alter table public.integrations_credentials
      add constraint integrations_credentials_password_key_version_check
      check (password_key_version > 0) not valid;
  end if;

  alter table public.integrations_credentials
    validate constraint integrations_credentials_password_key_version_check;

  comment on column public.integrations_credentials.password_key_version is
    'Non-secret server-side encryption key version; legacy credentials use version 1.';
end
$migration$;
