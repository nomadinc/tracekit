-- Server-only invitation lifecycle. WorkOS authenticates; TraceKit grants scoped access.
-- Keep the previous RPCs intact for older deployments during rollout.
alter table public.tracekit_invitations add column issuing_agency_id uuid references public.tracekit_agencies(id);
alter table public.tracekit_invitation_deliveries drop constraint tracekit_invitation_deliveries_state_check;
alter table public.tracekit_invitation_deliveries add constraint tracekit_invitation_deliveries_state_check
 check(state in ('prepared','sending','sent','failed','unknown','sign-in-required'));

create function public.tracekit_tenant_invitation(
 p_operation text,p_actor_id uuid,p_identity_id text,p_correlation_id text,
 p_invitation_id uuid default null,p_membership_id uuid default null,
 p_organization_id uuid default null,p_account_id uuid default null,p_email text default null,
 p_context_ids text[] default null,p_email_verified boolean default false,
 p_attempt_id uuid default null,p_state text default null,p_provider_id text default null,p_provider_state text default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_user public.tracekit_users%rowtype;
 v_inv public.tracekit_invitations%rowtype;
 v_m public.tracekit_memberships%rowtype;
 v_d public.tracekit_invitation_deliveries%rowtype;
 v_account uuid; v_org uuid; v_agency uuid; v_issuing_agency uuid; v_role text; v_role_id uuid;
 v_platform boolean:=false; v_allowed boolean:=false; v_claim boolean:=false;
 v_contexts text[]; v_id uuid; v_reason text;
begin
 select * into v_user from public.tracekit_users where id=p_actor_id and workos_user_id=p_identity_id and status='active' for update;
 if not found then return jsonb_build_object('ok',false,'reason','unavailable'); end if;
 if p_operation not in ('issue','accept','revoke','claim','status','finish') or p_operation is null then return jsonb_build_object('ok',false,'reason','unavailable'); end if;
 if p_operation='issue' then
  v_account:=p_account_id; v_org:=p_organization_id;
  select array_agg(distinct c order by c) into v_contexts from unnest(p_context_ids) c;
 else
  select * into v_inv from public.tracekit_invitations where id=p_invitation_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','unavailable'); end if;
  v_account:=v_inv.target_account_id; v_org:=v_inv.target_organization_id; v_contexts:=v_inv.business_context_ids;
  if p_operation<>'accept' and (p_account_id is distinct from v_account or p_organization_id is distinct from v_org) then return jsonb_build_object('ok',false,'reason','unavailable'); end if;
 end if;
 -- Exactly one authorization target. Agency teams are account scoped; clients are organization scoped.
 if num_nonnulls(v_account,v_org)<>1 then v_reason:='unavailable';
 elsif v_account is not null then
  select g.id into v_agency from public.tracekit_agencies g join public.tracekit_accounts a on a.id=g.account_id
   where g.account_id=v_account and g.status='active' and a.status='active' and a.account_type='agency' for share of g,a;
  if v_agency is null then v_reason:='unavailable'; end if;
 else
  if not exists(select 1 from public.tracekit_organizations o join public.tracekit_accounts a on a.id=o.owning_account_id
   where o.id=v_org and o.status='active' and a.status='active' and a.account_type='client') then v_reason:='unavailable'; end if;
 end if;

 -- Lock authorization evidence so concurrent suspension/removal cannot race acceptance.
 perform c.id from public.tracekit_business_contexts c join public.tracekit_organizations o on o.id=c.organization_id join public.tracekit_accounts a on a.id=o.owning_account_id where c.id=any(v_contexts) order by c.id for share of c,o,a;
 perform s.id from public.tracekit_agency_client_assignments s where (s.agency_id=v_agency or s.agency_id=v_inv.issuing_agency_id) order by s.id for share;
 perform g.id from public.tracekit_agencies g join public.tracekit_accounts a on a.id=g.account_id where g.id=v_inv.issuing_agency_id order by g.id for share of g,a;
 if v_inv.issuing_agency_id is not null and not exists(select 1 from public.tracekit_agencies g join public.tracekit_accounts a on a.id=g.account_id join public.tracekit_agency_client_assignments s on s.agency_id=g.id where g.id=v_inv.issuing_agency_id and g.status='active' and a.status='active' and a.account_type='agency' and s.organization_id=v_org and s.status='active') then v_reason:='unavailable'; end if;
 -- Validate every selected workspace against its current tenant and agency assignment.
 if coalesce(cardinality(v_contexts),0)=0 or exists(
  select 1 from unnest(v_contexts) x(id) where not exists(
   select 1 from public.tracekit_business_contexts c join public.tracekit_organizations o on o.id=c.organization_id
    join public.tracekit_accounts a on a.id=o.owning_account_id
   where c.id=x.id and c.status='active' and o.status='active' and a.status='active' and a.account_type='client'
    and ((v_org is not null and c.organization_id=v_org) or (v_agency is not null and exists(
     select 1 from public.tracekit_agency_client_assignments s where s.agency_id=v_agency and s.organization_id=o.id and s.status='active')))
  )) then v_reason:='unavailable'; end if;
 if p_operation<>'accept' and v_reason is null then
  select * into v_m from public.tracekit_memberships where id=p_membership_id and user_id=p_actor_id and status='active'
   and effective_from<=now() and (effective_until is null or effective_until>now()) for share;
  select role_key into v_role from public.tracekit_roles where id=v_m.role_id;
  v_platform:=v_role in ('platform-owner','platform-admin') and v_m.organization_id is null and exists(
   select 1 from public.tracekit_accounts where id=v_m.account_id and account_type='platform' and status='active');
  v_allowed:=v_platform or (v_org is not null and v_m.organization_id=v_org and v_role in ('organization-owner','organization-admin'));
  if v_role in ('agency-owner','agency-admin') and v_m.organization_id is null then
   select id into v_issuing_agency from public.tracekit_agencies where account_id=v_m.account_id and status='active';
   v_allowed:=v_allowed or (v_account is not null and v_m.account_id=v_account) or (v_org is not null and exists(
    select 1 from public.tracekit_agencies g join public.tracekit_accounts a on a.id=g.account_id
     join public.tracekit_agency_client_assignments s on s.agency_id=g.id
    where g.account_id=v_m.account_id and g.status='active' and a.status='active' and a.account_type='agency' and s.organization_id=v_org and s.status='active'));
  end if;
  if not coalesce(v_allowed,false) or exists(select 1 from public.tracekit_permission_overrides d where d.membership_id=v_m.id and d.capability='users.invite' and d.effect='deny'
    and (d.organization_id is null or d.organization_id=v_org or exists(select 1 from public.tracekit_business_contexts c where c.id=any(v_contexts) and c.organization_id=d.organization_id)))
   or (not coalesce(v_platform,false) and exists(select 1 from unnest(v_contexts) x(id) where not exists(select 1 from public.tracekit_business_context_access b join public.tracekit_business_contexts c on c.id=b.business_context_id and c.organization_id=b.organization_id where b.membership_id=v_m.id and b.business_context_id=x.id and b.status='active')))
   then v_reason:='unavailable'; end if;
 end if;
 if v_reason is null and p_operation='issue' then
  if p_email is null or length(trim(p_email))>254 or trim(p_email)!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then v_reason:='invalid_request';
  else
   perform pg_advisory_xact_lock(hashtext(coalesce(v_account,v_org)::text||':'||lower(trim(p_email))));
   if exists(select 1 from public.tracekit_users u join public.tracekit_memberships m on m.user_id=u.id where lower(trim(u.primary_email))=lower(trim(p_email)) and (m.account_id=v_account or m.organization_id=v_org)) then v_reason:='existing_membership';
   else
    select id into v_role_id from public.tracekit_roles where role_key=case when v_account is null then 'client-read-only' else 'agency-read-only' end and account_type=case when v_account is null then 'client' else 'agency' end;
    if v_role_id is null then v_reason:='unavailable';
    else
     select * into v_inv from public.tracekit_invitations where target_account_id is not distinct from v_account and target_organization_id is not distinct from v_org
      and lower(trim(intended_email))=lower(trim(p_email)) and status='pending' and expires_at>now() order by created_at,id limit 1 for update;
     if v_inv.id is not null then
      if v_inv.requested_role_id<>v_role_id or (select array_agg(distinct c order by c) from unnest(v_inv.business_context_ids) c) is distinct from v_contexts then v_reason:='scope_differs'; end if;
     else
      insert into public.tracekit_invitations(id,inviter_user_id,intended_email,target_account_id,target_organization_id,requested_role_id,expires_at,business_context_ids,issuing_agency_id)
       values(coalesce(p_invitation_id,gen_random_uuid()),p_actor_id,lower(trim(p_email)),v_account,v_org,v_role_id,now()+interval '7 days',v_contexts,case when v_org is not null then v_issuing_agency else null end) returning * into v_inv;
     end if;
    end if;
   end if;
  end if;
 elsif v_reason is null and p_operation='accept' then
  select role_key into v_role from public.tracekit_roles where id=v_inv.requested_role_id and account_type=case when v_account is null then 'client' else 'agency' end;
  if v_inv.status<>'pending' then v_reason:='unavailable';
  elsif v_inv.expires_at<=now() then update public.tracekit_invitations set status='expired',updated_at=now() where id=v_inv.id; v_reason:='expired';
  elsif not coalesce(p_email_verified,false) or lower(trim(v_user.primary_email))<>lower(trim(v_inv.intended_email)) then v_reason:='identity_mismatch';
  elsif v_role is distinct from (case when v_account is null then 'client-read-only' else 'agency-read-only' end) then v_reason:='unavailable';
  elsif exists(select 1 from public.tracekit_memberships where user_id=p_actor_id and (account_id=v_account or organization_id=v_org)) then v_reason:='existing_membership';
  else
   insert into public.tracekit_memberships(user_id,account_id,organization_id,role_id,invitation_id) values(p_actor_id,v_account,v_org,v_inv.requested_role_id,v_inv.id) returning id into v_id;
   insert into public.tracekit_business_context_access(membership_id,organization_id,business_context_id)
    select v_id,c.organization_id,c.id from public.tracekit_business_contexts c where c.id=any(v_contexts);
   update public.tracekit_invitations set status='accepted',accepted_by_user_id=p_actor_id,accepted_at=now(),updated_at=now() where id=v_inv.id;
  end if;
 elsif v_reason is null and p_operation='revoke' then
  if v_inv.status<>'pending' then v_reason:='unavailable'; else update public.tracekit_invitations set status='revoked',updated_at=now() where id=v_inv.id; end if;
 end if;
 if v_reason is null and p_operation in ('issue','claim','status','finish') then
  if p_operation in ('issue','claim') and (v_inv.status<>'pending' or v_inv.expires_at<=now()) then v_reason:='unavailable';
  else
   insert into public.tracekit_invitation_deliveries(invitation_id) values(v_inv.id) on conflict do nothing;
   select * into v_d from public.tracekit_invitation_deliveries where invitation_id=v_inv.id for update;
   if p_operation in ('issue','claim') and v_d.state in ('prepared','failed') and v_d.attempts<3 and (v_d.state='prepared' or v_d.updated_at<now()-interval '30 seconds') then
    v_claim:=true;
    update public.tracekit_invitation_deliveries set state='sending',attempt_id=gen_random_uuid(),attempts=attempts+1,error_code=null,updated_at=now() where invitation_id=v_inv.id returning * into v_d;
   elsif p_operation='finish' then
    if v_d.attempt_id is distinct from p_attempt_id or v_d.state not in ('sending','unknown') or p_state is null or p_state not in ('sent','failed','unknown','sign-in-required')
     or (p_state='sent' and (p_provider_id is null or p_provider_id not like 'invitation_%' or p_provider_state not in ('pending','accepted','expired','revoked') or p_provider_state is null)) then v_reason:='unavailable';
    else update public.tracekit_invitation_deliveries set state=p_state,provider_invitation_id=p_provider_id,provider_state=p_provider_state,
     error_code=case when p_state in ('failed','sign-in-required') then 'provider_rejected' when p_state='unknown' then 'outcome_unknown' else null end,updated_at=now() where invitation_id=v_inv.id returning * into v_d; end if;
   end if;
   if not v_claim and v_d.state='sending' and v_d.updated_at<now()-interval '5 minutes' then update public.tracekit_invitation_deliveries set state='unknown',error_code='outcome_unknown',updated_at=now() where invitation_id=v_inv.id returning * into v_d; end if;
  end if;
 end if;
 insert into public.tracekit_audit_events(actor_user_id,authenticated_identity_id,account_id,organization_id,action,target_type,target_id,result,permission_evaluated,correlation_id,metadata)
 values(p_actor_id,p_identity_id,v_account,v_org,'invitation.'||p_operation,'invitation',coalesce(v_inv.id,p_invitation_id)::text,case when v_reason is null then 'success' else 'denied' end,case when p_operation='accept' then null else 'users.invite' end,p_correlation_id,jsonb_build_object('reason',v_reason,'state',v_d.state,'attempts',v_d.attempts));
 return jsonb_build_object('ok',v_reason is null,'reason',v_reason,'id',v_inv.id,'email',v_inv.intended_email,'expiresAt',v_inv.expires_at,'organizationId',case when v_reason is null then v_org else null end,'accountId',case when v_reason is null then v_account else null end,
  'state',v_d.state,'claimed',v_claim,'attemptId',v_d.attempt_id,'canRetry',v_inv.status='pending' and v_inv.expires_at>now() and v_d.state in ('prepared','failed') and v_d.attempts<3 and (v_d.state='prepared' or v_d.updated_at<now()-interval '30 seconds'));
end $$;
revoke all on function public.tracekit_tenant_invitation(text,uuid,text,text,uuid,uuid,uuid,uuid,text,text[],boolean,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.tracekit_tenant_invitation(text,uuid,text,text,uuid,uuid,uuid,uuid,text,text[],boolean,uuid,text,text,text) to service_role;

-- Explicit platform-governed client assignments, independent of individual workspace grants.
create function public.ws021_assign_agency_client(p_actor uuid,p_identity text,p_account uuid,p_org uuid,p_remove boolean,p_correlation text)
returns void language plpgsql security invoker set search_path='' as $$
declare v_agency uuid; v_assignment uuid;
begin
 perform public.ws021_assert_admin(p_actor,p_identity,'organizations.manage');
 select g.id into v_agency from public.tracekit_agencies g join public.tracekit_accounts a on a.id=g.account_id
  where g.account_id=p_account and g.status='active' and a.account_type='agency' and a.status='active' for update of g;
 if v_agency is null or not exists(select 1 from public.tracekit_organizations o join public.tracekit_accounts a on a.id=o.owning_account_id where o.id=p_org and o.status='active' and a.status='active' and a.account_type='client') then raise exception 'Resource unavailable' using errcode='42501'; end if;
 if p_remove then
  update public.tracekit_agency_client_assignments set status='removed',updated_at=now() where agency_id=v_agency and organization_id=p_org returning id into v_assignment;
  -- Removing an assignment also removes individual grants; reassigning must not restore old access.
  update public.tracekit_business_context_access b set status='removed' from public.tracekit_memberships m
   where b.membership_id=m.id and m.account_id=p_account and b.organization_id=p_org;
  update public.tracekit_invitations set status='revoked',updated_at=now() where status='pending' and (issuing_agency_id=v_agency and target_organization_id=p_org or target_account_id=p_account and exists(select 1 from public.tracekit_business_contexts c where c.id=any(business_context_ids) and c.organization_id=p_org));
 else
  insert into public.tracekit_agency_client_assignments(agency_id,organization_id,status) values(v_agency,p_org,'active')
   on conflict(agency_id,organization_id) do update set status='active',updated_at=now() returning id into v_assignment;
 end if;
 insert into public.tracekit_audit_events(actor_user_id,authenticated_identity_id,account_id,organization_id,action,target_type,target_id,result,permission_evaluated,correlation_id,metadata)
 values(p_actor,p_identity,p_account,p_org,case when p_remove then 'agency.assignment.removed' else 'agency.assignment.created' end,'agency_client_assignment',v_assignment::text,'success','organizations.manage',p_correlation,'{}'::jsonb);
end $$;
revoke all on function public.ws021_assign_agency_client(uuid,text,uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.ws021_assign_agency_client(uuid,text,uuid,uuid,boolean,text) to service_role;
