-- M6.2: authorized, idempotent platform-owner tenancy bootstrap.
create or replace function public.ensure_tracekit_platform_owner(
  p_user_id uuid,
  p_authenticated_identity_id text,
  p_correlation_id text
)
returns table(account_id uuid,membership_id uuid,created_account boolean,created_membership boolean)
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare
  v_account_id uuid; v_membership_id uuid; v_role_id uuid;
  v_account_count integer; v_created_account boolean:=false; v_created_membership boolean:=false;
begin
  if not exists(select 1 from public.tracekit_users where id=p_user_id and status='active') then
    raise exception 'active TraceKit user required' using errcode='42501';
  end if;
  select id into v_role_id from public.tracekit_roles where role_key='platform-owner';
  if v_role_id is null then raise exception 'platform-owner role unavailable'; end if;

  select count(*),min(id) into v_account_count,v_account_id
  from public.tracekit_accounts where account_type='platform' and status='active';
  if v_account_count>1 then raise exception 'multiple active platform accounts require operator review'; end if;
  if v_account_count=0 then
    insert into public.tracekit_accounts(account_type,name,status)
    values('platform','TraceKit Platform','active') returning id into v_account_id;
    v_created_account:=true;
  end if;

  select id into v_membership_id from public.tracekit_memberships
  where user_id=p_user_id and account_id=v_account_id and organization_id is null and role_id=v_role_id
  order by created_at asc limit 1;

  if v_membership_id is null then
    insert into public.tracekit_memberships(user_id,account_id,organization_id,role_id,status)
    values(p_user_id,v_account_id,null,v_role_id,'active') returning id into v_membership_id;
    v_created_membership:=true;
  else
    update public.tracekit_memberships set status='active',effective_until=null,updated_at=now()
    where id=v_membership_id;
  end if;

  insert into public.tracekit_audit_events(
    actor_user_id,authenticated_identity_id,account_id,organization_id,action,target_type,target_id,result,
    permission_evaluated,correlation_id,metadata
  ) values(
    p_user_id,p_authenticated_identity_id,v_account_id,null,'platform.owner_membership.ensured',
    'membership',v_membership_id::text,'success','admin.manage_tenants',p_correlation_id,
    jsonb_build_object('created_account',v_created_account,'created_membership',v_created_membership)
  );

  return query select v_account_id,v_membership_id,v_created_account,v_created_membership;
end $$;
revoke all on function public.ensure_tracekit_platform_owner(uuid,text,text) from public,anon,authenticated;
