-- PREPARED ONLY. Requires separate Master migration execution authorization.
-- Use psql -X --set ON_ERROR_STOP=1 --file controlled-install.sql via approved PGSERVICE.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SET LOCAL idle_in_transaction_session_timeout='60s';
DO $ws021_install$
DECLARE original_sql text := $ws021_original$-- Explicit repair for an existing client. Never replaces an account, organization,
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
$ws021_original$;
BEGIN
 if current_user<>'postgres' or session_user<>'postgres' then raise exception 'Migration administrator required'; end if;
 perform pg_advisory_xact_lock(hashtext('tracekit/ws021/onboarding/20261105162517'));
 if exists(select 1 from supabase_migrations.schema_migrations where version='20261105162517') then
   if not exists(select 1 from supabase_migrations.schema_migrations where version='20261105162517' and name='ws021_client_context_orders_only_onboarding' and statements=ARRAY[original_sql]) then raise exception 'Migration ledger mismatch; do not reapply'; end if;
 else
 execute $ws021_pre_sql$-- READ-ONLY compatibility assertions. Run only through an approved production connection.
DO $ws021_preflight$
BEGIN
 if current_user <> 'postgres' or session_user <> 'postgres' then
   raise exception 'Requires approved postgres migration administrator, not application runtime';
 end if;
 if not exists(select 1 from public.tracekit_accounts where id='26a6eabb-2ddc-4b0d-8bf2-ce61c2ca700f' and account_type='client' and status='active')
 or not exists(select 1 from public.tracekit_organizations where id='ab757103-4ad9-4fd8-a3f1-3f5adaee9b03' and owning_account_id='26a6eabb-2ddc-4b0d-8bf2-ce61c2ca700f' and status='active')
 or not exists(select 1 from public.tracekit_users where id='92575f17-e049-4069-ab57-52c196994e6b' and workos_user_id='user_01M4Y67KBET8XEQQGTR9Z9AK03' and lower(primary_email)='spongant@mac.com' and status='active') then
   raise exception 'Approved NH account/organization/identity changed';
 end if;
 if exists(select 1 from public.tracekit_business_contexts where organization_id='ab757103-4ad9-4fd8-a3f1-3f5adaee9b03' or id='client-ab757103-4ad9-4fd8-a3f1-3f5adaee9b03')
 or exists(select 1 from public.tracekit_memberships where organization_id='ab757103-4ad9-4fd8-a3f1-3f5adaee9b03')
 or exists(select 1 from public.tracekit_invitations where target_organization_id='ab757103-4ad9-4fd8-a3f1-3f5adaee9b03') then
   raise exception 'NH enrollment state changed; refresh reviewed evidence before installation';
 end if;
 if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='ws021_assert_admin' and not p.prosecdef and md5(p.prosrc)='eacdd6b1150d0d64bf48b6620fd430bb' and has_function_privilege('service_role',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE'))<>1 then raise exception 'Dependency mismatch: ws021_assert_admin'; end if;
 if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='tracekit_customer_invitation' and not p.prosecdef and md5(p.prosrc)='e5e6205166327912bbf84a17e6cb5a1b' and has_function_privilege('service_role',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE'))<>1 then raise exception 'Dependency mismatch: tracekit_customer_invitation'; end if;
 if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='tracekit_invitation_delivery' and not p.prosecdef and md5(p.prosrc)='c329ad0aad0be2a91522dcd35ad0ec39' and has_function_privilege('service_role',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE'))<>1 then raise exception 'Dependency mismatch: tracekit_invitation_delivery'; end if;
 if to_regclass('public.tracekit_orders_only_invitations') is not null then raise exception 'Unrecorded policy table conflict'; end if;
 if to_regprocedure('public.ws021_prepare_client_context(uuid,text,text,uuid,uuid)') is not null then raise exception 'Unrecorded function conflict: ws021_prepare_client_context(uuid,text,text,uuid,uuid)'; end if;
 if to_regprocedure('public.ws021_issue_orders_only_invitation(uuid,text,text,uuid,uuid,uuid,text,text[])') is not null then raise exception 'Unrecorded function conflict: ws021_issue_orders_only_invitation(uuid,text,text,uuid,uuid,uuid,text,text[])'; end if;
 if to_regprocedure('public.ws021_apply_orders_only_denials()') is not null then raise exception 'Unrecorded function conflict: ws021_apply_orders_only_denials()'; end if;
 if exists(select 1 from pg_trigger where tgrelid='public.tracekit_memberships'::regclass and tgname='ws021_orders_only_membership_denials') then raise exception 'Unrecorded trigger conflict'; end if;
END $ws021_preflight$;
$ws021_pre_sql$;
 execute original_sql;
 insert into supabase_migrations.schema_migrations(version,name,statements,created_by)
 values('20261105162517','ws021_client_context_orders_only_onboarding',ARRAY[original_sql],session_user);
 end if;
END $ws021_install$;
-- READ-ONLY post-install checks; never grants or modifies customer access.
DO $ws021_verify$
BEGIN
 if to_regclass('public.tracekit_orders_only_invitations') is null then raise exception 'Policy table missing'; end if;
 if not (select relrowsecurity from pg_class where oid='public.tracekit_orders_only_invitations'::regclass)
 or has_table_privilege('anon','public.tracekit_orders_only_invitations','SELECT,INSERT,UPDATE,DELETE')
 or has_table_privilege('authenticated','public.tracekit_orders_only_invitations','SELECT,INSERT,UPDATE,DELETE')
 or not has_table_privilege('service_role','public.tracekit_orders_only_invitations','SELECT')
 or not has_table_privilege('service_role','public.tracekit_orders_only_invitations','INSERT') then raise exception 'Policy table boundary mismatch'; end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.ws021_prepare_client_context(uuid,text,text,uuid,uuid)') and not prosecdef and md5(prosrc)='ae8bfea1f7d2457973023c8c086668b6') then raise exception 'Installed body mismatch: ws021_prepare_client_context'; end if;
 if not has_function_privilege('service_role','public.ws021_prepare_client_context(uuid,text,text,uuid,uuid)','EXECUTE') or has_function_privilege('anon','public.ws021_prepare_client_context(uuid,text,text,uuid,uuid)','EXECUTE') or has_function_privilege('authenticated','public.ws021_prepare_client_context(uuid,text,text,uuid,uuid)','EXECUTE') then raise exception 'RPC access mismatch: ws021_prepare_client_context'; end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.ws021_issue_orders_only_invitation(uuid,text,text,uuid,uuid,uuid,text,text[])') and not prosecdef and md5(prosrc)='e18e21fb963d0d33e364040a833735d7') then raise exception 'Installed body mismatch: ws021_issue_orders_only_invitation'; end if;
 if not has_function_privilege('service_role','public.ws021_issue_orders_only_invitation(uuid,text,text,uuid,uuid,uuid,text,text[])','EXECUTE') or has_function_privilege('anon','public.ws021_issue_orders_only_invitation(uuid,text,text,uuid,uuid,uuid,text,text[])','EXECUTE') or has_function_privilege('authenticated','public.ws021_issue_orders_only_invitation(uuid,text,text,uuid,uuid,uuid,text,text[])','EXECUTE') then raise exception 'RPC access mismatch: ws021_issue_orders_only_invitation'; end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.ws021_apply_orders_only_denials()') and not prosecdef and md5(prosrc)='c0f20948fb650a170b2bf2dd01d47cf4') then raise exception 'Installed body mismatch: ws021_apply_orders_only_denials'; end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.tracekit_memberships'::regclass and tgname='ws021_orders_only_membership_denials' and tgfoid='public.ws021_apply_orders_only_denials()'::regprocedure and tgtype=5 and tgenabled='O' and position('invitation_id IS NOT NULL' in pg_get_triggerdef(oid))>0) then raise exception 'Acceptance trigger missing or disabled'; end if;
 if exists(select 1 from public.tracekit_orders_only_invitations p join public.tracekit_invitations i on i.id=p.invitation_id join public.tracekit_memberships m on m.invitation_id=i.id where m.status='active' and (
 m.organization_id is distinct from i.target_organization_id or m.account_id is not null
 or (select count(distinct o.capability) from public.tracekit_permission_overrides o where o.membership_id=m.id and o.organization_id=m.organization_id and o.effect='deny' and o.resource_type is null and o.resource_id is null and o.capability in ('financials.view','orders.view_financials'))<>2)) then raise exception 'Accepted restricted membership lacks its complete denials'; end if;
 if (select count(*) from pg_constraint where conrelid='public.tracekit_orders_only_invitations'::regclass and contype='p')<>1
 or (select count(*) from pg_constraint where conrelid='public.tracekit_orders_only_invitations'::regclass and contype='f' and convalidated)<>2
 or has_table_privilege('service_role','public.tracekit_orders_only_invitations','UPDATE,DELETE') then raise exception 'Policy integrity/immutability mismatch'; end if;
END $ws021_verify$;
COMMIT;
