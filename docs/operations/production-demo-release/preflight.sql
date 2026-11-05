-- READ-ONLY compatibility assertions. Run only through an approved production connection.
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
