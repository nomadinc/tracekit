-- M6: server-only active Organization catalog for Platform administration.
create or replace function public.list_tracekit_active_organizations()
returns table(
  id uuid,
  owning_account_id uuid,
  agency_id uuid,
  workos_organization_id text,
  name text,
  status text
)
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $$
  select o.id,o.owning_account_id,o.agency_id,o.workos_organization_id,o.name,o.status
  from public.tracekit_organizations o
  where o.status='active'
  order by o.name asc,o.id asc;
$$;
revoke all on function public.list_tracekit_active_organizations() from public,anon,authenticated;
grant execute on function public.list_tracekit_active_organizations() to service_role;
