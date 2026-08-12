begin;

select plan(26);

create or replace procedure pg_temp.converge_tracekit_memberships_invitation_fk()
language plpgsql
as $procedure$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.tracekit_memberships'::regclass
      and c.conname = 'tracekit_memberships_invitation_fk'
      and c.contype = 'f'
      and c.conkey = array[(
        select a.attnum
        from pg_catalog.pg_attribute a
        where a.attrelid = 'public.tracekit_memberships'::regclass
          and a.attname = 'invitation_id'
          and not a.attisdropped
      )]::smallint[]
      and c.confrelid = 'public.tracekit_invitations'::regclass
      and c.confkey = array[(
        select a.attnum
        from pg_catalog.pg_attribute a
        where a.attrelid = 'public.tracekit_invitations'::regclass
          and a.attname = 'id'
          and not a.attisdropped
      )]::smallint[]
      and c.confupdtype = 'a'
      and c.confdeltype = 'a'
      and c.convalidated
  ) then
    if exists (
      select 1
      from pg_catalog.pg_constraint c
      where c.conrelid = 'public.tracekit_memberships'::regclass
        and c.conname = 'tracekit_memberships_invitation_fk'
    ) then
      raise exception
        'tracekit_memberships_invitation_fk exists with an incompatible definition';
    end if;

    alter table public.tracekit_memberships
      add constraint tracekit_memberships_invitation_fk
      foreign key (invitation_id)
      references public.tracekit_invitations(id);
  end if;
end
$procedure$;

select is(
  (select count(*)::integer from pg_catalog.pg_constraint
   where conrelid = 'public.tracekit_memberships'::regclass
     and conname = 'tracekit_memberships_invitation_fk'),
  1,
  'invitation FK exists exactly once after migration 038'
);
select is(
  (select pg_catalog.pg_get_constraintdef(oid, false) from pg_catalog.pg_constraint
   where conrelid = 'public.tracekit_memberships'::regclass
     and conname = 'tracekit_memberships_invitation_fk'),
  'FOREIGN KEY (invitation_id) REFERENCES tracekit_invitations(id)',
  'invitation FK has the intended source and target'
);
select is((select confupdtype from pg_catalog.pg_constraint where conrelid = 'public.tracekit_memberships'::regclass and conname = 'tracekit_memberships_invitation_fk'), 'a'::"char", 'invitation FK uses ON UPDATE NO ACTION');
select is((select confdeltype from pg_catalog.pg_constraint where conrelid = 'public.tracekit_memberships'::regclass and conname = 'tracekit_memberships_invitation_fk'), 'a'::"char", 'invitation FK uses ON DELETE NO ACTION');
select is((select convalidated from pg_catalog.pg_constraint where conrelid = 'public.tracekit_memberships'::regclass and conname = 'tracekit_memberships_invitation_fk'), true, 'invitation FK is validated');

select lives_ok(
  'call pg_temp.converge_tracekit_memberships_invitation_fk()',
  'an exact existing invitation FK is accepted without duplicate creation'
);
select is(
  (select count(*)::integer from pg_catalog.pg_constraint
   where conrelid = 'public.tracekit_memberships'::regclass
     and conname = 'tracekit_memberships_invitation_fk'),
  1,
  'exact-existing convergence leaves one FK'
);

alter table public.tracekit_memberships drop constraint tracekit_memberships_invitation_fk;
select lives_ok(
  'call pg_temp.converge_tracekit_memberships_invitation_fk()',
  'an absent invitation FK is created'
);
select is(
  (select count(*)::integer from pg_catalog.pg_constraint
   where conrelid = 'public.tracekit_memberships'::regclass
     and conname = 'tracekit_memberships_invitation_fk'
     and contype = 'f'
     and confrelid = 'public.tracekit_invitations'::regclass
     and confupdtype = 'a'
     and confdeltype = 'a'
     and convalidated),
  1,
  'absent-case convergence creates exactly the validated intended FK'
);

alter table public.tracekit_memberships drop constraint tracekit_memberships_invitation_fk;
alter table public.tracekit_memberships
  add constraint tracekit_memberships_invitation_fk
  foreign key (invitation_id) references public.tracekit_invitations(id)
  on delete cascade;
select throws_ok(
  'call pg_temp.converge_tracekit_memberships_invitation_fk()',
  'P0001',
  'tracekit_memberships_invitation_fk exists with an incompatible definition',
  'a same-named incompatible invitation FK fails loudly'
);
select is(
  (select confdeltype from pg_catalog.pg_constraint
   where conrelid = 'public.tracekit_memberships'::regclass
     and conname = 'tracekit_memberships_invitation_fk'),
  'c'::"char",
  'failed incompatible convergence does not replace or weaken the conflicting FK'
);
alter table public.tracekit_memberships drop constraint tracekit_memberships_invitation_fk;
call pg_temp.converge_tracekit_memberships_invitation_fk();

insert into public.tracekit_users (id, workos_user_id, primary_email, display_name) values
  ('38000000-0000-0000-0000-000000000001', 'migration-038-user-1', 'user-1@example.invalid', 'Migration 038 User 1'),
  ('38000000-0000-0000-0000-000000000002', 'migration-038-user-2', 'user-2@example.invalid', 'Migration 038 User 2');
insert into public.tracekit_accounts (id, account_type, name)
values ('38000000-0000-0000-0000-000000000003', 'client', 'Migration 038 Account');
insert into public.tracekit_invitations
  (id, inviter_user_id, intended_email, target_account_id, requested_role_id, expires_at)
select
  '38000000-0000-0000-0000-000000000004',
  '38000000-0000-0000-0000-000000000001',
  'invitee@example.invalid',
  '38000000-0000-0000-0000-000000000003',
  id,
  now() + interval '1 day'
from public.tracekit_roles
where role_key = 'organization-admin';

select lives_ok($sql$
  insert into public.tracekit_memberships (user_id, account_id, role_id, invitation_id)
  select
    '38000000-0000-0000-0000-000000000001',
    '38000000-0000-0000-0000-000000000003',
    id,
    '38000000-0000-0000-0000-000000000004'
  from public.tracekit_roles where role_key = 'organization-admin'
$sql$, 'a valid invitation membership is accepted');
select throws_ok($sql$
  insert into public.tracekit_memberships (user_id, account_id, role_id, invitation_id)
  select
    '38000000-0000-0000-0000-000000000002',
    '38000000-0000-0000-0000-000000000003',
    id,
    '38ffffff-ffff-ffff-ffff-ffffffffffff'
  from public.tracekit_roles where role_key = 'organization-owner'
$sql$, '23503', null, 'an orphan invitation reference is rejected');

select is(
  (select count(*)::integer
   from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = any(array[
       'tracekit_users','tracekit_accounts','tracekit_agencies','tracekit_organizations',
       'tracekit_roles','tracekit_memberships','tracekit_permission_overrides',
       'tracekit_agency_client_assignments','tracekit_business_context_access',
       'tracekit_invitations','tracekit_audit_events'
     ])
     and c.relrowsecurity),
  11,
  'RLS is enabled on all migration 038 tables'
);
select is(
  (select count(*)::integer from pg_catalog.pg_policies
   where schemaname = 'public'
     and tablename = any(array[
       'tracekit_users','tracekit_accounts','tracekit_agencies','tracekit_organizations',
       'tracekit_roles','tracekit_memberships','tracekit_permission_overrides',
       'tracekit_agency_client_assignments','tracekit_business_context_access',
       'tracekit_invitations','tracekit_audit_events'
     ])),
  0,
  'migration 038 introduces no RLS policies'
);
select is(
  (select count(*)::integer
   from pg_catalog.pg_trigger tg
   join pg_catalog.pg_class c on c.oid = tg.tgrelid
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where not tg.tgisinternal
     and n.nspname = 'public'
     and c.relname = any(array[
       'tracekit_users','tracekit_accounts','tracekit_agencies','tracekit_organizations',
       'tracekit_roles','tracekit_memberships','tracekit_permission_overrides',
       'tracekit_agency_client_assignments','tracekit_business_context_access',
       'tracekit_invitations','tracekit_audit_events'
     ])),
  0,
  'migration 038 introduces no user triggers'
);

select is(
  (select bool_and(
     not has_table_privilege('anon', format('public.%I', table_name), 'SELECT')
     and not has_table_privilege('anon', format('public.%I', table_name), 'INSERT')
     and not has_table_privilege('anon', format('public.%I', table_name), 'UPDATE')
     and not has_table_privilege('anon', format('public.%I', table_name), 'DELETE')
     and not has_table_privilege('anon', format('public.%I', table_name), 'TRUNCATE')
     and not has_table_privilege('anon', format('public.%I', table_name), 'REFERENCES')
     and not has_table_privilege('anon', format('public.%I', table_name), 'TRIGGER'))
   from unnest(array[
     'tracekit_users','tracekit_accounts','tracekit_agencies','tracekit_organizations',
     'tracekit_roles','tracekit_memberships','tracekit_permission_overrides',
     'tracekit_agency_client_assignments','tracekit_business_context_access',
     'tracekit_invitations','tracekit_audit_events'
   ]) table_name),
  true,
  'anon has no privileges on all migration 038 tables'
);
select is(
  (select bool_and(
     not has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT')
     and not has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT')
     and not has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE')
     and not has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE')
     and not has_table_privilege('authenticated', format('public.%I', table_name), 'TRUNCATE')
     and not has_table_privilege('authenticated', format('public.%I', table_name), 'REFERENCES')
     and not has_table_privilege('authenticated', format('public.%I', table_name), 'TRIGGER'))
   from unnest(array[
     'tracekit_users','tracekit_accounts','tracekit_agencies','tracekit_organizations',
     'tracekit_roles','tracekit_memberships','tracekit_permission_overrides',
     'tracekit_agency_client_assignments','tracekit_business_context_access',
     'tracekit_invitations','tracekit_audit_events'
   ]) table_name),
  true,
  'authenticated has no privileges on all migration 038 tables'
);
select is(
  (select bool_and(
     has_table_privilege('service_role', format('public.%I', table_name), 'SELECT')
     and has_table_privilege('service_role', format('public.%I', table_name), 'INSERT')
     and has_table_privilege('service_role', format('public.%I', table_name), 'UPDATE')
     and has_table_privilege('service_role', format('public.%I', table_name), 'DELETE'))
   from unnest(array[
     'tracekit_users','tracekit_accounts','tracekit_agencies','tracekit_organizations',
     'tracekit_roles','tracekit_memberships','tracekit_permission_overrides',
     'tracekit_agency_client_assignments','tracekit_business_context_access',
     'tracekit_invitations','tracekit_audit_events'
   ]) table_name),
  true,
  'service_role has CRUD on all migration 038 tables'
);
select is(
  (select bool_and(
     not has_table_privilege('service_role', format('public.%I', table_name), 'TRUNCATE')
     and not has_table_privilege('service_role', format('public.%I', table_name), 'REFERENCES')
     and not has_table_privilege('service_role', format('public.%I', table_name), 'TRIGGER'))
   from unnest(array[
     'tracekit_users','tracekit_accounts','tracekit_agencies','tracekit_organizations',
     'tracekit_roles','tracekit_memberships','tracekit_permission_overrides',
     'tracekit_agency_client_assignments','tracekit_business_context_access',
     'tracekit_invitations','tracekit_audit_events'
   ]) table_name),
  true,
  'service_role lacks TRUNCATE, REFERENCES, and TRIGGER on all migration 038 tables'
);
select is(
  (select bool_and(
     has_table_privilege('postgres', format('public.%I', table_name), 'SELECT')
     and has_table_privilege('postgres', format('public.%I', table_name), 'INSERT')
     and has_table_privilege('postgres', format('public.%I', table_name), 'UPDATE')
     and has_table_privilege('postgres', format('public.%I', table_name), 'DELETE')
     and has_table_privilege('postgres', format('public.%I', table_name), 'TRUNCATE')
     and has_table_privilege('postgres', format('public.%I', table_name), 'REFERENCES')
     and has_table_privilege('postgres', format('public.%I', table_name), 'TRIGGER'))
   from unnest(array[
     'tracekit_users','tracekit_accounts','tracekit_agencies','tracekit_organizations',
     'tracekit_roles','tracekit_memberships','tracekit_permission_overrides',
     'tracekit_agency_client_assignments','tracekit_business_context_access',
     'tracekit_invitations','tracekit_audit_events'
   ]) table_name),
  true,
  'postgres owner privileges remain intact'
);
select is(
  (select count(*)::integer
   from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) acl
   where n.nspname = 'public'
     and c.relname = any(array[
       'tracekit_users','tracekit_accounts','tracekit_agencies','tracekit_organizations',
       'tracekit_roles','tracekit_memberships','tracekit_permission_overrides',
       'tracekit_agency_client_assignments','tracekit_business_context_access',
       'tracekit_invitations','tracekit_audit_events'
     ])
     and acl.grantee = 0),
  0,
  'PUBLIC has no privileges on migration 038 tables'
);

select is((select count(*)::integer from public.tracekit_roles), 15, 'exactly 15 system roles exist');
select is((select count(distinct role_key)::integer from public.tracekit_roles), 15, 'system role keys are unique');
select is(
  (select count(*)::integer from public.tracekit_roles
   where role_key = any(array[
     'platform-owner','platform-admin','support','billing','read-only-operations',
     'agency-owner','agency-admin','team-member','agency-read-only',
     'organization-owner','organization-admin','analyst-operator','finance',
     'customer-support','client-read-only'
   ])),
  15,
  'all expected system role keys exist'
);
select is(
  (select count(*)::integer from public.tracekit_roles
   where not (role_key = any(array[
     'platform-owner','platform-admin','support','billing','read-only-operations',
     'agency-owner','agency-admin','team-member','agency-read-only',
     'organization-owner','organization-admin','analyst-operator','finance',
     'customer-support','client-read-only'
   ]))),
  0,
  'migration 038 introduces no unexpected role keys'
);

select * from finish();
rollback;
