begin;
insert into public.tracekit_business_context_access(membership_id,organization_id,business_context_id,status)
select m.id,bc.organization_id,bc.id,'active'
from public.tracekit_memberships m join public.tracekit_business_contexts bc on bc.organization_id=m.organization_id
where m.status='active' and bc.status='active' and m.organization_id is not null
and not exists(select 1 from public.tracekit_business_context_access a where a.membership_id=m.id and a.organization_id=bc.organization_id and a.business_context_id=bc.id);
commit;