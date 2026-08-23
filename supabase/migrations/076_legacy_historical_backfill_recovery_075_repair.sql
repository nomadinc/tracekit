-- Repair migration 075 after its marker table/ACL statements succeeded but
-- its invalid RETURN QUERY function body prevented RPC creation.
create table if not exists public.commerce_historical_backfill_recovery_markers (
  recovery_key text primary key,
  run_id uuid not null references public.commerce_sync_runs(id),
  consumed_at timestamptz not null default now()
);

revoke all on table public.commerce_historical_backfill_recovery_markers from public, anon, authenticated;
grant select, insert on table public.commerce_historical_backfill_recovery_markers to service_role;

drop function if exists public.recover_legacy_historical_backfill_59bf7114(uuid);

create or replace function public.recover_legacy_historical_backfill_59bf7114(
  p_run_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.commerce_sync_runs%rowtype;
  v_marker text := 'legacy-historical-backfill-59bf7114-5902-481b-ba49-baa698114109';
  v_updated integer;
begin
  if p_run_id <> '59bf7114-5902-481b-ba49-baa698114109'::uuid then
    raise exception 'legacy historical backfill recovery run mismatch' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_marker, 0));
  if exists (select 1 from public.commerce_historical_backfill_recovery_markers where recovery_key = v_marker) then
    raise exception 'legacy historical backfill recovery already consumed' using errcode = '55000';
  end if;

  select * into v_run from public.commerce_sync_runs where id = p_run_id for update;
  if not found
     or v_run.status <> 'completed'
     or coalesce(v_run.metadata->>'historical_backfill', '') <> 'true'
     or coalesce(v_run.metadata->>'range_complete', '') <> 'false'
     or coalesce(v_run.metadata->>'resume_page', '') <> '2'
     or v_run.lease_owner is not null
     or v_run.lease_expires_at is not null
     or v_run.cancelled_at is not null then
    raise exception 'legacy historical backfill recovery predicates failed' using errcode = '22023';
  end if;

  insert into public.commerce_historical_backfill_recovery_markers(recovery_key, run_id)
  values (v_marker, p_run_id);
  update public.commerce_sync_runs set status = 'paused', updated_at = now() where id = p_run_id;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'legacy historical backfill recovery update failed' using errcode = '40001';
  end if;
  return true;
end;
$$;

revoke all on function public.recover_legacy_historical_backfill_59bf7114(uuid) from public, anon, authenticated;
grant execute on function public.recover_legacy_historical_backfill_59bf7114(uuid) to service_role;
