-- Small provider-neutral Investigation tree contract. A child is an
-- independent Investigation whose branch provenance points to one immutable
-- parent Investigation version in the same Organization.

create unique index tracekit_investigation_versions_org_investigation_id_uidx
  on public.tracekit_investigation_versions (organization_id, investigation_id, id);

alter table public.tracekit_investigations
  add column parent_investigation_id uuid,
  add column parent_investigation_version_id uuid,
  add column branch_signal text,
  add column branch_reason text,
  add constraint tracekit_investigations_not_self_parent check (
    parent_investigation_id is null or parent_investigation_id <> id
  ),
  add constraint tracekit_investigations_branch_context_check check (
    (parent_investigation_id is null and parent_investigation_version_id is null and branch_signal is null and branch_reason is null)
    or
    (parent_investigation_id is not null and parent_investigation_version_id is not null
      and nullif(btrim(branch_signal),'') is not null and nullif(btrim(branch_reason),'') is not null)
  ),
  add constraint tracekit_investigations_parent_org_fk foreign key (organization_id, parent_investigation_id)
    references public.tracekit_investigations (organization_id, id) on delete restrict,
  add constraint tracekit_investigations_parent_version_fk foreign key (
    organization_id, parent_investigation_id, parent_investigation_version_id
  ) references public.tracekit_investigation_versions (organization_id, investigation_id, id) on delete restrict;

create index tracekit_investigations_parent_idx
  on public.tracekit_investigations (organization_id, parent_investigation_id, updated_at desc)
  where parent_investigation_id is not null;

create or replace function public.tracekit_investigation_branch_guard()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.parent_investigation_id is null then return new; end if;
  if new.parent_investigation_id = new.id then
    raise exception 'Investigation cannot parent itself' using errcode='23514';
  end if;
  if exists (
    with recursive ancestors as (
      select i.id,i.parent_investigation_id
      from public.tracekit_investigations i
      where i.organization_id=new.organization_id and i.id=new.parent_investigation_id
      union all
      select i.id,i.parent_investigation_id
      from public.tracekit_investigations i join ancestors a on i.id=a.parent_investigation_id
      where i.organization_id=new.organization_id
    ) select 1 from ancestors where id=new.id
  ) then
    raise exception 'Investigation branch cycle is not allowed' using errcode='23514';
  end if;
  return new;
end $$;

create or replace function public.tracekit_investigation_branch_immutable_guard()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if row(old.parent_investigation_id,old.parent_investigation_version_id,old.branch_signal,old.branch_reason)
      is distinct from row(new.parent_investigation_id,new.parent_investigation_version_id,new.branch_signal,new.branch_reason)
    and (old.parent_investigation_id is not null or exists (
      select 1 from public.tracekit_investigation_versions v
      where v.organization_id=old.organization_id and v.investigation_id=old.id
    )) then
    raise exception 'Materialized Investigation branch provenance is immutable' using errcode='55000';
  end if;
  return new;
end $$;

create trigger tracekit_investigation_branch_cycle_guard
before insert or update of parent_investigation_id,organization_id on public.tracekit_investigations
for each row execute function public.tracekit_investigation_branch_guard();

create trigger tracekit_investigation_branch_immutable
before update of parent_investigation_id,parent_investigation_version_id,branch_signal,branch_reason
on public.tracekit_investigations
for each row execute function public.tracekit_investigation_branch_immutable_guard();

revoke all on function public.tracekit_investigation_branch_guard() from public,anon,authenticated;
revoke all on function public.tracekit_investigation_branch_immutable_guard() from public,anon,authenticated;
