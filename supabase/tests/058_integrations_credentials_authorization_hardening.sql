select (to_regclass('public.integrations_credentials') is not null) as has_credentials \gset

\if :has_credentials
begin;
select plan(22);

select ok(
  (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = 'public.integrations_credentials'::regclass),
  'credential table has row-level security enabled'
);
select ok(
  not (select c.relforcerowsecurity from pg_catalog.pg_class c where c.oid = 'public.integrations_credentials'::regclass),
  'credential table does not force RLS for its owner'
);
select is(
  (select count(*)::integer from pg_catalog.pg_policy p where p.polrelid = 'public.integrations_credentials'::regclass),
  0,
  'credential table has no browser-readable policies'
);

select ok(not has_table_privilege('anon', 'public.integrations_credentials', 'SELECT'), 'anon has no SELECT privilege');
select ok(not has_table_privilege('authenticated', 'public.integrations_credentials', 'SELECT'), 'authenticated has no SELECT privilege');
select ok(not has_table_privilege('anon', 'public.integrations_credentials', 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'), 'anon has no other table privileges');
select ok(not has_table_privilege('authenticated', 'public.integrations_credentials', 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'), 'authenticated has no other table privileges');
select ok(
  not exists (
    select 1
    from information_schema.table_privileges
    where table_schema = 'public'
      and table_name = 'integrations_credentials'
      and grantee = 'PUBLIC'
  ),
  'PUBLIC has no table privileges'
);

select ok(has_table_privilege('service_role', 'public.integrations_credentials', 'SELECT'), 'service_role can read credentials');
select ok(has_table_privilege('service_role', 'public.integrations_credentials', 'INSERT'), 'service_role can create credentials');
select ok(has_table_privilege('service_role', 'public.integrations_credentials', 'UPDATE'), 'service_role can replace credentials');
select ok(not has_table_privilege('service_role', 'public.integrations_credentials', 'DELETE'), 'service_role cannot delete credentials');
select ok(not has_table_privilege('service_role', 'public.integrations_credentials', 'TRUNCATE'), 'service_role cannot truncate credentials');
select ok(not has_table_privilege('service_role', 'public.integrations_credentials', 'REFERENCES'), 'service_role cannot create references');
select ok(not has_table_privilege('service_role', 'public.integrations_credentials', 'TRIGGER'), 'service_role cannot create triggers');

select throws_ok(
  $$set local role anon; select count(*) from public.integrations_credentials$$,
  '42501', null, 'anon actual SELECT is denied'
);
select throws_ok(
  $$set local role authenticated; select count(*) from public.integrations_credentials$$,
  '42501', null, 'authenticated actual SELECT is denied'
);

set local role service_role;
select count(*) as service_select_count from public.integrations_credentials \gset
insert into public.integrations_credentials
  (platform, base_url, username, password_iv, password_ciphertext, password_key_version)
values
  ('authorization-hardening-test', 'https://example.invalid', 'synthetic', 'synthetic-iv', 'synthetic-ciphertext', 1);
update public.integrations_credentials
set username = 'synthetic-updated'
where platform = 'authorization-hardening-test';
reset role;

select pass('service_role actual SELECT succeeds');
select pass('service_role actual INSERT succeeds');
select pass('service_role actual UPDATE succeeds');
select throws_ok(
  $$set local role service_role; delete from public.integrations_credentials where platform = 'authorization-hardening-test'$$,
  '42501', null, 'service_role actual DELETE is denied'
);

select is(
  (select pg_catalog.pg_get_userbyid(c.relowner) from pg_catalog.pg_class c where c.oid = 'public.integrations_credentials'::regclass),
  'postgres',
  'postgres ownership remains intact'
);

select * from finish();
rollback;
\else
begin;
select plan(1);
select pass('optional legacy integrations_credentials table is absent in this fresh baseline');
select * from finish();
rollback;
\endif
