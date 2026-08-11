create or replace function public.get_database_quiescence_state(
  p_long_transaction_seconds integer default 30
)
returns table (
  observed_at timestamptz,
  active_transactions bigint,
  idle_in_transaction_sessions bigint,
  long_running_transactions bigint,
  blocked_sessions bigint,
  blocking_sessions bigint,
  access_exclusive_locks bigint,
  is_quiescent boolean
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_observed_at timestamptz := pg_catalog.clock_timestamp();
begin
  if p_long_transaction_seconds is null
     or p_long_transaction_seconds < 1
     or p_long_transaction_seconds > 3600 then
    raise exception using
      errcode = '22023',
      message = 'long transaction threshold must be between 1 and 3600 seconds';
  end if;

  return query
  with sessions as (
    select
      activity.pid,
      activity.state,
      activity.xact_start,
      pg_catalog.pg_blocking_pids(activity.pid) as blocker_pids
    from pg_catalog.pg_stat_activity as activity
    where activity.datname = pg_catalog.current_database()
      and activity.backend_type = 'client backend'
      and activity.pid <> pg_catalog.pg_backend_pid()
  ),
  session_counts as (
    select
      count(*) filter (
        where state = 'active'
          and xact_start is not null
      )::bigint as active_transactions,
      count(*) filter (
        where state in ('idle in transaction', 'idle in transaction (aborted)')
      )::bigint as idle_in_transaction_sessions,
      count(*) filter (
        where xact_start is not null
          and xact_start <= v_observed_at
            - pg_catalog.make_interval(secs => p_long_transaction_seconds)
      )::bigint as long_running_transactions,
      count(*) filter (
        where pg_catalog.cardinality(blocker_pids) > 0
      )::bigint as blocked_sessions
    from sessions
  ),
  blocker_counts as (
    select count(distinct blocker_pid)::bigint as blocking_sessions
    from sessions
    cross join lateral pg_catalog.unnest(blocker_pids) as blocker_pid
    where blocker_pid <> pg_catalog.pg_backend_pid()
  ),
  exclusive_lock_counts as (
    select count(*)::bigint as access_exclusive_locks
    from pg_catalog.pg_locks as locks
    where locks.database = (
        select database.oid
        from pg_catalog.pg_database as database
        where database.datname = pg_catalog.current_database()
      )
      and locks.pid <> pg_catalog.pg_backend_pid()
      and locks.mode = 'AccessExclusiveLock'
  )
  select
    v_observed_at,
    session_counts.active_transactions,
    session_counts.idle_in_transaction_sessions,
    session_counts.long_running_transactions,
    session_counts.blocked_sessions,
    blocker_counts.blocking_sessions,
    exclusive_lock_counts.access_exclusive_locks,
    session_counts.active_transactions = 0
      and session_counts.idle_in_transaction_sessions = 0
      and session_counts.long_running_transactions = 0
      and session_counts.blocked_sessions = 0
      and blocker_counts.blocking_sessions = 0
      and exclusive_lock_counts.access_exclusive_locks = 0
  from session_counts
  cross join blocker_counts
  cross join exclusive_lock_counts;
end;
$$;

alter function public.get_database_quiescence_state(integer) owner to postgres;

revoke all on function public.get_database_quiescence_state(integer) from public;
revoke all on function public.get_database_quiescence_state(integer) from anon;
revoke all on function public.get_database_quiescence_state(integer) from authenticated;
grant execute on function public.get_database_quiescence_state(integer) to service_role;

comment on function public.get_database_quiescence_state(integer) is
  'Service-only aggregate PostgreSQL quiescence telemetry. Database-level state only; excludes Queue, Connector Runtime, project health, and migration-ledger checks.';
