-- WorkOS authenticates the actor; only the server service role may call this RPC.
-- Invitation IDs convey no authority: acceptance requires a verified intended identity.
alter table public.tracekit_invitations add column if not exists business_context_ids text[] not null default '{}';

create or replace function public.tracekit_customer_invitation(
  p_operation text, p_actor_id uuid, p_identity_id text, p_correlation_id text,
  p_invitation_id uuid, p_membership_id uuid default null,
  p_organization_id uuid default null, p_email text default null,
  p_context_ids text[] default null, p_email_verified boolean default false
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_user public.tracekit_users%rowtype;
  v_inv public.tracekit_invitations%rowtype;
  v_member public.tracekit_memberships%rowtype;
  v_role text;
  v_role_id uuid;
  v_org public.tracekit_organizations%rowtype;
  v_id uuid;
  v_reason text;
  v_platform boolean := false;
begin
  select * into v_user from public.tracekit_users where id=p_actor_id and workos_user_id=p_identity_id and status='active' for update;
  if not found then return jsonb_build_object('ok',false,'reason','unavailable'); end if;
  if p_operation not in ('issue','accept','revoke') then return jsonb_build_object('ok',false,'reason','unavailable'); end if;
  if p_operation='issue' then
    select * into v_org from public.tracekit_organizations where id=p_organization_id and status='active' for share;
  else
    select * into v_inv from public.tracekit_invitations where id=p_invitation_id for update;
    if not found then v_reason := 'unavailable'; end if;
    select * into v_org from public.tracekit_organizations where id=v_inv.target_organization_id and status='active' for share;
  end if;
  if v_org.id is null or not exists(select 1 from public.tracekit_accounts where id=v_org.owning_account_id and status='active' and account_type='client') then v_reason := 'unavailable'; end if;

  if p_operation in ('issue','revoke') and v_reason is null then
    select * into v_member from public.tracekit_memberships where id=p_membership_id and user_id=p_actor_id and status='active' and effective_from<=now() and (effective_until is null or effective_until>now()) for share;
    select role_key into v_role from public.tracekit_roles where id=v_member.role_id;
    v_platform := v_role in ('platform-owner','platform-admin') and exists(select 1 from public.tracekit_accounts where id=v_member.account_id and account_type='platform' and status='active');
    if not coalesce((v_platform or (v_role in ('organization-owner','organization-admin') and v_member.organization_id=v_org.id)),false)
      or exists(select 1 from public.tracekit_permission_overrides where membership_id=v_member.id and capability='users.invite' and effect='deny' and (organization_id is null or organization_id=v_org.id)) then v_reason := 'unavailable'; end if;
  end if;

  if v_reason is null and p_operation='issue' then
    if p_email is null or length(trim(p_email))>254 or trim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or cardinality(p_context_ids) is null or cardinality(p_context_ids)=0 then v_reason := 'invalid_request';
    elsif exists(select 1 from unnest(p_context_ids) as x(id) where not exists(select 1 from public.tracekit_business_contexts c where c.id=x.id and c.organization_id=v_org.id and c.status='active') or (not v_platform and not exists(select 1 from public.tracekit_business_context_access a where a.membership_id=v_member.id and a.organization_id=v_org.id and a.business_context_id=x.id and a.status='active'))) then v_reason := 'unavailable';
    else
      select id into v_role_id from public.tracekit_roles where role_key='client-read-only' and account_type='client';
      if v_role_id is null then v_reason := 'unavailable';
      else
        insert into public.tracekit_invitations(id,inviter_user_id,intended_email,target_organization_id,requested_role_id,expires_at,business_context_ids)
        values(p_invitation_id,p_actor_id,lower(trim(p_email)),v_org.id,v_role_id,now()+interval '7 days',p_context_ids)
        on conflict (id) do nothing returning id into v_id;
        if v_id is null then v_reason := 'unavailable'; end if;
      end if;
    end if;
  elsif v_reason is null and p_operation='revoke' then
    if v_inv.status<>'pending' or (p_organization_id is not null and p_organization_id<>v_org.id) then v_reason := 'unavailable';
    else update public.tracekit_invitations set status='revoked',updated_at=now() where id=v_inv.id; v_id:=v_inv.id; end if;
  elsif v_reason is null and p_operation='accept' then
    select role_key into v_role from public.tracekit_roles where id=v_inv.requested_role_id and account_type='client';
    if v_inv.status<>'pending' then v_reason := 'unavailable';
    elsif v_inv.expires_at<=now() then
      update public.tracekit_invitations set status='expired',updated_at=now() where id=v_inv.id;
      v_reason := 'expired';
    elsif not p_email_verified or lower(trim(v_user.primary_email))<>lower(trim(v_inv.intended_email)) then v_reason := 'identity_mismatch';
    elsif v_inv.target_account_id is not null or v_role is distinct from 'client-read-only' or cardinality(v_inv.business_context_ids)=0 then v_reason := 'unavailable';
    elsif exists(select 1 from unnest(v_inv.business_context_ids) x(id) where not exists(select 1 from public.tracekit_business_contexts c where c.id=x.id and c.organization_id=v_org.id and c.status='active')) then v_reason := 'unavailable';
    elsif exists(select 1 from public.tracekit_memberships where user_id=p_actor_id and organization_id=v_org.id) then v_reason := 'existing_membership';
    else
      insert into public.tracekit_memberships(user_id,organization_id,role_id,invitation_id) values(p_actor_id,v_org.id,v_inv.requested_role_id,v_inv.id) returning id into v_id;
      insert into public.tracekit_business_context_access(membership_id,organization_id,business_context_id)
        select v_id,v_org.id,id from (select distinct unnest(v_inv.business_context_ids) id) contexts;
      update public.tracekit_invitations set status='accepted',accepted_by_user_id=p_actor_id,accepted_at=now(),updated_at=now() where id=v_inv.id;
    end if;
  end if;
  insert into public.tracekit_audit_events(actor_user_id,authenticated_identity_id,organization_id,action,target_type,target_id,result,permission_evaluated,correlation_id,metadata)
  values(p_actor_id,p_identity_id,v_org.id,'invitation.'||p_operation,'invitation',p_invitation_id::text,case when v_reason is null then 'success' else 'denied' end,case when p_operation='accept' then null else 'users.invite' end,p_correlation_id,jsonb_build_object('reason',v_reason,'role','client-read-only'));
  return jsonb_build_object('ok',v_reason is null,'reason',v_reason,'id',v_id,'organizationId',case when v_reason is null then v_org.id else null end);
end $$;
revoke all on function public.tracekit_customer_invitation(text,uuid,text,text,uuid,uuid,uuid,text,text[],boolean) from public,anon,authenticated;
grant execute on function public.tracekit_customer_invitation(text,uuid,text,text,uuid,uuid,uuid,text,text[],boolean) to service_role;
