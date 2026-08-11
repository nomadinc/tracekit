begin;

select plan(31);

select has_function(
  'public',
  'insert_wowsuite_refund_events',
  array['jsonb'],
  'refund ingestion function exists'
);

select is(
  prosecdef,
  true,
  'refund ingestion function is security definer'
)
from pg_proc
where oid = 'public.insert_wowsuite_refund_events(jsonb)'::regprocedure;

select is(
  pg_get_userbyid(proowner),
  'postgres',
  'refund ingestion function is owned by postgres'
)
from pg_proc
where oid = 'public.insert_wowsuite_refund_events(jsonb)'::regprocedure;

select is(
  proconfig,
  array['search_path=public, pg_temp']::text[],
  'refund ingestion function has a fixed search path'
)
from pg_proc
where oid = 'public.insert_wowsuite_refund_events(jsonb)'::regprocedure;

select is(has_function_privilege('public', 'public.insert_wowsuite_refund_events(jsonb)', 'EXECUTE'), false, 'PUBLIC cannot execute refund ingestion');
select is(has_function_privilege('anon', 'public.insert_wowsuite_refund_events(jsonb)', 'EXECUTE'), false, 'anon cannot execute refund ingestion');
select is(has_function_privilege('authenticated', 'public.insert_wowsuite_refund_events(jsonb)', 'EXECUTE'), false, 'authenticated cannot execute refund ingestion');
select is(has_function_privilege('service_role', 'public.insert_wowsuite_refund_events(jsonb)', 'EXECUTE'), true, 'service role can execute refund ingestion');

select has_function(
  'public',
  'insert_chargeback_ledger_events',
  array['jsonb'],
  'chargeback ingestion function exists'
);

select is(
  prosecdef,
  true,
  'chargeback ingestion function is security definer'
)
from pg_proc
where oid = 'public.insert_chargeback_ledger_events(jsonb)'::regprocedure;

select is(
  pg_get_userbyid(proowner),
  'postgres',
  'chargeback ingestion function is owned by postgres'
)
from pg_proc
where oid = 'public.insert_chargeback_ledger_events(jsonb)'::regprocedure;

select is(
  proconfig,
  array['search_path=public, pg_temp']::text[],
  'chargeback ingestion function has a fixed search path'
)
from pg_proc
where oid = 'public.insert_chargeback_ledger_events(jsonb)'::regprocedure;

select is(has_function_privilege('public', 'public.insert_chargeback_ledger_events(jsonb)', 'EXECUTE'), false, 'PUBLIC cannot execute chargeback ingestion');
select is(has_function_privilege('anon', 'public.insert_chargeback_ledger_events(jsonb)', 'EXECUTE'), false, 'anon cannot execute chargeback ingestion');
select is(has_function_privilege('authenticated', 'public.insert_chargeback_ledger_events(jsonb)', 'EXECUTE'), false, 'authenticated cannot execute chargeback ingestion');
select is(has_function_privilege('service_role', 'public.insert_chargeback_ledger_events(jsonb)', 'EXECUTE'), true, 'service role can execute chargeback ingestion');

select is(
  (select count(*) from pg_constraint where conrelid = 'public.conversions'::regclass and conname = 'conversions_ledger_type_check'),
  1::bigint,
  'one canonical conversions ledger type check exists'
);

select lives_ok($sql$
  insert into public.conversions (transaction_id, status, ledger_type, platform, workspace_id)
  select 'batch1-ledger-type-' || ledger_type, 'synthetic', ledger_type, 'synthetic', 'batch1-test'
  from unnest(array[
    'sale', 'refund', 'chargeback', 'chargeback_fee',
    'chargeback_reversal', 'chargeback_fee_reversal',
    'processor_fee', 'bank_fee', 'shipping_cost', 'tax', 'cogs',
    'affiliate_payout', 'ad_spend', 'reversal', 'adjustment'
  ]) as ledger_type
$sql$, 'every legacy and chargeback ledger type is accepted');

select is(
  (select count(*) from public.conversions where workspace_id = 'batch1-test'),
  15::bigint,
  'all fifteen canonical ledger types persisted'
);

select throws_ok(
  $sql$insert into public.conversions (transaction_id, status, ledger_type, platform, workspace_id) values ('batch1-invalid-ledger-type', 'synthetic', 'unsupported_type', 'synthetic', 'batch1-test')$sql$,
  '23514',
  null,
  'unsupported ledger type is rejected'
);

select lives_ok($sql$
  select * from public.insert_chargeback_ledger_events('[{
    "workspace_id":"batch1-test","ledger_type":"chargeback_reversal",
    "transaction_id":"batch1-chargeback-reversal","processor_account_id":"processor-test",
    "source_event_id":"event-reversal","amount":"10.00","platform":"synthetic","status":"synthetic",
    "occurred_at":"2026-08-11T00:00:00Z"
  }]'::jsonb)
$sql$, 'chargeback reversal passes through the ingestion RPC');

select is(
  (select count(*) from public.conversions where workspace_id = 'batch1-test' and ledger_type = 'chargeback_reversal'),
  2::bigint,
  'direct and RPC chargeback reversal rows persisted'
);

select lives_ok($sql$
  select * from public.insert_chargeback_ledger_events('[{
    "workspace_id":"batch1-test","ledger_type":"chargeback_fee_reversal",
    "transaction_id":"batch1-chargeback-fee-reversal","processor_account_id":"processor-test",
    "source_event_id":"event-fee-reversal","amount":"2.00","platform":"synthetic","status":"synthetic",
    "occurred_at":"2026-08-11T00:00:00Z"
  }]'::jsonb)
$sql$, 'chargeback fee reversal passes through the ingestion RPC');

select is(
  (select count(*) from public.conversions where workspace_id = 'batch1-test' and ledger_type = 'chargeback_fee_reversal'),
  2::bigint,
  'direct and RPC chargeback fee reversal rows persisted'
);

set local role anon;
select throws_ok($sql$select * from public.insert_wowsuite_refund_events('[]'::jsonb)$sql$, '42501', null, 'anon execution of refund ingestion is denied');
reset role;

set local role authenticated;
select throws_ok($sql$select * from public.insert_wowsuite_refund_events('[]'::jsonb)$sql$, '42501', null, 'authenticated execution of refund ingestion is denied');
reset role;

set local role anon;
select throws_ok($sql$select * from public.insert_chargeback_ledger_events('[]'::jsonb)$sql$, '42501', null, 'anon execution of chargeback ingestion is denied');
reset role;

set local role authenticated;
select throws_ok($sql$select * from public.insert_chargeback_ledger_events('[]'::jsonb)$sql$, '42501', null, 'authenticated execution of chargeback ingestion is denied');
reset role;

set local role service_role;
select lives_ok($sql$select * from public.insert_wowsuite_refund_events('[]'::jsonb)$sql$, 'service role executes refund ingestion');
select lives_ok($sql$select * from public.insert_chargeback_ledger_events('[]'::jsonb)$sql$, 'service role executes chargeback ingestion');
reset role;

select ok(
  pg_get_constraintdef(oid) like '%chargeback_reversal%' and pg_get_constraintdef(oid) like '%chargeback_fee_reversal%',
  'canonical constraint includes both chargeback reversal types'
)
from pg_constraint
where conrelid = 'public.conversions'::regclass
  and conname = 'conversions_ledger_type_check';

select * from finish();
rollback;
