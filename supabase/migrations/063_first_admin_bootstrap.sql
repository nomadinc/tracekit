-- One-time, transactional bootstrap for an authenticated empty installation.
create or replace function public.bootstrap_tracekit_first_admin(
  p_user_id uuid,
  p_authenticated_identity_id text,
  p_organization_name text,
  p_account_name text,
  p_correlation_id text
)
returns table(account_id uuid, organization_id uuid, membership_id uuid, role_key text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_account_id uuid;
  v_organization_id uuid;
  v_membership_id uuid;
  v_role_id uuid;
  v_role_key text := 'organization-owner';
  v_organization_name text := nullif(btrim(p_organization_name), '');
  v_account_name text := nullif(btrim(p_account_name), '');
begin
  perform pg_advisory_xact_lock(hashtext('tracekit:first-admin-bootstrap'));
  if v_organization_name is null or v_account_name is null
     or length(v_organization_name) > 120 or length(v_account_name) > 120 then
    raise exception 'bootstrap names are invalid';
  end if;
  if not exists (select 1 from public.tracekit_users where id = p_user_id and status = 'active') then
    raise exception 'authenticated TraceKit user is unavailable';
  end if;
  if exists (select 1 from public.tracekit_organizations)
     or exists (select 1 from public.tracekit_accounts)
     or exists (select 1 from public.tracekit_memberships) then
    raise exception 'TraceKit installation is already initialized';
  end if;
  select id into v_role_id from public.tracekit_roles
    where role_key = v_role_key and account_type = 'client' and system_role = true;
  if v_role_id is null then raise exception 'required bootstrap role is unavailable'; end if;

  insert into public.tracekit_accounts (account_type, name, status)
    values ('client', v_account_name, 'active') returning id into v_account_id;
  insert into public.tracekit_organizations (owning_account_id, name, status)
    values (v_account_id, v_organization_name, 'active') returning id into v_organization_id;
  insert into public.tracekit_memberships (user_id, organization_id, role_id, status)
    values (p_user_id, v_organization_id, v_role_id, 'active') returning id into v_membership_id;
  insert into public.tracekit_audit_events
    (actor_user_id, authenticated_identity_id, account_id, organization_id, action, target_type, target_id, result, correlation_id, metadata)
    values (p_user_id, p_authenticated_identity_id, v_account_id, v_organization_id,
      'installation.bootstrap.completed', 'membership', v_membership_id::text, 'success',
      p_correlation_id, jsonb_build_object('role', v_role_key));
  return query select v_account_id, v_organization_id, v_membership_id, v_role_key;
end;
$$;

revoke all on function public.bootstrap_tracekit_first_admin(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.bootstrap_tracekit_first_admin(uuid, text, text, text, text) to service_role;
