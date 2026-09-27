-- Immutable, source-scoped declarative browser instrumentation definitions.
-- Browser callers never access this table directly; the Production Worker
-- resolves the public source and managed Origin before returning a definition.

create table public.tkid_browser_instrumentation_configs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tracekit_organizations(id),
  source_id uuid not null,
  config_version text not null,
  sdk_version text not null,
  status text not null default 'draft',
  definition jsonb not null,
  definition_sha256 text not null,
  provenance text not null,
  source_commit text not null,
  approved_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tkid_browser_config_version check (config_version ~ '^[1-9][0-9]{0,5}$'),
  constraint tkid_browser_config_sdk_version check (sdk_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  constraint tkid_browser_config_status check (status in ('draft','active','retired')),
  constraint tkid_browser_config_hash check (definition_sha256 ~ '^[0-9a-f]{64}$'),
  constraint tkid_browser_config_commit check (source_commit ~ '^[0-9a-f]{40}$'),
  constraint tkid_browser_config_approval check (
    (status = 'draft' and approved_at is null and retired_at is null) or
    (status = 'active' and approved_at is not null and retired_at is null) or
    (status = 'retired' and approved_at is not null and retired_at is not null)
  ),
  constraint tkid_browser_config_definition_size check (octet_length(definition::text) <= 16384),
  unique (organization_id, source_id, config_version),
  foreign key (organization_id, source_id) references public.tkid_sources(organization_id,id)
);

create unique index tkid_browser_instrumentation_one_active_per_source
  on public.tkid_browser_instrumentation_configs (organization_id, source_id)
  where status = 'active';

create index tkid_browser_instrumentation_source_lookup
  on public.tkid_browser_instrumentation_configs (organization_id, source_id, status, config_version);

create or replace function public.validate_tkid_browser_instrumentation_definition_v1(p_definition jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = public, pg_temp
as $$
declare
  page jsonb;
  cta jsonb;
  pages jsonb;
begin
  if jsonb_typeof(p_definition) <> 'object'
     or p_definition <> jsonb_strip_nulls(p_definition)
     or (select count(*) from jsonb_object_keys(p_definition)) <> 3
     or p_definition->>'schema_version' <> '1'
     or p_definition->>'privacy_mode' <> 'essential'
     or jsonb_typeof(p_definition->'pages') <> 'array' then
    return false;
  end if;
  pages := p_definition->'pages';
  if jsonb_array_length(pages) < 1 or jsonb_array_length(pages) > 32 then return false; end if;
  for page in select value from jsonb_array_elements(pages) loop
    if jsonb_typeof(page) <> 'object'
       or (select count(*) from jsonb_object_keys(page)) <> 7
       or page->>'match_type' <> 'pathname_exact'
       or coalesce(page->>'pathname','') !~ '^/[A-Za-z0-9/_-]{0,255}$'
       or coalesce(page->>'page_id','') !~ '^[a-z][a-z0-9_-]{0,95}$'
       or coalesce(page->>'funnel_step_id','') !~ '^[a-z][a-z0-9_-]{0,95}$'
       or jsonb_typeof(page->'emit_page_viewed') <> 'boolean'
       or jsonb_typeof(page->'emit_funnel_step_viewed') <> 'boolean'
       or jsonb_typeof(page->'ctas') <> 'array'
       or jsonb_array_length(page->'ctas') > 16 then return false;
    end if;
    for cta in select value from jsonb_array_elements(page->'ctas') loop
      if jsonb_typeof(cta) <> 'object'
         or (select count(*) from jsonb_object_keys(cta)) <> 6
         or coalesce(cta->>'cta_id','') !~ '^[a-z][a-z0-9_-]{0,95}$'
         or coalesce(cta->>'cta_version','') !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'
         or coalesce(cta->>'funnel_step_id','') !~ '^[a-z][a-z0-9_-]{0,95}$'
         or coalesce(cta->>'action_type','') !~ '^[a-z][a-z0-9_-]{0,31}$'
         or cta->>'match_type' not in ('marker','selector')
         or (cta->>'match_type' = 'marker' and coalesce(cta->>'match_value','') !~ '^[a-z][a-z0-9_-]{0,63}$')
         or (cta->>'match_type' = 'selector' and coalesce(cta->>'match_value','') !~ '^(\.[A-Za-z][A-Za-z0-9_-]{0,63}|#[A-Za-z][A-Za-z0-9_-]{0,63}|\[data-tracekit-cta="[a-z][a-z0-9_-]{0,63}"\])$')
      then return false;
      end if;
    end loop;
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

alter table public.tkid_browser_instrumentation_configs
  add constraint tkid_browser_config_definition_valid
  check (public.validate_tkid_browser_instrumentation_definition_v1(definition));

create or replace function public.guard_tkid_browser_instrumentation_immutability_v1()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('active','retired') then
      raise exception 'released browser instrumentation configurations are immutable';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.status in ('active','retired') then
    if row(old.organization_id,old.source_id,old.config_version,old.sdk_version,old.definition,old.definition_sha256,old.provenance,old.source_commit,old.approved_at,old.created_at)
       is distinct from
       row(new.organization_id,new.source_id,new.config_version,new.sdk_version,new.definition,new.definition_sha256,new.provenance,new.source_commit,new.approved_at,new.created_at)
       or not (old.status = 'active' and new.status = 'retired' and new.retired_at is not null) then
      raise exception 'released browser instrumentation configurations are immutable';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger guard_tkid_browser_instrumentation_immutability
before update or delete on public.tkid_browser_instrumentation_configs
for each row execute function public.guard_tkid_browser_instrumentation_immutability_v1();

alter table public.tkid_browser_instrumentation_configs enable row level security;
revoke all on table public.tkid_browser_instrumentation_configs from public, anon, authenticated, authenticator;
grant select, insert, update on table public.tkid_browser_instrumentation_configs to service_role;
revoke all on function public.validate_tkid_browser_instrumentation_definition_v1(jsonb) from public, anon, authenticated, authenticator;
grant execute on function public.validate_tkid_browser_instrumentation_definition_v1(jsonb) to service_role;
revoke all on function public.guard_tkid_browser_instrumentation_immutability_v1() from public, anon, authenticated, authenticator;
