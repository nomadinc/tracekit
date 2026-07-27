-- Add structured metadata for connector credentials without touching secrets.

do $$
begin
  if to_regclass('public.integrations_credentials') is not null then
    alter table public.integrations_credentials
      add column if not exists metadata jsonb not null default '{}'::jsonb;
  end if;
end
$$;
