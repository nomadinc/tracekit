begin;

select plan(24);

select has_function(
  'public',
  'get_database_quiescence_state',
  array['integer'],
  'database quiescence telemetry function exists'
);

select is(
  pg_catalog.pg_get_userbyid(proowner),
  'postgres',
  'quiescence telemetry is owned by postgres'
)
from pg_catalog.pg_proc
where oid = 'public.get_database_quiescence_state(integer)'::regprocedure;

select is(
  prosecdef,
  true,
  'quiescence telemetry is security definer'
)
from pg_catalog.pg_proc
where oid = 'public.get_database_quiescence_state(integer)'::regprocedure;

select is(
  provolatile,
  'v',
  'quiescence telemetry is volatile'
)
from pg_catalog.pg_proc
where oid = 'public.get_database_quiescence_state(integer)'::regprocedure;

select is(
  proconfig,
  array['search_path=pg_catalog']::text[],
  'quiescence telemetry has a fixed trusted search path'
)
from pg_catalog.pg_proc
where oid = 'public.get_database_quiescence_state(integer)'::regprocedure;

select is(
  pg_catalog.pg_get_function_result('public.get_database_quiescence_state(integer)'::regprocedure),
  'TABLE(observed_at timestamp with time zone, active_transactions bigint, idle_in_transaction_sessions bigint, long_running_transactions bigint, blocked_sessions bigint, blocking_sessions bigint, access_exclusive_locks bigint, is_quiescent boolean)',
  'return schema is deterministic and aggregate-only'
);

select is(
  has_function_privilege('public', 'public.get_database_quiescence_state(integer)', 'EXECUTE'),
  false,
  'PUBLIC cannot execute quiescence telemetry'
);

select is(
  has_function_privilege('anon', 'public.get_database_quiescence_state(integer)', 'EXECUTE'),
  false,
  'anon cannot execute quiescence telemetry'
);

select is(
  has_function_privilege('authenticated', 'public.get_database_quiescence_state(integer)', 'EXECUTE'),
  false,
  'authenticated cannot execute quiescence telemetry'
);

select is(
  has_function_privilege('service_role', 'public.get_database_quiescence_state(integer)', 'EXECUTE'),
  true,
  'service role can execute quiescence telemetry'
);

select lives_ok(
  $sql$select * from public.get_database_quiescence_state(30)$sql$,
  'approved role function invocation succeeds'
);

select throws_ok(
  $sql$select * from public.get_database_quiescence_state(null)$sql$,
  '22023',
  'long transaction threshold must be between 1 and 3600 seconds',
  'null threshold is rejected'
);

select throws_ok(
  $sql$select * from public.get_database_quiescence_state(0)$sql$,
  '22023',
  'long transaction threshold must be between 1 and 3600 seconds',
  'threshold below lower bound is rejected'
);

select throws_ok(
  $sql$select * from public.get_database_quiescence_state(3601)$sql$,
  '22023',
  'long transaction threshold must be between 1 and 3600 seconds',
  'threshold above upper bound is rejected'
);

select lives_ok(
  $sql$select * from public.get_database_quiescence_state(1)$sql$,
  'lower threshold boundary is accepted'
);

select lives_ok(
  $sql$select * from public.get_database_quiescence_state(3600)$sql$,
  'upper threshold boundary is accepted'
);

select is(
  (select count(*) from public.get_database_quiescence_state(30)),
  1::bigint,
  'quiescence telemetry returns exactly one row'
);

select ok(
  (select observed_at is not null from public.get_database_quiescence_state(30)),
  'observation timestamp is always present'
);

select ok(
  (select active_transactions >= 0 from public.get_database_quiescence_state(30)),
  'active transaction count is bounded numeric state'
);

select ok(
  (select idle_in_transaction_sessions >= 0 from public.get_database_quiescence_state(30)),
  'idle transaction count is bounded numeric state'
);

select ok(
  (select long_running_transactions >= 0 from public.get_database_quiescence_state(30)),
  'long transaction count is bounded numeric state'
);

select ok(
  (select blocked_sessions >= 0 and blocking_sessions >= 0 from public.get_database_quiescence_state(30)),
  'blocking state is bounded numeric state'
);

select ok(
  (select access_exclusive_locks >= 0 from public.get_database_quiescence_state(30)),
  'DDL-risk lock state is bounded numeric state'
);

select is(
  (
    select is_quiescent = (
      active_transactions = 0
      and idle_in_transaction_sessions = 0
      and long_running_transactions = 0
      and blocked_sessions = 0
      and blocking_sessions = 0
      and access_exclusive_locks = 0
    )
    from public.get_database_quiescence_state(30)
  ),
  true,
  'database-only quiescence boolean exactly matches returned aggregates'
);

select * from finish();
rollback;
