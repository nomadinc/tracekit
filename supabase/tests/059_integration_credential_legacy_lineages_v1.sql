begin;

select (to_regclass('public.integrations_credentials') is not null) as has_credentials \gset

\if :has_credentials
\else
create table public.integrations_credentials (
  id uuid primary key default gen_random_uuid(),
  platform text unique not null,
  base_url text not null,
  username text not null,
  password_iv text,
  password_ciphertext text,
  password_key_version smallint not null default 1,
  constraint integrations_credentials_password_key_version_check check (password_key_version > 0),
  constraint integrations_credentials_password_key_lineage_check check (password_key_version in (1, 2, 3))
);
comment on column public.integrations_credentials.password_key_version is
  'Deterministic server-side key lineage: 1=legacy-b, 2=future rotation key, 3=legacy-c (decrypt-only).';
alter table public.integrations_credentials enable row level security;
revoke all privileges on table public.integrations_credentials from public, anon, authenticated, service_role;
grant select, insert, update on table public.integrations_credentials to service_role;
\endif

select plan(15);

select has_column('public', 'integrations_credentials', 'password_key_version', 'key-lineage version column exists');
select col_type_is('public', 'integrations_credentials', 'password_key_version', 'smallint', 'key lineage remains a compact numeric identifier');
select col_not_null('public', 'integrations_credentials', 'password_key_version', 'key lineage remains required');
select col_default_is('public', 'integrations_credentials', 'password_key_version', '1', 'old writers remain temporarily classified as Legacy B');
select ok(
  exists(select 1 from pg_constraint where conrelid = 'public.integrations_credentials'::regclass and conname = 'integrations_credentials_password_key_lineage_check'),
  'allowed lineage constraint exists'
);
select ok(
  (select convalidated from pg_constraint where conrelid = 'public.integrations_credentials'::regclass and conname = 'integrations_credentials_password_key_lineage_check'),
  'allowed lineage constraint is validated'
);

insert into public.integrations_credentials (platform, base_url, username, password_iv, password_ciphertext, password_key_version)
select 'legacy-b-' || value, 'https://example.invalid', 'synthetic', 'synthetic-iv', 'synthetic-ciphertext', 1
from generate_series(1, 16) value;

insert into public.integrations_credentials (platform, base_url, username, password_iv, password_ciphertext, password_key_version)
select 'legacy-c-' || value, 'https://example.invalid', 'synthetic', 'synthetic-iv', 'synthetic-ciphertext', 3
from generate_series(1, 2) value;

select is((select count(*)::integer from public.integrations_credentials where platform like 'legacy-b-%' and password_key_version = 1), 16, 'synthetic Legacy B population is deterministic');
select is((select count(*)::integer from public.integrations_credentials where platform like 'legacy-c-%' and password_key_version = 3), 2, 'synthetic Legacy C population is deterministic');
select is((select count(*)::integer from public.integrations_credentials where password_key_version not in (1, 3)), 0, 'mixed legacy fixture has no unknown lineage');

select lives_ok(
  $$insert into public.integrations_credentials (platform, base_url, username, password_iv, password_ciphertext, password_key_version)
    values ('future-version-test', 'https://example.invalid', 'synthetic', 'synthetic', 'synthetic', 2)$$,
  'future version 2 remains reserved and accepted'
);
select throws_ok(
  $$insert into public.integrations_credentials (platform, base_url, username, password_iv, password_ciphertext, password_key_version)
    values ('unknown-lineage-test', 'https://example.invalid', 'synthetic', 'synthetic', 'synthetic', 4)$$,
  '23514', null, 'unknown key lineages fail closed'
);
select ok(not has_table_privilege('anon', 'public.integrations_credentials', 'SELECT'), 'anon remains denied');
select ok(not has_table_privilege('authenticated', 'public.integrations_credentials', 'SELECT'), 'authenticated remains denied');
select ok(has_table_privilege('service_role', 'public.integrations_credentials', 'SELECT'), 'service role retains read access');
select is(
  col_description('public.integrations_credentials'::regclass, (
    select attnum from pg_attribute where attrelid = 'public.integrations_credentials'::regclass and attname = 'password_key_version'
  )),
  'Deterministic server-side key lineage: 1=legacy-b, 2=future rotation key, 3=legacy-c (decrypt-only).',
  'column comment records collision-free lineage semantics'
);

select * from finish();
rollback;
