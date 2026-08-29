create or replace function public.fail_expired_commerce_sync_runs(
  p_organization_id uuid,
  p_connection_id uuid,
  p_provider_account_id uuid,
  p_resource text,
  p_now timestamptz default now()
) returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'commerce-expired-lease:'||p_connection_id::text||':'||p_provider_account_id::text||':'||p_resource,0));
  with expired as (
    update public.commerce_sync_runs r
       set status='failed', stopping_reason='lease_expired',
           last_error_code='lease_expired',
           last_error_summary='Continuous Commerce worker lease expired before terminalization.',
           lease_owner=null, lease_expires_at=null, updated_at=p_now
     where r.organization_id=p_organization_id and r.connection_id=p_connection_id
       and r.provider_account_id=p_provider_account_id and r.sync_type=p_resource
       and r.status='running' and r.lease_expires_at is not null and r.lease_expires_at<p_now
     returning r.id
  ) select count(*)::integer into v_count from expired;
  if v_count>0 then
    update public.commerce_continuous_sync_state
       set status='failed', warnings='[{"code":"lease_expired"}]'::jsonb, updated_at=p_now
     where organization_id=p_organization_id and connection_id=p_connection_id
       and provider_account_id=p_provider_account_id and resource=p_resource;
  end if;
  return v_count;
end $$;

revoke all on function public.fail_expired_commerce_sync_runs(uuid,uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.fail_expired_commerce_sync_runs(uuid,uuid,uuid,text,timestamptz) to service_role;
