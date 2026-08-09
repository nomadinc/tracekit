begin;

select plan(63);

select has_table('public', 'commerce_provider_connections', 'provider connections exist');
select has_table('public', 'commerce_provider_accounts', 'provider accounts exist');
select has_table('public', 'commerce_provider_credentials', 'server-only credentials exist');
select has_table('public', 'commerce_sync_runs', 'durable sync runs exist');
select has_table('public', 'commerce_sync_checkpoints', 'page checkpoints exist');
select has_table('public', 'commerce_evidence_records', 'evidence references exist');
select has_table('public', 'commerce_source_mappings', 'source mappings exist');
select has_table('public', 'commerce_provider_products', 'observed provider products exist');
select has_table('public', 'person_source_identities', 'provider customer identities exist');
select has_table('public', 'commerce_repository_activation', 'repository activation exists');
select has_table('public', 'tracekit_business_contexts', 'business context catalog exists');
select has_table('public', 'canonical_offers', 'canonical offers exist');
select has_table('public', 'offer_steps', 'offer steps exist');
select has_table('public', 'offer_variants', 'offer variants exist');

select is(
  (select count(*)::integer
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = any(array[
       'commerce_provider_connections', 'commerce_provider_accounts',
       'commerce_provider_credentials', 'commerce_sync_runs',
       'commerce_sync_checkpoints', 'commerce_evidence_records',
       'commerce_source_mappings', 'commerce_provider_products',
       'person_source_identities', 'commerce_repository_activation',
       'tracekit_business_contexts', 'canonical_offers', 'offer_steps', 'offer_variants'
     ])
     and c.relrowsecurity),
  14,
  'all new tenant tables have RLS enabled'
);

select is(has_table_privilege('anon', 'public.commerce_provider_connections', 'SELECT'), false, 'anon cannot read connections');
select is(has_table_privilege('authenticated', 'public.commerce_provider_products', 'SELECT'), false, 'authenticated cannot read products directly');
select is(has_table_privilege('authenticated', 'public.commerce_provider_credentials', 'SELECT'), false, 'ordinary application users cannot read credentials');
select is(has_table_privilege('authenticated', 'public.commerce_provider_credentials', 'UPDATE'), false, 'ordinary application users cannot mutate credentials');
select is(has_table_privilege('service_role', 'public.commerce_provider_credentials', 'SELECT'), true, 'server role can resolve credentials');
select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'public' and tablename like 'commerce_%'),
  0,
  'no permissive commerce RLS policy exists'
);

insert into public.tracekit_accounts (id, account_type, name) values
  ('91000000-0000-0000-0000-000000000001', 'client', 'Commerce Test A'),
  ('92000000-0000-0000-0000-000000000001', 'client', 'Commerce Test B');
insert into public.tracekit_organizations (id, owning_account_id, name) values
  ('91000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000001', 'Organization A'),
  ('92000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000001', 'Organization B');
insert into public.tracekit_users (id, workos_user_id, primary_email, display_name) values
  ('91000000-0000-0000-0000-000000000003', 'test-commerce-reviewer', 'reviewer@example.invalid', 'Commerce Reviewer');
insert into public.tracekit_memberships (id, user_id, organization_id, role_id)
select '91000000-0000-0000-0000-000000000004', '91000000-0000-0000-0000-000000000003',
  '91000000-0000-0000-0000-000000000002', id
from public.tracekit_roles where role_key = 'organization-admin';

select is(
  (select convalidated from pg_constraint where conname = 'tracekit_business_context_access_context_fk'),
  true,
  'Business Context access FK is validated after the Sprint 2.1 catalog bootstrap'
);

insert into public.tracekit_business_contexts
  (id, account_id, organization_id, name, fulfillment_type)
values
  ('context-a', '91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002', 'Context A', 'digital'),
  ('context-b', '91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002', 'Context B', 'digital');

select throws_ok($sql$
  insert into public.tracekit_business_context_access
    (membership_id, organization_id, business_context_id)
  values
    ('91000000-0000-0000-0000-000000000004', '91000000-0000-0000-0000-000000000002', 'missing-context')
$sql$, '23503', null, 'new Business Context grants require the canonical catalog');

select lives_ok($sql$
  insert into public.commerce_provider_connections
    (id, account_id, organization_id, provider, display_name)
  values
    ('91000000-0000-0000-0000-000000000010', '91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002', 'commas', 'A primary'),
    ('91000000-0000-0000-0000-000000000011', '91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002', 'commas', 'A secondary'),
    ('92000000-0000-0000-0000-000000000010', '92000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000002', 'commas', 'B primary')
$sql$, 'valid Account and Organization ownership is accepted');

select throws_ok($sql$
  insert into public.commerce_provider_connections
    (account_id, organization_id, provider, display_name)
  values
    ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002', 'commas', 'cross tenant')
$sql$, '23503', null, 'connection cannot cross Account and Organization ownership');

insert into public.commerce_provider_accounts
  (id, connection_id, organization_id, provider_account_external_id)
values
  ('91000000-0000-0000-0000-000000000020', '91000000-0000-0000-0000-000000000010', '91000000-0000-0000-0000-000000000002', 'account-a'),
  ('91000000-0000-0000-0000-000000000021', '91000000-0000-0000-0000-000000000011', '91000000-0000-0000-0000-000000000002', 'account-a'),
  ('92000000-0000-0000-0000-000000000020', '92000000-0000-0000-0000-000000000010', '92000000-0000-0000-0000-000000000002', 'account-b');

select throws_ok($sql$
  insert into public.commerce_provider_accounts
    (connection_id, organization_id, provider_account_external_id)
  values
    ('91000000-0000-0000-0000-000000000010', '91000000-0000-0000-0000-000000000002', 'account-a')
$sql$, '23505', null, 'provider account external ID is unique within a Connection');

select lives_ok($sql$
  insert into public.commerce_provider_credentials
    (organization_id, connection_id, credential_type, storage_backend, secret_reference)
  values
    ('91000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000010', 'api_key', 'managed_secret', 'test-secret-reference')
$sql$, 'one managed secret reference can be attached to a Connection');

select throws_ok($sql$
  insert into public.commerce_provider_credentials
    (organization_id, connection_id, credential_type, storage_backend, secret_reference)
  values
    ('91000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000010', 'api_key', 'managed_secret', 'second-reference')
$sql$, '23505', null, 'credential is one-to-one with its Connection');

select throws_ok($sql$
  insert into public.commerce_provider_credentials
    (organization_id, connection_id, credential_type, storage_backend, secret_reference, public_metadata)
  values
    ('91000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000011', 'api_key', 'managed_secret', 'safe-reference', '{"api_key":"forbidden"}')
$sql$, '23514', null, 'credential metadata rejects secret-bearing fields');
select throws_ok($sql$
  insert into public.commerce_provider_credentials
    (organization_id, connection_id, credential_type, storage_backend, encryption_key_id)
  values
    ('91000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000011', 'api_key', 'database_encrypted', 'test-key')
$sql$, '23514', null, 'AES-GCM mode requires complete versioned ciphertext material');
select lives_ok($sql$
  insert into public.commerce_provider_credentials
    (organization_id, connection_id, credential_type, storage_backend, encryption_key_id,
     encryption_version, secret_iv, secret_ciphertext)
  values
    ('91000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000011', 'api_key', 'database_encrypted', 'test-key',
     1, decode('000102030405060708090a0b', 'hex'), decode('00112233445566778899aabbccddeeff', 'hex'))
$sql$, 'AES-GCM mode accepts only complete versioned ciphertext material');

update public.commerce_provider_credentials
set revoked_at = now(), rotated_at = now(), updated_at = now()
where connection_id = '91000000-0000-0000-0000-000000000010';
select lives_ok($sql$
  insert into public.commerce_provider_credentials
    (organization_id, connection_id, credential_type, storage_backend, secret_reference)
  values
    ('91000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000010', 'api_key', 'managed_secret', 'rotated-test-reference')
$sql$, 'rotation creates a new active credential row without overwriting history');
select is(
  (select count(*)::integer from public.commerce_provider_credentials
   where connection_id = '91000000-0000-0000-0000-000000000010'),
  2,
  'credential rotation history is retained'
);
select throws_ok($sql$
  update public.commerce_provider_credentials
  set secret_reference = 'replacement-in-place'
  where connection_id = '91000000-0000-0000-0000-000000000010'
    and revoked_at is null
$sql$, '55000', null, 'active credential material cannot be overwritten in place');
select throws_ok($sql$
  delete from public.commerce_provider_connections
  where id = '91000000-0000-0000-0000-000000000010'
$sql$, '23503', null, 'Connection deletion cannot cascade credential history');

insert into public.commerce_sync_runs
  (id, connection_id, provider_account_id, organization_id, sync_type, mode)
values
  ('91000000-0000-0000-0000-000000000030', '91000000-0000-0000-0000-000000000010', '91000000-0000-0000-0000-000000000020', '91000000-0000-0000-0000-000000000002', 'transactions', 'shadow');

select throws_ok($sql$
  insert into public.commerce_sync_runs
    (connection_id, provider_account_id, organization_id, sync_type, mode, status)
  values
    ('91000000-0000-0000-0000-000000000010', '91000000-0000-0000-0000-000000000020', '91000000-0000-0000-0000-000000000002', 'transactions', 'shadow', 'unknown')
$sql$, '23514', null, 'sync-run status is constrained');

insert into public.commerce_sync_checkpoints
  (sync_run_id, connection_id, provider_account_id, organization_id, resource, page, per_page)
values
  ('91000000-0000-0000-0000-000000000030', '91000000-0000-0000-0000-000000000010', '91000000-0000-0000-0000-000000000020', '91000000-0000-0000-0000-000000000002', 'transactions', 1, 100);

select throws_ok($sql$
  insert into public.commerce_sync_checkpoints
    (sync_run_id, connection_id, provider_account_id, organization_id, resource, page, per_page)
  values
    ('91000000-0000-0000-0000-000000000030', '91000000-0000-0000-0000-000000000010', '91000000-0000-0000-0000-000000000020', '91000000-0000-0000-0000-000000000002', 'transactions', 1, 100)
$sql$, '23505', null, 'logical page completion cannot be duplicated within a Sync Run');

select is(
  (select count(*)::integer from information_schema.columns
   where table_schema = 'public' and table_name = 'commerce_sync_checkpoints' and column_name = 'updated_after'),
  0,
  'no invented date checkpoint is required'
);

insert into public.commerce_source_mappings
  (organization_id, connection_id, provider_account_id, source_object_type, source_object_id,
   canonical_object_type, canonical_object_id, first_seen_at, last_seen_at, payload_hash, mapping_version)
values
  ('91000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000010', '91000000-0000-0000-0000-000000000020',
   'transaction', 'transaction-1', 'order', '91000000-0000-0000-0000-000000000040', now(), now(), 'sha256:test', 'v1');

select throws_ok($sql$
  insert into public.commerce_source_mappings
    (organization_id, connection_id, provider_account_id, source_object_type, source_object_id,
     canonical_object_type, canonical_object_id, first_seen_at, last_seen_at, payload_hash, mapping_version)
  values
    ('91000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000010', '91000000-0000-0000-0000-000000000020',
     'transaction', 'transaction-1', 'order', '91000000-0000-0000-0000-000000000041', now(), now(), 'sha256:test2', 'v1')
$sql$, '23505', null, 'source mapping is idempotent within a Connection');

select lives_ok($sql$
  insert into public.commerce_source_mappings
    (organization_id, connection_id, provider_account_id, source_object_type, source_object_id,
     canonical_object_type, canonical_object_id, first_seen_at, last_seen_at, payload_hash, mapping_version)
  values
    ('91000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000011', '91000000-0000-0000-0000-000000000021',
     'transaction', 'transaction-1', 'order', '91000000-0000-0000-0000-000000000042', now(), now(), 'sha256:test3', 'v1')
$sql$, 'same source ID is allowed in a different Provider Account');

select lives_ok($sql$
  insert into public.commerce_provider_products
    (organization_id, connection_id, provider_account_id, provider_product_id, title, first_seen_at, last_seen_at, mapping_status)
  values
    ('91000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000010', '91000000-0000-0000-0000-000000000020', 'shared-product', 'Observed A', now(), now(), 'review_required'),
    ('91000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000011', '91000000-0000-0000-0000-000000000021', 'shared-product', 'Observed B', now(), now(), 'review_required')
$sql$, 'the same Product ID is allowed across Connections');

select throws_ok($sql$
  insert into public.commerce_provider_products
    (organization_id, connection_id, provider_account_id, provider_product_id, title, first_seen_at, last_seen_at)
  values
    ('91000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000010', '91000000-0000-0000-0000-000000000020', 'shared-product', 'Duplicate', now(), now())
$sql$, '23505', null, 'Product ID is unique within a Connection');

insert into public.canonical_offers (id, account_id, organization_id, business_context_id, name) values
  ('91000000-0000-0000-0000-000000000070', '91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002', 'context-a', 'Offer A'),
  ('91000000-0000-0000-0000-000000000071', '91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002', 'context-b', 'Offer B');
insert into public.offer_steps (id, organization_id, canonical_offer_id, role, sequence) values
  ('91000000-0000-0000-0000-000000000072', '91000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000070', 'front_end', 0),
  ('91000000-0000-0000-0000-000000000073', '91000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000071', 'front_end', 0);
insert into public.offer_variants (id, organization_id, offer_step_id, kind, sequence) values
  ('91000000-0000-0000-0000-000000000074', '91000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000072', 'standard', 0);

select throws_ok($sql$
  insert into public.commerce_provider_products
    (organization_id, connection_id, provider_account_id, provider_product_id, title, first_seen_at, last_seen_at,
     mapping_status, business_context_id, canonical_offer_id, offer_step_id, mapping_version,
     reviewed_by_user_id, reviewed_at)
  values
    ('91000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000010', '91000000-0000-0000-0000-000000000020',
     'mismatched-hierarchy', 'Mismatch', now(), now(), 'approved', 'context-a',
     '91000000-0000-0000-0000-000000000070', '91000000-0000-0000-0000-000000000073', 'v1',
     '91000000-0000-0000-0000-000000000003', now())
$sql$, '23503', null, 'approved Product mapping cannot mix Offer hierarchy branches');

insert into public.people (id, workspace_id, organization_id, display_name) values
  ('91000000-0000-0000-0000-000000000050', 'test-a', '91000000-0000-0000-0000-000000000002', 'Person A'),
  ('91000000-0000-0000-0000-000000000051', 'test-a', '91000000-0000-0000-0000-000000000002', 'Person B');

select lives_ok($sql$
  insert into public.person_source_identities
    (organization_id, person_id, connection_id, provider_account_id, source_type, source_id, normalized_value, first_seen_at, last_seen_at)
  values
    ('91000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000050', '91000000-0000-0000-0000-000000000010', '91000000-0000-0000-0000-000000000020', 'email', 'observation-1', 'shared@example.invalid', now(), now()),
    ('91000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000051', '91000000-0000-0000-0000-000000000010', '91000000-0000-0000-0000-000000000020', 'email', 'observation-2', 'shared@example.invalid', now(), now()),
    ('91000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000050', '91000000-0000-0000-0000-000000000010', '91000000-0000-0000-0000-000000000020', 'phone', 'phone-observation-1', '+15550100', now(), now()),
    ('91000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000051', '91000000-0000-0000-0000-000000000010', '91000000-0000-0000-0000-000000000020', 'phone', 'phone-observation-2', '+15550100', now(), now())
$sql$, 'shared email and phone remain supporting evidence, not merge keys');

select has_index('public', 'person_identifiers', 'person_identifiers_active_value_uidx', 'legacy identity uniqueness remains intact');
insert into public.person_identifiers
  (workspace_id, person_id, identifier_type, normalized_value)
values
  ('test-a', '91000000-0000-0000-0000-000000000050', 'email', 'legacy-shared@example.invalid');
select throws_ok($sql$
  insert into public.person_identifiers
    (workspace_id, person_id, identifier_type, normalized_value)
  values
    ('test-a', '91000000-0000-0000-0000-000000000051', 'email', 'legacy-shared@example.invalid')
$sql$, '23505', null, 'legacy identity resolver contact semantics do not silently change');

insert into public.person_source_identities
  (organization_id, person_id, connection_id, provider_account_id, source_type, source_id, first_seen_at, last_seen_at)
values
  ('91000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000050', '91000000-0000-0000-0000-000000000010', '91000000-0000-0000-0000-000000000020', 'provider_customer_id', 'customer-1', now(), now());

select throws_ok($sql$
  insert into public.person_source_identities
    (organization_id, person_id, connection_id, provider_account_id, source_type, source_id, first_seen_at, last_seen_at)
  values
    ('91000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000051', '91000000-0000-0000-0000-000000000010', '91000000-0000-0000-0000-000000000020', 'provider_customer_id', 'customer-1', now(), now())
$sql$, '23505', null, 'provider Customer ID is authoritative within a Connection');

select lives_ok($sql$
  insert into public.person_source_identities
    (organization_id, person_id, connection_id, provider_account_id, source_type, source_id, first_seen_at, last_seen_at)
  values
    ('91000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000051', '91000000-0000-0000-0000-000000000011', '91000000-0000-0000-0000-000000000021', 'provider_customer_id', 'customer-1', now(), now())
$sql$, 'same provider Customer ID is allowed across different Connections');

select throws_ok($sql$
  insert into public.commerce_repository_activation
    (organization_id, workspace, mode, connection_id)
  values
    ('92000000-0000-0000-0000-000000000002', 'orders', 'shadow', '91000000-0000-0000-0000-000000000010')
$sql$, '23503', null, 'activation cannot use another Organization connection');

insert into public.commerce_repository_activation (organization_id, workspace, mode)
values ('91000000-0000-0000-0000-000000000002', 'orders', 'mock');
select throws_ok($sql$
  insert into public.commerce_repository_activation (organization_id, workspace, mode)
  values ('91000000-0000-0000-0000-000000000002', 'orders', 'mock')
$sql$, '23505', null, 'Workspace activation is unique within an Organization');

select is(
  (select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'platform_orders' and column_name = 'currency'),
  'YES',
  'Order currency remains nullable when provider evidence does not supply it'
);
select col_type_is('public', 'platform_orders', 'canonical_order_id', 'uuid', 'legacy Order snapshots gain a stable canonical UUID');
select is(
  (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'conversions' and column_name = 'currency'),
  null,
  'financial events do not silently default missing currency to USD'
);

select throws_ok($sql$
  insert into public.platform_orders
    (platform, platform_order_id, order_ts, status, canonical_order_id, account_id, organization_id, connection_id, source_mapping_id)
  values
    ('commas', 'cross-org-order', now(), 'observed', '92000000-0000-0000-0000-000000000060',
     '92000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000002',
     '92000000-0000-0000-0000-000000000010',
     (select id from public.commerce_source_mappings
      where connection_id = '91000000-0000-0000-0000-000000000010' and source_object_id = 'transaction-1'))
$sql$, '23503', null, 'Order provenance cannot reference another Organization mapping');

select lives_ok($sql$
  insert into public.platform_orders
    (platform, platform_order_id, order_ts, status, canonical_order_id, currency,
     account_id, organization_id, connection_id, provider_account_id, source_mapping_id)
  values
    ('commas', 'canonical-order-contract', now(), 'observed', '91000000-0000-0000-0000-000000000060', null,
     '91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002',
     '91000000-0000-0000-0000-000000000010', '91000000-0000-0000-0000-000000000020',
     (select id from public.commerce_source_mappings where connection_id = '91000000-0000-0000-0000-000000000010' and source_object_id = 'transaction-1'))
$sql$, 'canonical Order creation supports unknown currency with tenant provenance');

select throws_ok($sql$
  insert into public.commerce_evidence_records
    (organization_id, connection_id, provider_account_id, sync_run_id, source_object_type, source_object_id,
     payload_hash, storage_backend, storage_reference, byte_size, observed_at, pii_classification, retention_policy)
  values
    ('92000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000010', '91000000-0000-0000-0000-000000000020', '91000000-0000-0000-0000-000000000030',
     'transaction', 'transaction-1', 'sha256:test', 'object_storage', 'test/evidence', 1, now(), 'restricted', 'commerce-default')
$sql$, '23503', null, 'evidence cannot cross Organization ownership');

insert into public.commerce_evidence_records
  (id, organization_id, connection_id, provider_account_id, sync_run_id, source_object_type, source_object_id,
   payload_hash, storage_backend, storage_reference, byte_size, observed_at, pii_classification, retention_policy)
values
  ('91000000-0000-0000-0000-000000000080', '91000000-0000-0000-0000-000000000002',
   '91000000-0000-0000-0000-000000000010', '91000000-0000-0000-0000-000000000020', '91000000-0000-0000-0000-000000000030',
   'transaction', 'transaction-evidence', 'sha256:immutable', 'object_storage', 'test/immutable-evidence', 10, now(), 'restricted', 'commerce-default');
select throws_ok($sql$
  update public.commerce_evidence_records set payload_hash = 'sha256:changed'
  where id = '91000000-0000-0000-0000-000000000080'
$sql$, '55000', null, 'financial Evidence content identity is immutable');
select throws_ok($sql$
  delete from public.commerce_evidence_records
  where id = '91000000-0000-0000-0000-000000000080'
$sql$, '55000', null, 'financial Evidence cannot be ordinarily deleted');
select lives_ok($sql$
  update public.commerce_evidence_records set deleted_at = now()
  where id = '91000000-0000-0000-0000-000000000080'
$sql$, 'controlled legal-erasure marking remains available');

select lives_ok($sql$
  insert into public.platform_orders
    (platform, platform_order_id, order_ts, status, currency)
  values ('wowboost', 'legacy-upsert-contract', now(), 'complete', 'USD')
  on conflict (platform_order_id) do update set status = excluded.status
$sql$, 'legacy platform_order_id upsert target remains valid');

select lives_ok($sql$
  select * from public.insert_wowsuite_refund_events('[{
    "workspace_id":"default","ledger_type":"refund","event_source":"wowboost",
    "connector_id":"wowboost","transaction_id":"wowboost:refund:sprint-2-0-review",
    "amount":"5.00","currency":"USD","platform":"wowboost","status":"refunded",
    "occurred_at":"2026-08-06T00:00:00Z"
  }]'::jsonb);
  select * from public.insert_wowsuite_refund_events('[{
    "workspace_id":"default","ledger_type":"refund","event_source":"wowboost",
    "connector_id":"wowboost","transaction_id":"wowboost:refund:sprint-2-0-review",
    "amount":"5.00","currency":"USD","platform":"wowboost","status":"refunded",
    "occurred_at":"2026-08-06T00:00:00Z"
  }]'::jsonb)
$sql$, 'existing refund insertion RPC remains compatible after 039');
select is(
  (select count(*)::integer from public.conversions
   where transaction_id = 'wowboost:refund:sprint-2-0-review'),
  1,
  'refund RPC remains idempotent and inserts one ledger event'
);

select is(
  (select count(*)::integer from public.commerce_repository_activation where mode <> 'mock'),
  0,
  'migration activates no live or shadow repository mode'
);

select * from finish();
rollback;
