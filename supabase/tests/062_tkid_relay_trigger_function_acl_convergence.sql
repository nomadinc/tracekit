begin;

select plan(19);

select has_function(
  'public',
  'erase_tkid_relay_on_journey_tombstone',
  array[]::text[],
  'Migration-055 tombstone trigger function exists'
);

select is(
  pg_get_userbyid(proowner),
  'postgres',
  'tombstone trigger function owner is preserved'
)
from pg_proc
where oid = 'public.erase_tkid_relay_on_journey_tombstone()'::regprocedure;

select is(
  pg_get_function_result('public.erase_tkid_relay_on_journey_tombstone()'::regprocedure),
  'trigger',
  'tombstone trigger function returns trigger'
);

select is(
  (select lanname from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = 'public.erase_tkid_relay_on_journey_tombstone()'::regprocedure),
  'plpgsql',
  'tombstone trigger function is plpgsql'
);

select is(
  (select prosecdef from pg_proc where oid = 'public.erase_tkid_relay_on_journey_tombstone()'::regprocedure),
  false,
  'tombstone trigger function remains SECURITY INVOKER'
);

select is(
  (select proconfig from pg_proc where oid = 'public.erase_tkid_relay_on_journey_tombstone()'::regprocedure),
  array['search_path=public, pg_temp']::text[],
  'tombstone trigger function search_path is preserved'
);

select ok(
  position('erase_tkid_relay_continuity' in pg_get_functiondef('public.erase_tkid_relay_on_journey_tombstone()'::regprocedure)) > 0,
  'tombstone trigger body still delegates to relay erasure'
);

select is(
  (select count(*)::integer from pg_trigger where not tgisinternal and tgname = 'tkid_relay_journey_erasure' and tgrelid = 'public.tkid_journeys'::regclass and tgfoid = 'public.erase_tkid_relay_on_journey_tombstone()'::regprocedure),
  1,
  'tombstone trigger dependency is preserved'
);

select is(
  (select (tgtype & 1) from pg_trigger where not tgisinternal and tgname = 'tkid_relay_journey_erasure' and tgrelid = 'public.tkid_journeys'::regclass),
  1,
  'tombstone trigger is row-level'
);

select is(
  (select (tgtype & 2) from pg_trigger where not tgisinternal and tgname = 'tkid_relay_journey_erasure' and tgrelid = 'public.tkid_journeys'::regclass),
  0,
  'tombstone trigger is AFTER, not BEFORE'
);

select ok(not has_function_privilege('public','public.erase_tkid_relay_on_journey_tombstone()','execute'),'PUBLIC cannot execute tombstone guard');
select ok(not has_function_privilege('anon','public.erase_tkid_relay_on_journey_tombstone()','execute'),'anon cannot execute tombstone guard');
select ok(not has_function_privilege('authenticated','public.erase_tkid_relay_on_journey_tombstone()','execute'),'authenticated cannot execute tombstone guard');
select ok(not has_function_privilege('service_role','public.erase_tkid_relay_on_journey_tombstone()','execute'),'service_role cannot directly execute tombstone guard');
select ok(has_function_privilege('postgres','public.erase_tkid_relay_on_journey_tombstone()','execute'),'owner retains tombstone guard execution');

select ok(has_function_privilege('service_role','public.erase_tkid_relay_continuity(uuid,uuid,timestamptz)','execute'),'relay erasure RPC remains service-role callable');
select ok(not has_function_privilege('public','public.erase_tkid_relay_continuity(uuid,uuid,timestamptz)','execute'),'relay erasure RPC remains browser denied');
select ok(not has_function_privilege('anon','public.erase_tkid_relay_continuity(uuid,uuid,timestamptz)','execute'),'anon remains denied on relay erasure RPC');
select ok(not has_function_privilege('authenticated','public.erase_tkid_relay_continuity(uuid,uuid,timestamptz)','execute'),'authenticated remains denied on relay erasure RPC');

select * from finish();
rollback;
