-- Explicit repair for an existing client. Never replaces an account, organization,
-- existing workspace, connection or offer. Repeated/concurrent calls reuse context.
create function public.ws021_prepare_client_context(
  p_actor uuid,p_identity text,p_correlation text,p_account uuid,p_org uuid
) returns text language plpgsql security invoker set search_path='' as $$
declare v_org public.tracekit_organizations%rowtype; v_context text;
begin
  perform public.ws021_assert_admin(p_actor,p_identity,'organizations.manage');
  perform 1 from public.tracekit_accounts
    where id=p_account and account_type='client' and status='active' for share;
  if not found then raise exception 'Resource unavailable' using errcode='42501'; end if;
  select * into v_org from public.tracekit_organizations
    where id=p_org and owning_account_id=p_account and status='active' for update;
  if v_org.id is null or not exists(select 1 from public.tracekit_accounts
    where id=p_account and account_type='client' and status='active') then
    raise exception 'Resource unavailable' using errcode='42501';
  end if;
  if exists(select 1 from public.tracekit_business_contexts where organization_id=p_org
    and (account_id<>p_account or status<>'active')) then
    raise exception 'Existing workspace requires review' using errcode='42501';
  end if;
  select id into v_context from public.tracekit_business_contexts
    where organization_id=p_org and account_id=p_account and status='active'
    order by created_at,id limit 1;
  if v_context is not null then return v_context; end if;
  v_context:='client-'||p_org::text;
  insert into public.tracekit_business_contexts(id,account_id,organization_id,name)
    values(v_context,p_account,p_org,v_org.name);
  insert into public.tracekit_audit_events(actor_user_id,authenticated_identity_id,
    account_id,organization_id,action,target_type,target_id,result,
    permission_evaluated,correlation_id,metadata)
    values(p_actor,p_identity,p_account,p_org,'platform.client.workspace_created',
    'business_context',v_context,'success','organizations.manage',p_correlation,'{}');
  return v_context;
end $$;

-- A restriction on an invitation, not a new role or a global role edit. This
-- policy is persisted in the same transaction that issues/reuses the invitation.
create table public.tracekit_orders_only_invitations (
  invitation_id uuid primary key references public.tracekit_invitations(id),
  restricted_by_user_id uuid not null references public.tracekit_users(id),
  created_at timestamptz not null default now()
);
alter table public.tracekit_orders_only_invitations enable row level security;
revoke all on public.tracekit_orders_only_invitations from public,anon,authenticated;
grant select,insert on public.tracekit_orders_only_invitations to service_role;

create function public.ws021_issue_orders_only_invitation(
  p_actor_id uuid,p_identity_id text,p_correlation_id text,p_membership_id uuid,
  p_invitation_id uuid,p_organization_id uuid,p_email text,p_context_ids text[]
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_claim jsonb;
begin
  -- This new supported control is platform-admin only; it cannot widen access.
  perform public.ws021_assert_admin(p_actor_id,p_identity_id,'users.invite');
  perform public.ws021_assert_admin(p_actor_id,p_identity_id,'users.manage_permissions');
  v_claim:=public.tracekit_invitation_delivery('issue',p_actor_id,p_identity_id,
    p_correlation_id,p_membership_id,p_organization_id,p_invitation_id,p_email,p_context_ids);
  if coalesce((v_claim->>'ok')::boolean,false) then
    insert into public.tracekit_orders_only_invitations(invitation_id,restricted_by_user_id)
      values((v_claim->>'id')::uuid,p_actor_id) on conflict do nothing;
  end if;
  return v_claim;
end $$;

-- Existing verified-email acceptance remains the sole enrollment workflow.
-- The trigger runs inside that transaction: no active membership can commit
-- before both denials commit. A failed denial rolls back acceptance entirely.
create function public.ws021_apply_orders_only_denials()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_inv public.tracekit_invitations%rowtype; v_actor uuid; v_identity text;
begin
  select restricted_by_user_id into v_actor from public.tracekit_orders_only_invitations
    where invitation_id=new.invitation_id;
  if v_actor is null then return new; end if;
  select * into v_inv from public.tracekit_invitations where id=new.invitation_id for share;
  if new.organization_id is distinct from v_inv.target_organization_id
    or new.account_id is not null or new.role_id is distinct from v_inv.requested_role_id
    or not exists(select 1 from public.tracekit_roles where id=new.role_id
      and role_key='client-read-only' and account_type='client') then
    raise exception 'Restricted invitation scope mismatch' using errcode='42501';
  end if;
  insert into public.tracekit_permission_overrides(membership_id,organization_id,
    capability,effect,created_by_user_id,reason)
    select new.id,new.organization_id,capability,'deny',v_actor,'Orders-only customer invitation'
    from unnest(array['financials.view','orders.view_financials']) capability;
  select workos_user_id into v_identity from public.tracekit_users where id=v_actor;
  insert into public.tracekit_audit_events(actor_user_id,authenticated_identity_id,
    organization_id,action,target_type,target_id,result,permission_evaluated,correlation_id,metadata)
    values(v_actor,v_identity,new.organization_id,'membership.financial_access_denied',
    'membership',new.id::text,'success','users.manage_permissions',new.invitation_id::text,
    jsonb_build_object('invitationId',new.invitation_id,'capabilities',array['financials.view','orders.view_financials']));
  return new;
end $$;
create trigger ws021_orders_only_membership_denials
  after insert on public.tracekit_memberships for each row when (new.invitation_id is not null)
  execute function public.ws021_apply_orders_only_denials();

revoke all on function public.ws021_prepare_client_context(uuid,text,text,uuid,uuid),
  public.ws021_issue_orders_only_invitation(uuid,text,text,uuid,uuid,uuid,text,text[]),
  public.ws021_apply_orders_only_denials() from public,anon,authenticated;
grant execute on function public.ws021_prepare_client_context(uuid,text,text,uuid,uuid),
  public.ws021_issue_orders_only_invitation(uuid,text,text,uuid,uuid,uuid,text,text[]) to service_role;
