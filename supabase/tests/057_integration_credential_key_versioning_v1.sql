select (to_regclass('public.integrations_credentials') is not null) as has_credentials \gset

\if :has_credentials
begin;
select plan(12);

select has_column('public', 'integrations_credentials', 'password_key_version', 'credential key version column exists');
select col_type_is('public', 'integrations_credentials', 'password_key_version', 'smallint', 'credential key version uses smallint');
select col_not_null('public', 'integrations_credentials', 'password_key_version', 'credential key version is required');
select col_default_is('public', 'integrations_credentials', 'password_key_version', '1', 'legacy-compatible default is version 1');
select is((select count(*)::integer from public.integrations_credentials where password_key_version is null), 0, 'all existing credentials have an explicit version');
select is((select count(*)::integer from public.integrations_credentials where password_key_version <> 1), 0, 'preexisting fixture credentials are classified as v1');

select throws_ok(
  $$insert into public.integrations_credentials (platform, base_url, username, password_iv, password_ciphertext, password_key_version)
    values ('invalid-version-test', 'https://example.invalid', 'synthetic', 'synthetic', 'synthetic', 0)$$,
  '23514', null, 'non-positive key versions are rejected'
);
select lives_ok(
  $$insert into public.integrations_credentials (platform, base_url, username, password_iv, password_ciphertext, password_key_version)
    values ('future-version-test', 'https://example.invalid', 'synthetic', 'synthetic', 'synthetic', 3)$$,
  'positive future key versions remain schema-extensible'
);
select is((select password_key_version from public.integrations_credentials where platform = 'future-version-test'), 3::smallint, 'explicit version persists');
select ok(not has_table_privilege('anon', 'public.integrations_credentials', 'SELECT'), 'anon does not gain credential access');
select ok(not has_table_privilege('authenticated', 'public.integrations_credentials', 'SELECT'), 'authenticated does not gain credential access');
select ok(has_table_privilege('service_role', 'public.integrations_credentials', 'SELECT'), 'service_role retains server access');

select * from finish();
rollback;
\else
begin;
select plan(1);
select pass('optional legacy integrations_credentials table is absent in this fresh baseline');
select * from finish();
rollback;
\endif
