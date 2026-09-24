-- Audited, operator-authorized provisioning for the narrow TKID origin registry capability.
-- This does not alter any role's base permissions and does not touch TKID source,
-- origin, challenge, or verification state.
create or replace function public.provision_tkid_origin_registry_access_v1(
  p_requester_user_id uuid,
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
  v_access_created boolean := false;
  v_access_changed boolean := false;
  v_access_prior_status text;
  v_override_id uuid;
  v_override_created boolean := false;
  v_audit_event_id uuid;
  v_requester_membership_id uuid;
  v_account_id uuid;
begin
  if p_confirmation is distinct from 'provision-tkid-origin-registry-access'
     or p_requester_user_id is null or p_membership_id is null or p_organization_id is null
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

  -- Invocation is restricted to service_role. The supplied user is only the
  -- human requester/approver; it is not authenticated by this RPC and is never
  -- represented as the technical actor that executed the service operation.
  select requester_membership.id into v_requester_membership_id
  from public.tracekit_memberships requester_membership
  where requester_membership.user_id=p_requester_user_id
    and requester_membership.organization_id=p_organization_id
    and requester_membership.status='active'
    and requester_membership.effective_from<=now()
    and (requester_membership.effective_until is null or requester_membership.effective_until>now())
  order by requester_membership.created_at
  limit 1;
  if v_requester_membership_id is null then
    raise exception 'requester is unavailable in target tenant';
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

  select id,status into v_access_id,v_access_prior_status
  from public.tracekit_business_context_access
  where membership_id=p_membership_id and organization_id=p_organization_id
    and business_context_id=p_business_context_id
  for update;
  if v_access_id is null then
    insert into public.tracekit_business_context_access(membership_id,organization_id,business_context_id,status)
    values(p_membership_id,p_organization_id,p_business_context_id,'active')
    returning id into v_access_id;
    v_access_created := true;
    v_access_changed := true;
  elsif v_access_prior_status <> 'active' then
    update public.tracekit_business_context_access set status='active'
    where id=v_access_id;
    v_access_changed := true;
  end if;

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
      'tkid_origin_registry',null,null,btrim(p_reason)
    ) returning id into v_override_id;
    v_override_created := true;
  end if;

  insert into public.tracekit_audit_events(
    actor_user_id,account_id,organization_id,action,target_type,target_id,result,
    permission_evaluated,correlation_id,metadata
  ) values(
    null,v_account_id,p_organization_id,
    'authorization.tkid_origin_registry.provisioned','membership',p_membership_id::text,
    'success','admin.manage_feature_access',btrim(p_correlation_id),
    jsonb_build_object(
      'execution_context','service_role_operator_provisioning',
      'requester_user_id',p_requester_user_id,
      'requester_membership_id',v_requester_membership_id,
      'requester_identity_authenticated',false,
      'business_context_id',p_business_context_id,
      'access_id',v_access_id,
      'access_created',v_access_created,
      'access_changed',v_access_changed,
      'access_prior_status',v_access_prior_status,
      'access_resulting_status','active',
      'override_id',v_override_id,
      'override_created',v_override_created,
      'override_reused',not v_override_created,
      'resource_type','tkid_origin_registry',
      'resource_id',null,
      'reason',btrim(p_reason)
    )
  ) returning id into v_audit_event_id;

  -- Rollback uses this operation's evidence, never IDs alone: delete rows only
  -- when their *_created flag is true; otherwise restore access_prior_status
  -- only when access_changed is true. Reused overrides remain untouched.
  return jsonb_build_object(
    'membership_id',p_membership_id,
    'organization_id',p_organization_id,
    'business_context_id',p_business_context_id,
    'access_id',v_access_id,
    'access_created',v_access_created,
    'access_changed',v_access_changed,
    'access_prior_status',v_access_prior_status,
    'access_resulting_status','active',
    'override_id',v_override_id,
    'override_created',v_override_created,
    'override_reused',not v_override_created,
    'resource_type','tkid_origin_registry',
    'resource_id',null,
    'requester_user_id',p_requester_user_id,
    'requester_membership_id',v_requester_membership_id,
    'execution_context','service_role_operator_provisioning',
    'audit_event_id',v_audit_event_id,
    'correlation_id',btrim(p_correlation_id)
  );
end;
$$;

revoke all on function public.provision_tkid_origin_registry_access_v1(uuid,uuid,uuid,text,text,text,text) from public,anon,authenticated,authenticator;
grant execute on function public.provision_tkid_origin_registry_access_v1(uuid,uuid,uuid,text,text,text,text) to service_role;
comment on function public.provision_tkid_origin_registry_access_v1(uuid,uuid,uuid,text,text,text,text) is 'Audited operator provisioning of active context access and a tenant-scoped TKID origin registry allow override.';
