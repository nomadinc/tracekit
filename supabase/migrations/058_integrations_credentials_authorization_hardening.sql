-- Keep encrypted integration credentials server-only.
-- This migration is deliberately convergent so the exact statements may be
-- installed as reviewed operational DDL before the normal migration sequence
-- reaches 058, without repairing or advancing the migration ledger.

do $migration$
begin
  if to_regclass('public.integrations_credentials') is null then
    -- The legacy credentials table remains an optional hosted prerequisite in
    -- the repository's fresh baseline, consistent with migrations 004 and 057.
    return;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy p
    where p.polrelid = 'public.integrations_credentials'::regclass
  ) then
    raise exception 'integrations_credentials has unexpected row-level security policies; review before hardening';
  end if;

  alter table public.integrations_credentials enable row level security;

  revoke all on table public.integrations_credentials
    from public, anon, authenticated, service_role;

  grant select, insert, update on table public.integrations_credentials
    to service_role;
end
$migration$;
