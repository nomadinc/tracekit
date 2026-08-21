-- Atomic Team Management mutations for invitation acceptance and owner-safe membership changes.

create or replace function public.accept_tracekit_team_invitation(
  p_invitation_id uuid,
  p_accepted_by_user_id uuid,
  p_authenticated_identity_id text,
  p_correlation_id text
)
returns table(membership_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invitation public.tracekit_invitations%rowtype;
  v_user public.tracekit_users%rowtype;
  v_role public.tracekit_roles%rowtype;
  v_account_type text;
  v_audit_account_id uuid;
  v_existing_membership_id uuid;
  v_membership_id uuid;
begin
  if nullif(btrim(p_authenticated_identity_id), '') is null or nullif(btrim(p_correlation_id), '') is null then
    raise exception 'invalid_audit_context';
  end if;

  select * into v_invitation
  from public.tracekit_invitations
  where id = p_invitation_id
  for update;

  if not found then
    raise exception 'invitation_unavailable';
  end if;
  if v_invitation.status <> 'pending' or v_invitation.expires_at <= now() then
    if v_invitation.status = 'pending' and v_invitation.expires_at <= now() then
      update public.tracekit_invitations
      set status = 'expired', updated_at = now()
      where id = v_invitation.id;
    end if;
    raise exception 'invitation_unavailable';
  end if;
  if num_nonnulls(v_invitation.target_account_id, v_invitation.target_organization_id) <> 1 then
    raise exception 'invalid_invitation_target';
  end if;

  select * into v_user
  from public.tracekit_users
  where id = p_accepted_by_user_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'authenticated_user_unavailable';
  end if;
  if lower(btrim(v_user.primary_email)) <> lower(btrim(v_invitation.intended_email)) then
    raise exception 'identity_mismatch';
  end if;

  select * into v_role
  from public.tracekit_roles
  where id = v_invitation.requested_role_id
    and system_role = true;

  if not found then
    raise exception 'invalid_role';
  end if;

  if v_invitation.target_account_id is not null then
    select id, account_type into v_audit_account_id, v_account_type
    from public.tracekit_accounts
    where id = v_invitation.target_account_id
      and status = 'active';
  else
    select a.id, a.account_type into v_audit_account_id, v_account_type
    from public.tracekit_organizations o
    join public.tracekit_accounts a on a.id = o.owning_account_id
    where o.id = v_invitation.target_organization_id
      and o.status = 'active'
      and a.status = 'active';
  end if;

  if v_account_type is null or v_role.account_type <> v_account_type then
    raise exception 'invalid_role';
  end if;

  if v_invitation.target_account_id is not null then
    select id into v_existing_membership_id
    from public.tracekit_memberships
    where user_id = p_accepted_by_user_id
      and account_id = v_invitation.target_account_id
    for update;
  else
    select id into v_existing_membership_id
    from public.tracekit_memberships
    where user_id = p_accepted_by_user_id
      and organization_id = v_invitation.target_organization_id
    for update;
  end if;

  if v_existing_membership_id is not null then
    raise exception 'membership_exists';
  end if;

  insert into public.tracekit_memberships (
    user_id,
    account_id,
    organization_id,
    role_id,
    invitation_id,
    status,
    effective_from,
    updated_at
  ) values (
    p_accepted_by_user_id,
    v_invitation.target_account_id,
    v_invitation.target_organization_id,
    v_invitation.requested_role_id,
    v_invitation.id,
    'active',
    now(),
    now()
  ) returning id into v_membership_id;

  update public.tracekit_invitations
  set status = 'accepted',
      accepted_by_user_id = p_accepted_by_user_id,
      accepted_at = now(),
      updated_at = now()
  where id = v_invitation.id;

  insert into public.tracekit_audit_events (
    actor_user_id,
    authenticated_identity_id,
    account_id,
    organization_id,
    action,
    target_type,
    target_id,
    result,
    permission_evaluated,
    correlation_id,
    metadata
  ) values (
    p_accepted_by_user_id,
    p_authenticated_identity_id,
    v_audit_account_id,
    v_invitation.target_organization_id,
    'team.invitation.accepted',
    'invitation',
    v_invitation.id::text,
    'success',
    null,
    p_correlation_id,
    jsonb_build_object('membership_id', v_membership_id, 'role', v_role.role_key)
  );

  return query select v_membership_id;
end;
$$;

create or replace function public.mutate_tracekit_team_membership(
  p_membership_id uuid,
  p_new_role_key text default null,
  p_new_status text default null,
  p_actor_user_id uuid default null,
  p_authenticated_identity_id text default null,
  p_permission_evaluated text default null,
  p_correlation_id text default null
)
returns table(membership_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_membership public.tracekit_memberships%rowtype;
  v_current_role public.tracekit_roles%rowtype;
  v_new_role public.tracekit_roles%rowtype;
  v_scope_account_type text;
  v_audit_account_id uuid;
  v_owner_role_key text;
  v_next_status text;
  v_owner_count integer;
  v_new_role_id uuid;
  v_removes_ownership boolean := false;
begin
  if p_actor_user_id is null
     or nullif(btrim(p_authenticated_identity_id), '') is null
     or nullif(btrim(p_correlation_id), '') is null
     or p_permission_evaluated not in ('users.remove', 'users.manage_permissions') then
    raise exception 'invalid_audit_context';
  end if;
  if not exists (
    select 1 from public.tracekit_users
    where id = p_actor_user_id and status = 'active'
  ) then
    raise exception 'actor_unavailable';
  end if;

  select * into v_membership
  from public.tracekit_memberships
  where id = p_membership_id
  for update;

  if not found then
    raise exception 'membership_unavailable';
  end if;

  select * into v_current_role
  from public.tracekit_roles
  where id = v_membership.role_id;

  if not found then
    raise exception 'invalid_role';
  end if;

  if v_membership.account_id is not null then
    select id, account_type into v_audit_account_id, v_scope_account_type
    from public.tracekit_accounts
    where id = v_membership.account_id;
  else
    select a.id, a.account_type into v_audit_account_id, v_scope_account_type
    from public.tracekit_organizations o
    join public.tracekit_accounts a on a.id = o.owning_account_id
    where o.id = v_membership.organization_id;
  end if;

  if v_scope_account_type is null then
    raise exception 'membership_scope_unavailable';
  end if;

  v_next_status := coalesce(p_new_status, v_membership.status);
  if v_next_status not in ('invited', 'active', 'suspended', 'removed') then
    raise exception 'invalid_transition';
  end if;

  if v_membership.status <> v_next_status then
    if v_membership.status = 'invited' and v_next_status not in ('active', 'suspended', 'removed') then
      raise exception 'invalid_transition';
    elsif v_membership.status = 'active' and v_next_status not in ('suspended', 'removed') then
      raise exception 'invalid_transition';
    elsif v_membership.status = 'suspended' and v_next_status not in ('active', 'removed') then
      raise exception 'invalid_transition';
    elsif v_membership.status = 'removed' then
      raise exception 'invalid_transition';
    end if;
  end if;

  if p_new_role_key is not null then
    select * into v_new_role
    from public.tracekit_roles
    where role_key = p_new_role_key
      and account_type = v_scope_account_type
      and system_role = true;
    if not found then
      raise exception 'invalid_role';
    end if;
    v_new_role_id := v_new_role.id;
  else
    v_new_role := v_current_role;
    v_new_role_id := v_current_role.id;
  end if;

  v_owner_role_key := case v_scope_account_type
    when 'platform' then 'platform-owner'
    when 'agency' then 'agency-owner'
    when 'client' then 'organization-owner'
    else null
  end;

  if v_current_role.role_key = v_owner_role_key and v_membership.status = 'active' then
    v_removes_ownership := v_new_role.role_key <> v_owner_role_key or v_next_status <> 'active';
  end if;

  if v_removes_ownership then
    if v_membership.account_id is not null then
      perform pg_advisory_xact_lock(hashtext('tracekit:team-owner:account:' || v_membership.account_id::text));
      select count(*) into v_owner_count
      from public.tracekit_memberships m
      join public.tracekit_roles r on r.id = m.role_id
      where m.account_id = v_membership.account_id
        and m.status = 'active'
        and r.role_key = v_owner_role_key;
    else
      perform pg_advisory_xact_lock(hashtext('tracekit:team-owner:organization:' || v_membership.organization_id::text));
      select count(*) into v_owner_count
      from public.tracekit_memberships m
      join public.tracekit_roles r on r.id = m.role_id
      where m.organization_id = v_membership.organization_id
        and m.status = 'active'
        and r.role_key = v_owner_role_key;
    end if;

    if v_owner_count <= 1 then
      raise exception 'final_owner';
    end if;
  end if;

  update public.tracekit_memberships
  set role_id = v_new_role_id,
      status = v_next_status,
      effective_until = case when v_next_status = 'removed' then coalesce(effective_until, now()) else effective_until end,
      updated_at = now()
  where id = v_membership.id;

  insert into public.tracekit_audit_events (
    actor_user_id,
    authenticated_identity_id,
    account_id,
    organization_id,
    action,
    target_type,
    target_id,
    result,
    permission_evaluated,
    correlation_id,
    metadata
  ) values (
    p_actor_user_id,
    p_authenticated_identity_id,
    v_audit_account_id,
    v_membership.organization_id,
    'team.membership.updated',
    'membership',
    v_membership.id::text,
    'success',
    p_permission_evaluated,
    p_correlation_id,
    jsonb_build_object(
      'previous_role', v_current_role.role_key,
      'new_role', v_new_role.role_key,
      'previous_status', v_membership.status,
      'new_status', v_next_status
    )
  );

  return query select v_membership.id;
end;
$$;

revoke all on function public.accept_tracekit_team_invitation(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.mutate_tracekit_team_membership(uuid, text, text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.accept_tracekit_team_invitation(uuid, uuid, text, text) to service_role;
grant execute on function public.mutate_tracekit_team_membership(uuid, text, text, uuid, text, text, text) to service_role;
