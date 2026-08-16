begin;

select plan(37);

select has_column('public', 'commerce_sync_runs', 'lease_owner', 'Sync Runs have a lease owner');
select has_column('public', 'commerce_sync_runs', 'lease_expires_at', 'Sync Runs have lease expiry');
select has_column('public', 'commerce_sync_runs', 'heartbeat_at', 'Sync Runs have heartbeat state');
select has_column('public', 'commerce_sync_runs', 'attempt', 'Sync Runs count attempts');
select has_table('public', 'commerce_product_mapping_decisions', 'Product mapping decisions are persisted');
select is((select relrowsecurity from pg_class where oid = 'public.commerce_product_mapping_decisions'::regclass), true, 'mapping decisions have RLS');
select is(has_table_privilege('authenticated', 'public.commerce_product_mapping_decisions', 'SELECT'), false, 'browser roles cannot read mapping decisions');
select is(has_function_privilege('authenticated', 'public.claim_commerce_sync_run(uuid,uuid,uuid,text,integer)', 'EXECUTE'), false, 'browser role cannot claim Sync Runs');
select is(has_function_privilege('authenticated', 'public.rotate_commerce_provider_credential(uuid,uuid,uuid,text,text,integer,bytea,bytea)', 'EXECUTE'), false, 'browser role cannot rotate credentials');
select is(has_function_privilege('public', 'public.commerce_product_mapping_decision_immutable_guard()', 'EXECUTE'), false, 'PUBLIC cannot execute the immutable mapping-decision guard');
select is(has_function_privilege('anon', 'public.commerce_product_mapping_decision_immutable_guard()', 'EXECUTE'), false, 'anon cannot execute the immutable mapping-decision guard');
select is(has_function_privilege('authenticated', 'public.commerce_product_mapping_decision_immutable_guard()', 'EXECUTE'), false, 'authenticated cannot execute the immutable mapping-decision guard');
select has_column('public', 'platform_orders', 'provider_order_id', 'Orders have an additive provider-scoped source ID');
select has_index('public', 'platform_orders', 'platform_orders_provider_source_uidx', 'provider Order IDs have scoped uniqueness');
select ok((select count(*) = 1 from pg_constraint where conname = 'platform_orders_platform_order_id_key'), 'legacy global Order uniqueness remains present');
select has_column('public', 'commerce_repository_activation', 'readiness_evidence', 'activation stores readiness evidence');
select is((select count(*)::integer from public.commerce_repository_activation), 0, 'migration creates no activation rows');
select is((select convalidated from pg_constraint where conname = 'tracekit_business_context_access_context_fk'), true, 'clean bootstrap validates Business Context access catalog integrity');

insert into public.tracekit_accounts (id, account_type, name) values
  ('a1000000-0000-0000-0000-000000000001', 'client', 'Control A'),
  ('b1000000-0000-0000-0000-000000000001', 'client', 'Control B');
insert into public.tracekit_organizations (id, owning_account_id, name) values
  ('a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'Control Org A'),
  ('b1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'Control Org B');
insert into public.tracekit_users (id, workos_user_id, primary_email, display_name) values
  ('a1000000-0000-0000-0000-000000000003', 'control-reviewer', 'control@example.invalid', 'Control Reviewer');
insert into public.tracekit_business_contexts (id, account_id, organization_id, name) values
  ('control-context', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'Control Context');
insert into public.commerce_provider_connections (id, account_id, organization_id, provider, display_name, status) values
  ('a1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'commas', 'Control', 'connected'),
  ('a1000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'commas', 'Control secondary', 'connected'),
  ('b1000000-0000-0000-0000-000000000010', 'b1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'commas', 'Other', 'connected');
insert into public.commerce_provider_accounts (id, connection_id, organization_id, provider_account_external_id) values
  ('a1000000-0000-0000-0000-000000000020', 'a1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000002', 'provisional:a'),
  ('b1000000-0000-0000-0000-000000000020', 'b1000000-0000-0000-0000-000000000010', 'b1000000-0000-0000-0000-000000000002', 'provisional:b');
insert into public.commerce_provider_credentials
  (id, organization_id, connection_id, credential_type, storage_backend, encryption_key_id, encryption_version, secret_iv, secret_ciphertext)
values
  ('a1000000-0000-0000-0000-000000000025', 'a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000010', 'api_key', 'database_encrypted', 'test-key', 1, decode('000102030405060708090a0b','hex'), decode('00112233445566778899aabbccddeeff','hex'));
select is((select count(*)::integer from public.rotate_commerce_provider_credential(
  'a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000025',
  'api_key', 'test-key', 2, decode('0b0a09080706050403020100','hex'), decode('ffeeddccbbaa99887766554433221100','hex'))), 1, 'credential rotation atomically inserts a replacement');
select is((select count(*)::integer from public.commerce_provider_credentials where connection_id = 'a1000000-0000-0000-0000-000000000010'), 2, 'credential history is retained');
select is((select count(*)::integer from public.commerce_provider_credentials where connection_id = 'a1000000-0000-0000-0000-000000000010' and revoked_at is null), 1, 'only one credential version remains active');
insert into public.commerce_sync_runs (id, connection_id, provider_account_id, organization_id, sync_type, mode) values
  ('a1000000-0000-0000-0000-000000000030', 'a1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000020', 'a1000000-0000-0000-0000-000000000002', 'transactions', 'shadow');

select is((select count(*)::integer from public.claim_commerce_sync_run('a1000000-0000-0000-0000-000000000030', 'a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000010', 'worker-a', 60)), 1, 'first worker acquires a Sync Run');
select is((select count(*)::integer from public.claim_commerce_sync_run('a1000000-0000-0000-0000-000000000030', 'a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000010', 'worker-b', 60)), 0, 'active lease cannot be stolen');
select is(public.heartbeat_commerce_sync_run('a1000000-0000-0000-0000-000000000030', 'a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000010', 'worker-a', 60), true, 'lease owner can heartbeat');
update public.commerce_sync_runs set lease_expires_at = now() - interval '1 second' where id = 'a1000000-0000-0000-0000-000000000030';
select is((select count(*)::integer from public.claim_commerce_sync_run('a1000000-0000-0000-0000-000000000030', 'a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000010', 'worker-b', 60)), 1, 'expired lease can be recovered');
select is(public.cancel_commerce_sync_run('a1000000-0000-0000-0000-000000000030', 'b1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000010'), false, 'another Organization cannot cancel a Sync Run');
select is(public.cancel_commerce_sync_run('a1000000-0000-0000-0000-000000000030', 'a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000011'), false, 'another Connection in the same Organization cannot cancel a Sync Run');
select is(public.cancel_commerce_sync_run('a1000000-0000-0000-0000-000000000030', 'a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000010'), true, 'owning Organization and Connection can cancel a Sync Run');
select is((select count(*)::integer from public.claim_commerce_sync_run('a1000000-0000-0000-0000-000000000030', 'a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000010', 'worker-c', 60)), 0, 'cancelled Sync Run cannot resume');

select lives_ok($sql$
  insert into public.platform_orders (platform, platform_order_id, provider_order_id, order_ts, status, organization_id, connection_id, provider_account_id)
  values
    ('commas', 'internal-a', 'same-provider-id', now(), 'observed', 'a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000020'),
    ('commas', 'internal-b', 'same-provider-id', now(), 'observed', 'b1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000010', 'b1000000-0000-0000-0000-000000000020')
$sql$, 'same provider Transaction ID is allowed across Connections');
select throws_ok($sql$
  insert into public.platform_orders (platform, platform_order_id, provider_order_id, order_ts, status, organization_id, connection_id, provider_account_id)
  values ('commas', 'internal-c', 'same-provider-id', now(), 'observed', 'a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000020')
$sql$, '23505', null, 'provider Transaction ID is unique within Connection and Provider Account');

select throws_ok($sql$
  insert into public.commerce_repository_activation
    (organization_id, workspace, mode, connection_id, activated_by_user_id)
  values ('a1000000-0000-0000-0000-000000000002', 'orders', 'live_beta', 'a1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000003')
$sql$, '23514', null, 'live beta activation requires readiness evidence');
select lives_ok($sql$
  insert into public.commerce_repository_activation
    (organization_id, workspace, mode, connection_id, activated_by_user_id, readiness_verified_at, readiness_verified_by_user_id, readiness_evidence)
  values ('a1000000-0000-0000-0000-000000000002', 'orders', 'live_beta', 'a1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000003', now(), 'a1000000-0000-0000-0000-000000000003', '{"review":"synthetic-pass"}')
$sql$, 'readiness evidence permits server-controlled live beta state');

insert into public.canonical_offers (id, account_id, organization_id, business_context_id, name) values
  ('a1000000-0000-0000-0000-000000000040', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'control-context', 'Control Offer');
insert into public.offer_steps (id, organization_id, canonical_offer_id, role, sequence) values
  ('a1000000-0000-0000-0000-000000000041', 'a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000040', 'front_end', 0);
insert into public.commerce_provider_products (id, organization_id, connection_id, provider_account_id, provider_product_id, title, first_seen_at, last_seen_at) values
  ('a1000000-0000-0000-0000-000000000042', 'a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000020', 'product-a', 'Synthetic Product', now(), now());
select is(public.decide_commerce_product_mapping(
  'a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000020',
  'a1000000-0000-0000-0000-000000000042', 'approved', 'control-context', 'a1000000-0000-0000-0000-000000000040',
  'a1000000-0000-0000-0000-000000000041', null, 'v1', 'a1000000-0000-0000-0000-000000000003', 'Synthetic reviewed mapping'
), true, 'mapping decision atomically updates history and current projection');
select is((select mapping_status from public.commerce_provider_products where id = 'a1000000-0000-0000-0000-000000000042'), 'approved', 'Product row is the latest mapping projection');
select throws_ok($sql$
  update public.commerce_product_mapping_decisions set reason = 'changed' where provider_product_id = 'a1000000-0000-0000-0000-000000000042'
$sql$, '55000', null, 'Product mapping decisions cannot be overwritten');
select throws_ok($sql$
  delete from public.commerce_product_mapping_decisions where provider_product_id = 'a1000000-0000-0000-0000-000000000042'
$sql$, '55000', null, 'Product mapping decisions cannot be deleted');

select * from finish();
rollback;
