-- TEST-ONLY fixture for exercising the historical M15 Stem Labs migration.
--
-- This file is deliberately outside supabase/migrations and is not included by
-- the configured Supabase seed paths. It contains synthetic identities and a
-- managed-secret reference only; it must never be used as production seed data.

begin;

insert into public.tracekit_accounts (id, account_type, name, status)
values
  ('40000000-0000-4000-8000-000000000001', 'platform', 'Migration Test Platform', 'active'),
  ('4dcad1a0-48af-4c5c-8b32-15c1c89ccd1d', 'client', 'Synthetic Stem Labs Account', 'active');

insert into public.tracekit_users (
  id,
  workos_user_id,
  primary_email,
  display_name,
  status
)
values (
  '40000000-0000-4000-8000-000000000002',
  'user_migration_test_platform_owner',
  'migration-test-platform-owner@example.invalid',
  'Migration Test Platform Owner',
  'active'
);

insert into public.tracekit_organizations (
  id,
  owning_account_id,
  name,
  status
)
values (
  '8f6bb14b-2126-49b8-bfdb-c60edbc3549b',
  '4dcad1a0-48af-4c5c-8b32-15c1c89ccd1d',
  'Stem Labs',
  'active'
);

insert into public.tracekit_memberships (
  id,
  user_id,
  account_id,
  role_id,
  status
)
select
  '40000000-0000-4000-8000-000000000003',
  '40000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000001',
  r.id,
  'active'
from public.tracekit_roles r
where r.role_key = 'platform-owner';

insert into public.commerce_provider_connections (
  id,
  account_id,
  organization_id,
  provider,
  display_name,
  environment,
  status,
  external_account_id
)
values (
  'd69a93dd-98ed-46fd-b486-1a39fb8388dd',
  '4dcad1a0-48af-4c5c-8b32-15c1c89ccd1d',
  '8f6bb14b-2126-49b8-bfdb-c60edbc3549b',
  'shopify',
  'Synthetic Shopify Connection',
  'production',
  'connected',
  'izkfvg-k0.myshopify.com'
);

insert into public.commerce_provider_accounts (
  id,
  connection_id,
  organization_id,
  provider_account_external_id,
  provider_account_label,
  status
)
values (
  'd06cd699-6a75-4a92-9942-6c94dc268d3b',
  'd69a93dd-98ed-46fd-b486-1a39fb8388dd',
  '8f6bb14b-2126-49b8-bfdb-c60edbc3549b',
  'izkfvg-k0.myshopify.com',
  'Synthetic Shopify Shop',
  'active'
);

insert into public.commerce_provider_credentials (
  id,
  organization_id,
  connection_id,
  credential_type,
  storage_backend,
  secret_reference,
  public_metadata
)
values (
  '40000000-0000-4000-8000-000000000004',
  '8f6bb14b-2126-49b8-bfdb-c60edbc3549b',
  'd69a93dd-98ed-46fd-b486-1a39fb8388dd',
  'shopify_admin_api_access_token',
  'managed_secret',
  'test-only://synthetic/not-a-real-secret',
  '{"fixture":"m15_migration_chain","synthetic":true}'::jsonb
);

do $fixture_assertions$
begin
  if (select count(*) from public.tracekit_memberships m
      join public.tracekit_roles r on r.id = m.role_id
      where m.status = 'active'
        and m.organization_id is null
        and r.role_key = 'platform-owner') <> 1
    or (select count(*) from public.commerce_provider_credentials
        where organization_id = '8f6bb14b-2126-49b8-bfdb-c60edbc3549b'
          and connection_id = 'd69a93dd-98ed-46fd-b486-1a39fb8388dd'
          and revoked_at is null) <> 1
    or exists (select 1 from public.tracekit_business_contexts
               where organization_id = '8f6bb14b-2126-49b8-bfdb-c60edbc3549b')
    or exists (select 1 from public.canonical_offers
               where organization_id = '8f6bb14b-2126-49b8-bfdb-c60edbc3549b')
    or exists (select 1 from public.commerce_product_mapping_decisions
               where organization_id = '8f6bb14b-2126-49b8-bfdb-c60edbc3549b')
  then
    raise exception 'M15 test prerequisite fixture did not converge';
  end if;
end
$fixture_assertions$;

commit;
