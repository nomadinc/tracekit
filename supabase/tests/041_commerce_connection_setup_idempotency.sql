begin;
select plan(3);
select has_column('public', 'commerce_provider_connections', 'setup_request_id', 'Connection setup has a durable idempotency key');
select has_index('public', 'commerce_provider_connections', 'commerce_provider_connections_org_setup_request_uidx', 'Setup idempotency is Organization scoped');
select col_type_is('public', 'commerce_provider_connections', 'setup_request_id', 'uuid', 'Setup idempotency key uses UUIDs');
select * from finish();
rollback;
