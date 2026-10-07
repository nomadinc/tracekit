-- Durable single-send ownership. Ambiguous provider outcomes are never automatically replayed.
create table public.tracekit_invitation_deliveries (
 invitation_id uuid primary key references public.tracekit_invitations(id),
 state text not null default 'prepared' check(state in ('prepared','sending','sent','failed','unknown')),
 attempt_id uuid, attempts integer not null default 0,
 provider text not null default 'workos' check(provider='workos'),
 provider_invitation_id text unique,
 provider_state text check(provider_state in ('pending','accepted','expired','revoked')),
 error_code text check(error_code in ('provider_rejected','outcome_unknown')),
 updated_at timestamptz not null default now()
);
alter table public.tracekit_invitation_deliveries enable row level security;
revoke all on public.tracekit_invitation_deliveries from public,anon,authenticated;
grant select,insert,update on public.tracekit_invitation_deliveries to service_role;
-- Preserve the already-audited manual send; do not send Anthony a second provider invitation.
insert into public.tracekit_invitation_deliveries(invitation_id,state,provider_invitation_id,provider_state)
select i.id,'sent',a.metadata->>'providerInvitationId','pending'
from public.tracekit_invitations i join public.tracekit_audit_events a on a.target_id=i.id::text
where a.action='invitation.authentication_email.requested' and a.result='success'
 and a.metadata->>'provider'='workos' and a.metadata->>'sendResult'='api_accepted'
 and a.metadata->>'providerInvitationId' like 'invitation_%'
on conflict do nothing;

create function public.tracekit_invitation_delivery(p_operation text,p_actor_id uuid,p_identity_id text,p_correlation_id text,p_membership_id uuid,p_organization_id uuid,p_invitation_id uuid default null,p_email text default null,p_context_ids text[] default null,p_attempt_id uuid default null,p_state text default null,p_provider_id text default null,p_provider_state text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_inv public.tracekit_invitations%rowtype; v_d public.tracekit_invitation_deliveries%rowtype; v_m public.tracekit_memberships%rowtype; v_role text; v_platform boolean; v_result jsonb; v_contexts text[]; v_claim boolean:=false;
begin
 if not exists(select 1 from public.tracekit_users where id=p_actor_id and workos_user_id=p_identity_id and status='active') then raise exception 'Resource unavailable' using errcode='42501'; end if;
 select * into v_m from public.tracekit_memberships where id=p_membership_id and user_id=p_actor_id and status='active' and effective_from<=now() and (effective_until is null or effective_until>now()) for share;
 select role_key into v_role from public.tracekit_roles where id=v_m.role_id;
 v_platform:=v_role in ('platform-owner','platform-admin') and v_m.organization_id is null and exists(select 1 from public.tracekit_accounts where id=v_m.account_id and account_type='platform' and status='active');
 if not coalesce(v_platform or (v_role in ('organization-owner','organization-admin') and v_m.organization_id=p_organization_id),false)
  or exists(select 1 from public.tracekit_permission_overrides where membership_id=v_m.id and capability='users.invite' and effect='deny' and (organization_id is null or organization_id=p_organization_id))
  or not exists(select 1 from public.tracekit_organizations o join public.tracekit_accounts a on a.id=o.owning_account_id where o.id=p_organization_id and o.status='active' and a.status='active' and a.account_type='client') then raise exception 'Resource unavailable' using errcode='42501'; end if;
 if p_operation='issue' then
  select array_agg(distinct c order by c) into v_contexts from unnest(p_context_ids) c;
  if p_email is null or length(trim(p_email))>254 or trim(p_email)!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or coalesce(cardinality(v_contexts),0)=0
   or exists(select 1 from unnest(v_contexts) c where not exists(select 1 from public.tracekit_business_contexts b where b.id=c and b.organization_id=p_organization_id and b.status='active') or (not v_platform and not exists(select 1 from public.tracekit_business_context_access b where b.membership_id=v_m.id and b.business_context_id=c and b.organization_id=p_organization_id and b.status='active'))) then raise exception 'Resource unavailable' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtext(p_organization_id::text||':'||lower(trim(p_email))));
  -- Acceptance rejects existing memberships; retries after acceptance must not issue another invitation.
  if exists(select 1 from public.tracekit_users u join public.tracekit_memberships m on m.user_id=u.id where lower(u.primary_email)=lower(trim(p_email)) and m.organization_id=p_organization_id) then return jsonb_build_object('ok',false,'reason','existing_membership'); end if;
  select * into v_inv from public.tracekit_invitations i where i.target_organization_id=p_organization_id and lower(i.intended_email)=lower(trim(p_email)) and i.status='pending' and i.expires_at>now() order by i.created_at,i.id limit 1 for update;
  if v_inv.id is not null then
   if (select array_agg(distinct c order by c) from unnest(v_inv.business_context_ids) c) is distinct from v_contexts or not exists(select 1 from public.tracekit_roles where id=v_inv.requested_role_id and role_key='client-read-only' and account_type='client') then raise exception 'Invitation scope differs'; end if;
  else
   v_result:=public.tracekit_customer_invitation('issue',p_actor_id,p_identity_id,p_correlation_id,coalesce(p_invitation_id,gen_random_uuid()),p_membership_id,p_organization_id,p_email,v_contexts);
   if not (v_result->>'ok')::boolean then return v_result; end if;
   select * into v_inv from public.tracekit_invitations where id=(v_result->>'id')::uuid for update;
  end if;
 else
  select * into v_inv from public.tracekit_invitations where id=p_invitation_id and target_organization_id=p_organization_id and (p_operation in ('finish','status') or (status='pending' and expires_at>now())) for update;
 end if;
 if v_inv.id is null then raise exception 'Resource unavailable' using errcode='42501'; end if;
 insert into public.tracekit_invitation_deliveries(invitation_id) values(v_inv.id) on conflict do nothing;
 select * into v_d from public.tracekit_invitation_deliveries where invitation_id=v_inv.id for update;
 if p_operation in ('issue','claim') and v_d.state in ('prepared','failed') and v_d.attempts<3 and (v_d.state='prepared' or v_d.updated_at<now()-interval '30 seconds') then
  v_claim:=true;
  update public.tracekit_invitation_deliveries set state='sending',attempt_id=gen_random_uuid(),attempts=attempts+1,error_code=null,updated_at=now() where invitation_id=v_inv.id returning * into v_d;
 elsif p_operation='finish' then
  if v_d.attempt_id is distinct from p_attempt_id or (v_d.state not in ('sending','unknown') and v_d.state is distinct from p_state) or p_state not in ('sent','failed','unknown') or p_state is null then raise exception 'Invalid delivery attempt'; end if;
  if p_state='sent' and (p_provider_id is null or p_provider_id not like 'invitation_%' or p_provider_state is null) then raise exception 'Invalid provider result'; end if;
  update public.tracekit_invitation_deliveries set state=p_state,provider_invitation_id=p_provider_id,provider_state=p_provider_state,error_code=case p_state when 'failed' then 'provider_rejected' when 'unknown' then 'outcome_unknown' else null end,updated_at=now() where invitation_id=v_inv.id returning * into v_d;
 elsif p_operation not in ('issue','claim','status') then raise exception 'Invalid operation'; end if;
 -- A stale lease is ambiguous, never retryable. A late known result may still settle its attempt.
 if not v_claim and v_d.state='sending' and v_d.updated_at<now()-interval '5 minutes' then
  update public.tracekit_invitation_deliveries set state='unknown',error_code='outcome_unknown',updated_at=now() where invitation_id=v_inv.id returning * into v_d;
 end if;
 insert into public.tracekit_audit_events(actor_user_id,authenticated_identity_id,organization_id,action,target_type,target_id,result,permission_evaluated,correlation_id,metadata)
 values(p_actor_id,p_identity_id,p_organization_id,'invitation.delivery.'||p_operation,'invitation',v_inv.id::text,case when v_d.state in ('failed','unknown') then 'failure' else 'success' end,'users.invite',p_correlation_id,jsonb_build_object('provider','workos','state',v_d.state,'attempts',v_d.attempts,'providerInvitationId',v_d.provider_invitation_id,'errorCode',v_d.error_code));
 return jsonb_build_object('ok',true,'id',v_inv.id,'email',v_inv.intended_email,'expiresAt',v_inv.expires_at,'organizationId',v_inv.target_organization_id,'state',v_d.state,'claimed',v_claim,'attemptId',v_d.attempt_id,'providerInvitationId',v_d.provider_invitation_id);
end $$;
revoke all on function public.tracekit_invitation_delivery(text,uuid,text,text,uuid,uuid,uuid,text,text[],uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.tracekit_invitation_delivery(text,uuid,text,text,uuid,uuid,uuid,text,text[],uuid,text,text,text) to service_role;
