-- PREPARED ONLY: read-only sanity checks after separately authorized enrollment.
-- SQL does not substitute for customer-level HTTP authorization verification.
begin read only;
select id, account_type, status from public.tracekit_accounts
where id='26a6eabb-2ddc-4b0d-8bf2-ce61c2ca700f';
select id, owning_account_id, status from public.tracekit_organizations
where id='ab757103-4ad9-4fd8-a3f1-3f5adaee9b03';
select id, account_id, organization_id, status from public.tracekit_business_contexts
where organization_id='ab757103-4ad9-4fd8-a3f1-3f5adaee9b03';
select m.id,m.organization_id,m.account_id,r.role_key,m.status,m.effective_from,m.effective_until,
 m.invitation_id, (p.invitation_id is not null) as orders_only_policy
from public.tracekit_memberships m
join public.tracekit_roles r on r.id=m.role_id
left join public.tracekit_orders_only_invitations p on p.invitation_id=m.invitation_id
where m.user_id='92575f17-e049-4069-ab57-52c196994e6b';
select m.id as membership_id,o.capability,o.effect,o.organization_id,o.resource_type,o.resource_id
from public.tracekit_memberships m join public.tracekit_permission_overrides o on o.membership_id=m.id
where m.user_id='92575f17-e049-4069-ab57-52c196994e6b'
 and m.organization_id='ab757103-4ad9-4fd8-a3f1-3f5adaee9b03'
 and o.capability in ('financials.view','orders.view_financials');
select a.membership_id,a.organization_id,a.business_context_id,a.status
from public.tracekit_business_context_access a join public.tracekit_memberships m on m.id=a.membership_id
where m.user_id='92575f17-e049-4069-ab57-52c196994e6b'
 and m.organization_id='ab757103-4ad9-4fd8-a3f1-3f5adaee9b03';
commit;
