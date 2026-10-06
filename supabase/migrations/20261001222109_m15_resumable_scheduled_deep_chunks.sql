begin;

create or replace function public.pause_commerce_sync_run(
  p_run_id uuid,
  p_organization_id uuid,
  p_connection_id uuid,
  p_lease_owner text,
  p_reason text
)
returns boolean
language plpgsql
security invoker
set search_path=public
as $$
declare v_updated integer;
begin
  if nullif(btrim(p_lease_owner),'') is null or nullif(btrim(p_reason),'') is null then
    raise exception 'invalid commerce sync pause request' using errcode='22023';
  end if;
  update public.commerce_sync_runs
  set status='paused',
      stopping_reason=left(p_reason,120),
      lease_owner=null,
      lease_expires_at=null,
      heartbeat_at=now(),
      updated_at=now()
  where id=p_run_id
    and organization_id=p_organization_id
    and connection_id=p_connection_id
    and status='running'
    and lease_owner=p_lease_owner
    and cancelled_at is null;
  get diagnostics v_updated=row_count;
  return v_updated=1;
end $$;

revoke all on function public.pause_commerce_sync_run(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.pause_commerce_sync_run(uuid,uuid,uuid,text,text) to service_role;

commit;
