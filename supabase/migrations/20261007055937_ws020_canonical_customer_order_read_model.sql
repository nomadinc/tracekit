-- Read-time identity resolution only: original source rows and person_id remain intact.
-- A provider user ID is meaningful only inside its organization/connection/account.
create or replace view public.tracekit_customer_order_read_model with (security_invoker=true) as
select o.*, coalesce(o.person_id, proof.person_id) as resolved_person_id,
  case when o.person_id is not null then 'linked' when proof.person_id is not null then 'exact_provider_identity' else 'unresolved' end as identity_resolution
from public.platform_orders o
left join lateral (
  select case when count(distinct p.id)=1 then min(p.id::text)::uuid else null end as person_id
  from public.person_source_identities i
  join public.people p on p.id=i.person_id and p.organization_id=o.organization_id and p.workspace_id=o.workspace_id and p.status='active'
  where o.person_id is null and o.platform='next29'
    and o.organization_id::text=o.workspace_id
    and i.organization_id=o.organization_id and i.connection_id=o.connection_id
    and i.provider_account_id=o.provider_account_id and i.source_type='provider_customer_id'
    and i.source_id=o.raw_json->'user'->>'id' and i.status='observed'
    and i.evidence_id is not null
) proof on true;
revoke all on public.tracekit_customer_order_read_model from public, anon, authenticated;
grant select on public.tracekit_customer_order_read_model to service_role;
