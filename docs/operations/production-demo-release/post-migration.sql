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
