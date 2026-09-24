-- Audited, operator-authorized provisioning for the narrow TKID origin registry capability.
-- This does not alter any role's base permissions and does not touch TKID source,
-- origin, challenge, or verification state.
create or replace function public.provision_tkid_origin_registry_access_v1(
  p_actor_user_id uuid,
  p_membership_id uuid,
  p_organization_id uuid,
  p_business_context_id text,
  p_reason text,
  p_correlation_id text,
  p_confirmation text
) returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_access_id uuid;
  v_override_id uuid;
  v_account_id uuid;
begin
  if p_confirmation is distinct from 'provision-tkid-origin-registry-access'
     or p_actor_user_id is null or p_membership_id is null or p_organization_id is null
     or nullif(btrim(p_business_context_id),'') is null
     or nullif(btrim(p_reason),'') is null or nullif(btrim(p_correlation_id),'') is null then
    raise exception 'required operator provisioning input missing';
  end if;

  select o.owning_account_id into v_account_id
  from public.tracekit_memberships m
  join public.tracekit_roles r on r.id=m.role_id
  join public.tracekit_organizations o on o.id=m.organization_id
  where m.id=p_membership_id and m.organization_id=p_organization_id
    and m.status='active' and m.effective_from<=now()
    and (m.effective_until is null or m.effective_until>now())
    and r.role_key='organization-owner' and o.status='active';
  if v_account_id is null then raise exception 'target membership scope is unavailable'; end if;

  -- Invocation is restricted to service_role. Record a real active member of the
  -- target tenant as the approving actor, matching existing operator RPCs.
  if not exists (
    select 1 from public.tracekit_memberships actor_membership
    where actor_membership.user_id=p_actor_user_id
      and actor_membership.organization_id=p_organization_id
      and actor_membership.status='active'
      and actor_membership.effective_from<=now()
      and (actor_membership.effective_until is null or actor_membership.effective_until>now())
  ) then
    raise exception 'operator actor is unavailable in target tenant';
  end if;

  if not exists (
    select 1 from public.tracekit_business_contexts c
    where c.id=p_business_context_id and c.organization_id=p_organization_id
      and c.account_id=v_account_id and c.status='active'
  ) then raise exception 'target business context is unavailable'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_membership_id::text||':'||p_organization_id::text||':tkid_origin_registry',0));
  if exists (
    select 1 from public.tracekit_permission_overrides
    where membership_id=p_membership_id and capability='admin.manage_feature_access'
      and effect='deny'
      and (organization_id is null or organization_id=p_organization_id)
      and (resource_type is null or resource_type='tkid_origin_registry')
  ) then raise exception 'conflicting deny override exists'; end if;

  insert into public.tracekit_business_context_access(membership_id,organization_id,business_context_id,status)
  values(p_membership_id,p_organization_id,p_business_context_id,'active')
  on conflict(membership_id,organization_id,business_context_id)
  do update set status='active'
  returning id into v_access_id;

  select id into v_override_id
  from public.tracekit_permission_overrides
  where membership_id=p_membership_id and capability='admin.manage_feature_access'
    and effect='allow' and organization_id=p_organization_id
    and resource_type='tkid_origin_registry' and resource_id is null
  order by created_at limit 1;
  if v_override_id is null then
    insert into public.tracekit_permission_overrides(
      membership_id,capability,effect,organization_id,resource_type,resource_id,
      created_by_user_id,reason
    ) values(
      p_membership_id,'admin.manage_feature_access','allow',p_organization_id,
      'tkid_origin_registry',null,p_actor_user_id,btrim(p_reason)
    ) returning id into v_override_id;
  end if;

  insert into public.tracekit_audit_events(
    actor_user_id,account_id,organization_id,action,target_type,target_id,result,
    permission_evaluated,correlation_id,metadata
  ) values(
    p_actor_user_id,v_account_id,p_organization_id,
    'authorization.tkid_origin_registry.provisioned','membership',p_membership_id::text,
    'success','admin.manage_feature_access',btrim(p_correlation_id),
    jsonb_build_object('business_context_id',p_business_context_id,'access_id',v_access_id,'override_id',v_override_id,'resource_type','tkid_origin_registry','reason',btrim(p_reason))
  );

  return jsonb_build_object('membership_id',p_membership_id,'organization_id',p_organization_id,
    'business_context_id',p_business_context_id,'access_id',v_access_id,'override_id',v_override_id,
    'resource_type','tkid_origin_registry');
end;
$$;

revoke all on function public.provision_tkid_origin_registry_access_v1(uuid,uuid,uuid,text,text,text,text) from public,anon,authenticated,authenticator;
grant execute on function public.provision_tkid_origin_registry_access_v1(uuid,uuid,uuid,text,text,text,text) to service_role;
comment on function public.provision_tkid_origin_registry_access_v1(uuid,uuid,uuid,text,text,text,text) is 'Audited operator provisioning of active context access and a tenant-scoped TKID origin registry allow override.';
