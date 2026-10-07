-- Reuse canonical tenancy. Functions are server-only SECURITY INVOKER;
-- mutations and their audit evidence commit together.
create or replace function public.ws021_assert_admin(p_actor uuid, p_identity text, p_permission text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (
    select 1 from public.tracekit_memberships m
    join public.tracekit_users u on u.id=m.user_id
    join public.tracekit_accounts a on a.id=m.account_id
    join public.tracekit_roles r on r.id=m.role_id
    where u.id=p_actor and u.workos_user_id=p_identity and u.status='active'
      and m.status='active' and m.organization_id is null and m.effective_from<=now()
      and (m.effective_until is null or m.effective_until>now())
      and a.account_type='platform' and a.status='active'
      and r.role_key in ('platform-owner','platform-admin')
      and not exists(select 1 from public.tracekit_permission_overrides o
        where o.membership_id=m.id and o.effect='deny'
          and o.capability in ('admin.manage_tenants',p_permission))
  ) then raise exception 'Resource unavailable' using errcode='42501'; end if;
end $$;

create or replace function public.ws021_create_client(p_actor uuid,p_identity text,p_name text,p_type text,p_correlation text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_account uuid; v_org uuid;
begin
  perform public.ws021_assert_admin(p_actor,p_identity,'organizations.manage');
  if p_type not in ('client','agency') or length(trim(p_name)) not between 1 and 120 then
    raise exception 'Invalid client'; end if;
  insert into public.tracekit_accounts(name,account_type) values(trim(p_name),p_type) returning id into v_account;
  if p_type='client' then
    insert into public.tracekit_organizations(owning_account_id,name) values(v_account,trim(p_name)) returning id into v_org;
  else
    insert into public.tracekit_agencies(account_id,name) values(v_account,trim(p_name));
  end if;
  insert into public.tracekit_audit_events(actor_user_id,authenticated_identity_id,account_id,organization_id,action,target_type,target_id,result,permission_evaluated,correlation_id,metadata)
  values(p_actor,p_identity,v_account,v_org,'platform.client.created','account',v_account::text,'success','organizations.manage',p_correlation,jsonb_build_object('accountType',p_type));
  return v_account;
end $$;

create or replace function public.ws021_change_membership(p_actor uuid,p_identity text,p_account uuid,p_org uuid,p_membership uuid,p_role text,p_remove boolean,p_correlation text)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_m public.tracekit_memberships%rowtype; v_type text; v_role uuid; v_old_role text;
begin
  perform public.ws021_assert_admin(p_actor,p_identity,case when p_remove then 'users.remove' else 'users.manage_permissions' end);
  select account_type into v_type from public.tracekit_accounts where id=p_account and status='active' for update;
  if v_type not in ('client','agency') then raise exception 'Resource unavailable' using errcode='42501'; end if;
  if v_type='client' and not exists(select 1 from public.tracekit_organizations where id=p_org and owning_account_id=p_account and status='active') then raise exception 'Resource unavailable' using errcode='42501'; end if;
  if v_type='agency' and p_org is not null then raise exception 'Invalid target'; end if;
  select * into v_m from public.tracekit_memberships where id=p_membership and organization_id is not distinct from p_org
    and account_id is not distinct from case when v_type='agency' then p_account else null end and status='active' for update;
  if v_m.id is null then raise exception 'Resource unavailable' using errcode='42501'; end if;
  select role_key into v_old_role from public.tracekit_roles where id=v_m.role_id;
  select id into v_role from public.tracekit_roles where role_key=p_role and account_type=v_type;
  if not p_remove and v_role is null then raise exception 'Invalid role'; end if;
  if v_old_role in ('organization-owner','agency-owner') and (p_remove or v_role is distinct from v_m.role_id)
    and not exists(select 1 from public.tracekit_memberships m join public.tracekit_users u on u.id=m.user_id
      where m.id<>v_m.id and m.status='active' and m.role_id=v_m.role_id and u.status='active'
      and m.effective_from<=now() and (m.effective_until is null or m.effective_until>now())
      and m.organization_id is not distinct from p_org and m.account_id is not distinct from v_m.account_id) then raise exception 'Cannot remove the final owner'; end if;
  update public.tracekit_memberships set status=case when p_remove then 'removed' else status end,
    role_id=case when p_remove then role_id else v_role end,updated_at=now() where id=v_m.id;
  insert into public.tracekit_audit_events(actor_user_id,authenticated_identity_id,account_id,organization_id,action,target_type,target_id,result,permission_evaluated,correlation_id,metadata)
  values(p_actor,p_identity,p_account,p_org,case when p_remove then 'membership.removed' else 'membership.role_changed' end,'membership',v_m.id::text,'success',case when p_remove then 'users.remove' else 'users.manage_permissions' end,p_correlation,jsonb_build_object('role',case when p_remove then v_old_role else p_role end));
end $$;

revoke all on function public.ws021_assert_admin(uuid,text,text),public.ws021_create_client(uuid,text,text,text,text),public.ws021_change_membership(uuid,text,uuid,uuid,uuid,text,boolean,text) from public,anon,authenticated;
grant execute on function public.ws021_assert_admin(uuid,text,text),public.ws021_create_client(uuid,text,text,text,text),public.ws021_change_membership(uuid,text,uuid,uuid,uuid,text,boolean,text) to service_role;
