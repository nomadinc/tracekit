-- Execute only against a disposable representative local database.
BEGIN;
\set ON_ERROR_STOP on
insert into tracekit_users(id,workos_user_id,primary_email,display_name) values('00000000-0000-0000-0000-000000000001','operator','operator@example.test','Operator'),('00000000-0000-0000-0000-000000000002','customer','customer@example.test','Customer');
insert into tracekit_accounts(id,account_type,name) values('00000000-0000-0000-0000-000000000010','platform','Platform');
insert into tracekit_memberships(id,user_id,account_id,role_id) select '00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010',id from tracekit_roles where role_key='platform-owner';
SET LOCAL ROLE service_role;
DO $$
declare a uuid; b uuid; o uuid; foreign_org uuid; m uuid; agency uuid;
begin
 a := ws021_create_client('00000000-0000-0000-0000-000000000001','operator','Combined synthetic client','client','test');
 b := ws021_create_client('00000000-0000-0000-0000-000000000001','operator','Foreign synthetic client','client','test');
 agency := ws021_create_client('00000000-0000-0000-0000-000000000001','operator','Synthetic agency','agency','test');
 assert exists(select 1 from tracekit_agencies where account_id=agency);
 assert not exists(select 1 from tracekit_organizations where owning_account_id=agency);
 select id into o from tracekit_organizations where owning_account_id=a;
 select id into foreign_org from tracekit_organizations where owning_account_id=b;
 insert into tracekit_memberships(user_id,organization_id,role_id) select '00000000-0000-0000-0000-000000000002',o,id from tracekit_roles where role_key='organization-owner' returning id into m;
 begin perform ws021_change_membership('00000000-0000-0000-0000-000000000001','operator',a,foreign_org,m,'client-read-only',false,'test'); raise exception 'Expected foreign denial'; exception when insufficient_privilege then null; end;
 begin perform ws021_change_membership('00000000-0000-0000-0000-000000000001','operator',a,o,m,'client-read-only',false,'test'); raise exception 'Expected final-owner denial'; exception when raise_exception then if SQLERRM not like '%final owner%' then raise; end if; end;
 begin perform ws021_change_membership('00000000-0000-0000-0000-000000000001','operator',a,o,m,'platform-owner',false,'test'); raise exception 'Expected role denial'; exception when raise_exception then if SQLERRM <> 'Invalid role' then raise; end if; end;
 begin perform ws021_create_client('00000000-0000-0000-0000-000000000002','customer','Forbidden','client','test'); raise exception 'Expected customer denial'; exception when insufficient_privilege then null; end;
 insert into tracekit_permission_overrides(membership_id,capability,effect,reason) values('00000000-0000-0000-0000-000000000030','organizations.manage','deny','test');
 begin perform ws021_create_client('00000000-0000-0000-0000-000000000001','operator','Forbidden override','client','test'); raise exception 'Expected override denial'; exception when insufficient_privilege then null; end;
 assert exists(select 1 from tracekit_audit_events where target_id=a::text and action='platform.client.created');
 raise notice 'Actual Supabase service-role provisioning, tenant boundary, role restriction, final owner and override gates passed';
end $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ begin
 begin perform ws021_create_client('00000000-0000-0000-0000-000000000001','operator','Forbidden browser','client','test'); raise exception 'Expected browser denial'; exception when insufficient_privilege then null; end;
end $$;
RESET ROLE;
ROLLBACK;
