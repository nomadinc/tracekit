-- Flexible connector-agnostic import progress storage.

do $$
begin
  if to_regclass('public.integration_import_jobs') is not null then
    alter table public.integration_import_jobs
      add column if not exists progress jsonb not null default '{}'::jsonb;
  end if;
end
$$;
