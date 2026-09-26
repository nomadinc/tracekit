create or replace function public.set_commerce_connection_pause(
  p_organization_id uuid,
  p_account_id uuid,
  p_connection_id uuid,
  p_paused boolean,
  p_reason_code text
) returns public.commerce_connection_pauses
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_row public.commerce_connection_pauses%rowtype; v_reason text:=lower(btrim(coalesce(p_reason_code,''))); v_now timestamptz:=now();
begin
  if v_reason !~ '^[a-z][a-z0-9_]{2,63}$' then raise exception 'invalid commerce pause reason' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('commerce-connection-pause:'||p_connection_id::text,0));
  if not exists(select 1 from public.commerce_provider_connections c where c.id=p_connection_id and c.organization_id=p_organization_id and c.account_id=p_account_id and c.provider='commas' and c.status='connected') then raise exception 'commerce pause scope unavailable' using errcode='42501'; end if;
  insert into public.commerce_connection_pauses(connection_id,organization_id,account_id,paused,reason_code,paused_at,resumed_at,actor_context,updated_at)
  values(p_connection_id,p_organization_id,p_account_id,p_paused,v_reason,case when p_paused then v_now else null end,case when p_paused then null else v_now end,'product_admin',v_now)
  on conflict(connection_id) do update set paused=excluded.paused,reason_code=excluded.reason_code,paused_at=case when excluded.paused then coalesce(public.commerce_connection_pauses.paused_at,v_now) else null end,resumed_at=case when excluded.paused then null else v_now end,actor_context='product_admin',updated_at=v_now
  returning * into v_row;
  insert into public.tracekit_audit_events(actor_user_id,authenticated_identity_id,account_id,organization_id,action,target_type,target_id,result,correlation_id,metadata)
  values(null,'operator:commerce-pause',p_account_id,p_organization_id,case when p_paused then 'commerce.connection_paused' else 'commerce.connection_resumed' end,'commerce_provider_connection',p_connection_id::text,'success',gen_random_uuid()::text,jsonb_build_object('reason_code',v_reason));
  return v_row;
end $$;

revoke all on function public.set_commerce_connection_pause(uuid,uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.set_commerce_connection_pause(uuid,uuid,uuid,boolean,text) to service_role;
