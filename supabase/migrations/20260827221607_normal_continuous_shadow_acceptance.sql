-- One fixed, ordinary three-page continuous shadow acceptance reservation.
create or replace function public.enqueue_commas_normal_continuous_acceptance(p_request_key uuid)
returns table(run_id uuid, account_id uuid, organization_id uuid, connection_id uuid, provider_account_id uuid, scheduler_identity text, request_key uuid, created boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c public.commerce_provider_connections%rowtype;
  a public.commerce_provider_accounts%rowtype;
  s public.commerce_sync_schedules%rowtype;
  existing public.commerce_sync_runs%rowtype;
  q integer;
begin
  if p_request_key is null then raise exception 'normal acceptance request key required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('commas-normal-continuous-acceptance:ea1c2313-6120-4692-84c5-ec3562e7dcf6',0));
  select r.* into existing from public.commerce_sync_runs r where r.connection_id='ea1c2313-6120-4692-84c5-ec3562e7dcf6'::uuid and r.metadata->>'normal_acceptance'='true' limit 1;
  if found then return query select existing.id, null::uuid, existing.organization_id, existing.connection_id, existing.provider_account_id, existing.scheduler_idempotency_key, (existing.metadata->>'request_key')::uuid, false; return; end if;
  select x.* into c from public.commerce_provider_connections x where x.id='ea1c2313-6120-4692-84c5-ec3562e7dcf6'::uuid;
  if not found or c.provider<>'commas' or c.status<>'connected' then raise exception 'normal acceptance connection unavailable' using errcode='42501'; end if;
  if (select count(*) from public.commerce_provider_accounts x where x.organization_id=c.organization_id and x.connection_id=c.id and x.status='active')<>1 then raise exception 'normal acceptance provider account unavailable' using errcode='42501'; end if;
  select x.* into a from public.commerce_provider_accounts x where x.id='0369c701-717f-4c34-b230-8341bcdb7e65'::uuid and x.organization_id=c.organization_id and x.connection_id=c.id and x.status='active';
  if not found then raise exception 'normal acceptance provider scope mismatch' using errcode='42501'; end if;
  if not exists (select 1 from public.commerce_provider_credentials x where x.organization_id=c.organization_id and x.connection_id=c.id and x.revoked_at is null) then raise exception 'normal acceptance credential unavailable' using errcode='42501'; end if;
  select x.* into s from public.commerce_sync_schedules x where x.organization_id=c.organization_id and x.connection_id=c.id and x.provider_account_id=a.id and x.resource='transactions' limit 1;
  if not found or s.enabled or s.sync_frequency<>'hourly' or s.activation_state='paused' then raise exception 'normal acceptance schedule state invalid' using errcode='42501'; end if;
  if exists (select 1 from public.commerce_connection_pauses x where x.organization_id=c.organization_id and x.connection_id=c.id and x.paused=true) then raise exception 'normal acceptance connection paused' using errcode='42501'; end if;
  if exists (select 1 from public.commerce_sync_runs x where x.organization_id=c.organization_id and x.connection_id=c.id and x.status in ('queued','running','paused')) then raise exception 'normal acceptance active run exists' using errcode='42501'; end if;
  if exists (select 1 from public.commerce_repository_activation x where x.organization_id=c.organization_id and x.mode in ('live','live_beta')) then raise exception 'normal acceptance live activation exists' using errcode='42501'; end if;
  if exists (select 1 from public.tracekit_production_controls x where x.capability='commerce_scheduler' and x.activation_state='enabled') then raise exception 'normal acceptance scheduler control enabled' using errcode='42501'; end if;
  select x.quota_remaining into q from public.commerce_continuous_sync_state x where x.organization_id=c.organization_id and x.connection_id=c.id and x.provider_account_id=a.id and x.resource='transactions' and x.quota_observed_at is not null and x.quota_observed_at>=now()-interval '15 minutes' limit 1;
  if q is null or q-3<coalesce(s.quota_minimum_remaining,1000) then raise exception 'normal acceptance quota unavailable' using errcode='42501'; end if;
  return query insert into public.commerce_sync_runs(organization_id,connection_id,provider_account_id,sync_type,mode,scheduler_idempotency_key,metadata)
    values(c.organization_id,c.id,a.id,'transactions','continuous','operator-normal-continuous-acceptance:'||p_request_key::text,
      jsonb_build_object('account_id',c.account_id,'dispatch_source','operator_one_shot','normal_acceptance',true,'acceptance_cycle',true,'shadow_only',true,'max_pages',3,'per_page',100,'request_key',p_request_key::text))
    returning id,c.account_id,c.organization_id,c.id,a.id,'operator-normal-continuous-acceptance:'||p_request_key::text,p_request_key,true;
end; $$;

revoke all on function public.enqueue_commas_normal_continuous_acceptance(uuid) from public, anon, authenticated;
grant execute on function public.enqueue_commas_normal_continuous_acceptance(uuid) to service_role;
