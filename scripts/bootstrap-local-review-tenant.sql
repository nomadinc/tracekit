-- Local development only: restore the authenticated Bullseye review tenant.
-- The caller supplies workos_user_id. This script never creates tracekit_users.
\set ON_ERROR_STOP on

begin;

create temporary table tracekit_fixture_user on commit drop as
select id
from public.tracekit_users
where workos_user_id = :'workos_user_id';

do $$
begin
  if (select count(*) from tracekit_fixture_user) <> 1 then
    raise exception 'Expected exactly one synchronized TraceKit user for the supplied WorkOS user ID.';
  end if;
  if exists (select 1 from public.tracekit_accounts where name = 'Bullseye Health' and id <> '70000000-0000-0000-0000-000000000001'::uuid) then
    raise exception 'A non-fixture Bullseye Health Account already exists.';
  end if;
  if exists (select 1 from public.tracekit_organizations where name = 'Bullseye Health' and id <> '70000000-0000-0000-0000-000000000002'::uuid) then
    raise exception 'A non-fixture Bullseye Health Organization already exists.';
  end if;
end $$;

insert into public.tracekit_accounts (id, account_type, name, status)
values ('70000000-0000-0000-0000-000000000001', 'client', 'Bullseye Health', 'active')
on conflict (id) do update
set account_type = excluded.account_type, name = excluded.name, status = excluded.status, updated_at = now();

-- A separate platform Account/Membership proves the local reviewer is a
-- Product/Admin identity. The active Bullseye session remains Organization
-- scoped; the explicit capability entitlement below grants only the
-- Investigation access needed for authenticated product review.
insert into public.tracekit_accounts (id, account_type, name, status)
values ('70000000-0000-0000-0000-000000000005', 'platform', 'TraceKit Local Product Review', 'active')
on conflict (id) do update
set account_type = excluded.account_type, name = excluded.name, status = excluded.status, updated_at = now();

insert into public.tracekit_organizations (id, owning_account_id, name, status)
values ('70000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', 'Bullseye Health', 'active')
on conflict (id) do update
set owning_account_id = excluded.owning_account_id, name = excluded.name, status = excluded.status, updated_at = now();

insert into public.tracekit_business_contexts (id, account_id, organization_id, name, status, fulfillment_type, metadata)
values ('offer-bullseye', '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 'Bullseye', 'active', 'digital', '{"fixture":"local_authenticated_review"}'::jsonb)
on conflict (id) do update
set account_id = excluded.account_id, organization_id = excluded.organization_id, name = excluded.name,
    status = excluded.status, fulfillment_type = excluded.fulfillment_type, metadata = excluded.metadata, updated_at = now();

insert into public.tracekit_memberships (id, user_id, organization_id, role_id, status, effective_from, effective_until)
select '70000000-0000-0000-0000-000000000003', fixture.id, '70000000-0000-0000-0000-000000000002', role.id, 'active', now(), null
from tracekit_fixture_user fixture
join public.tracekit_roles role on role.role_key = 'organization-admin'
on conflict (user_id, organization_id) where organization_id is not null do update
set account_id = null, role_id = excluded.role_id, status = 'active', effective_until = null, updated_at = now();

insert into public.tracekit_memberships (id, user_id, account_id, role_id, status, effective_from, effective_until)
select '70000000-0000-0000-0000-000000000006', fixture.id,
       '70000000-0000-0000-0000-000000000005', role.id, 'active', now(), null
from tracekit_fixture_user fixture
join public.tracekit_roles role on role.role_key = 'platform-admin'
on conflict (user_id, account_id) where account_id is not null do update
set organization_id = null, role_id = excluded.role_id, status = 'active', effective_until = null, updated_at = now();

insert into public.tracekit_permission_overrides
  (id, membership_id, capability, effect, organization_id, resource_type, reason)
select '70000000-0000-0000-0000-000000000007', membership.id,
       'admin.manage_feature_access', 'allow',
       '70000000-0000-0000-0000-000000000002', 'investigation',
       'Local authenticated Product/Admin Investigation review'
from public.tracekit_memberships membership
join tracekit_fixture_user fixture on fixture.id = membership.user_id
where membership.organization_id = '70000000-0000-0000-0000-000000000002'
on conflict (id) do update
set membership_id = excluded.membership_id, capability = excluded.capability,
    effect = excluded.effect, organization_id = excluded.organization_id,
    resource_type = excluded.resource_type, reason = excluded.reason, updated_at = now();

insert into public.tracekit_permission_overrides
  (id, membership_id, capability, effect, organization_id, resource_type, reason)
select '70000000-0000-0000-0000-000000000008', membership.id,
       'admin.manage_feature_access', 'allow',
       '70000000-0000-0000-0000-000000000002', 'tkid_origin_registry',
       'Local authenticated Product/Admin managed TKID origin review'
from public.tracekit_memberships membership
join tracekit_fixture_user fixture on fixture.id = membership.user_id
where membership.organization_id = '70000000-0000-0000-0000-000000000002'
on conflict (id) do update
set membership_id = excluded.membership_id, capability = excluded.capability,
    effect = excluded.effect, organization_id = excluded.organization_id,
    resource_type = excluded.resource_type, reason = excluded.reason, updated_at = now();

insert into public.tracekit_business_context_access (id, membership_id, organization_id, business_context_id, status)
select '70000000-0000-0000-0000-000000000004', membership.id,
       '70000000-0000-0000-0000-000000000002', 'offer-bullseye', 'active'
from public.tracekit_memberships membership
join tracekit_fixture_user fixture on fixture.id = membership.user_id
where membership.organization_id = '70000000-0000-0000-0000-000000000002'
on conflict (membership_id, organization_id, business_context_id) do update
set status = 'active';

commit;
