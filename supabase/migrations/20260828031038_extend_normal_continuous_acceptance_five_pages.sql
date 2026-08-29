-- Corrective, fixed-scope reservation for the single five-page follow-up to
-- the safely bounded three-page normal acceptance run.
create or replace function public.enqueue_commas_normal_continuous_acceptance(p_request_key uuid)
returns table(run_id uuid, account_id uuid, organization_id uuid, connection_id uuid, provider_account_id uuid, scheduler_identity text, request_key uuid, created boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c public.commerce_provider_connections%rowtype;
  a public.commerce_provider_accounts%rowtype;
  s public.commerce_sync_schedules%rowtype;
  prior public.commerce_sync_runs%rowtype;
  existing public.commerce_sync_runs%rowtype;
  q integer;
begin
  if p_request_key is null then raise exception 'normal acceptance request key required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('commas-normal-continuous-acceptance-follow-up-5:ea1c2313-6120-4692-84c5-ec3562e7dcf6',0));
  select r.* into existing from public.commerce_sync_runs r where r.connection_id='ea1c2313-6120-4692-84c5-ec3562e7dcf6'::uuid and r.metadata->>'normal_acceptance_follow_up'='five_page' limit 1;
  if found then return query select existing.id, null::uuid, existing.organization_id, existing.connection_id, existing.provider_account_id, existing.scheduler_idempotency_key, (existing.metadata->>'request_key')::uuid, false; return; end if;
  select r.* into prior from public.commerce_sync_runs r where r.id='b1547be9-31aa-4487-9c08-796f6fc49005'::uuid for share;
  if not found or prior.connection_id is distinct from 'ea1c2313-6120-4692-84c5-ec3562e7dcf6'::uuid or prior.provider_account_id is distinct from '0369c701-717f-4c34-b230-8341bcdb7e65'::uuid or prior.status is distinct from 'completed_with_warnings' or prior.mode is distinct from 'continuous' or prior.pages_completed is distinct from 3 or prior.provider_request_count is distinct from 3 or prior.records_seen is distinct from 300 or prior.warnings_count is distinct from 1 or prior.stopping_reason is distinct from 'bounded_scan_limit' or prior.deeper_reconciliation_required is not true or prior.page_shift_detected is not false or prior.lease_owner is not null or prior.lease_expires_at is not null or prior.metadata->>'normal_acceptance' is distinct from 'true' or prior.metadata->>'shadow_only' is distinct from 'true' or prior.metadata->>'ordering' is distinct from 'newest_first' or prior.metadata->>'ordering_state' is distinct from 'newest_first' or coalesce(prior.metadata->>'pagination_classification','') not in ('none','benign_boundary_overlap') then raise exception 'normal acceptance prior run mismatch' using errcode='42501'; end if;
  if not exists (select 1 from public.commerce_sync_checkpoints x where x.sync_run_id=prior.id and x.resource='transactions' and x.page=3 and x.state='completed' and (x.metadata->>'new_records')::integer=7 and (x.metadata->>'updated_records')::integer=3 and (x.metadata->>'unchanged_records')::integer=90) then raise exception 'normal acceptance prior boundary mismatch' using errcode='42501'; end if;
  select x.* into c from public.commerce_provider_connections x where x.id='ea1c2313-6120-4692-84c5-ec3562e7dcf6'::uuid;
  if not found or c.provider<>'commas' or c.status<>'connected' then raise exception 'normal acceptance connection unavailable' using errcode='42501'; end if;
  select x.* into a from public.commerce_provider_accounts x where x.id='0369c701-717f-4c34-b230-8341bcdb7e65'::uuid and x.organization_id=c.organization_id and x.connection_id=c.id and x.status='active';
  if not found or (select count(*) from public.commerce_provider_accounts x where x.organization_id=c.organization_id and x.connection_id=c.id and x.status='active')<>1 then raise exception 'normal acceptance provider account unavailable' using errcode='42501'; end if;
  if not exists (select 1 from public.commerce_provider_credentials x where x.organization_id=c.organization_id and x.connection_id=c.id and x.revoked_at is null) then raise exception 'normal acceptance credential unavailable' using errcode='42501'; end if;
  select x.* into s from public.commerce_sync_schedules x where x.organization_id=c.organization_id and x.connection_id=c.id and x.provider_account_id=a.id and x.resource='transactions' limit 1;
  if not found or s.enabled or s.sync_frequency<>'hourly' or s.activation_state='paused' then raise exception 'normal acceptance schedule state invalid' using errcode='42501'; end if;
  if exists (select 1 from public.commerce_connection_pauses x where x.organization_id=c.organization_id and x.connection_id=c.id and x.paused=true) then raise exception 'normal acceptance connection paused' using errcode='42501'; end if;
  if exists (select 1 from public.commerce_sync_runs x where x.organization_id=c.organization_id and x.connection_id=c.id and x.status in ('queued','running','paused')) then raise exception 'normal acceptance active run exists' using errcode='42501'; end if;
  if exists (select 1 from public.commerce_repository_activation x where x.organization_id=c.organization_id and x.mode in ('live','live_beta')) then raise exception 'normal acceptance live activation exists' using errcode='42501'; end if;
  if exists (select 1 from public.tracekit_production_controls x where x.capability='commerce_scheduler' and x.activation_state='enabled') then raise exception 'normal acceptance scheduler control enabled' using errcode='42501'; end if;
  select x.quota_remaining into q from public.commerce_continuous_sync_state x where x.organization_id=c.organization_id and x.connection_id=c.id and x.provider_account_id=a.id and x.resource='transactions' and x.quota_observed_at is not null and x.quota_observed_at>=now()-interval '15 minutes' limit 1;
  if q is null or q-5<coalesce(s.quota_minimum_remaining,1000) then raise exception 'normal acceptance quota unavailable' using errcode='42501'; end if;
  return query insert into public.commerce_sync_runs(organization_id,connection_id,provider_account_id,sync_type,mode,scheduler_idempotency_key,metadata)
    values(c.organization_id,c.id,a.id,'transactions','continuous','operator-normal-continuous-acceptance-5:'||p_request_key::text,
      jsonb_build_object('account_id',c.account_id,'dispatch_source','operator_one_shot','normal_acceptance',true,'normal_acceptance_follow_up','five_page','follow_up_of',prior.id,'acceptance_cycle',true,'shadow_only',true,'max_pages',5,'per_page',100,'request_key',p_request_key::text))
    returning id,c.account_id,c.organization_id,c.id,a.id,'operator-normal-continuous-acceptance-5:'||p_request_key::text,p_request_key,true;
end; $$;

revoke all on function public.enqueue_commas_normal_continuous_acceptance(uuid) from public, anon, authenticated;
grant execute on function public.enqueue_commas_normal_continuous_acceptance(uuid) to service_role;
