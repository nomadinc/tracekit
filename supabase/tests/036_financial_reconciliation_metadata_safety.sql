begin;

select plan(20);

select is(public.financial_reconciliation_metadata_is_safe('{}'::jsonb), true, 'empty object is safe');
select is(public.financial_reconciliation_metadata_is_safe('[]'::jsonb), true, 'empty array is safe');
select is(public.financial_reconciliation_metadata_is_safe('{"summary":{"match":"exact"}}'::jsonb), true, 'nested objects are safe');
select is(public.financial_reconciliation_metadata_is_safe('[[["reference"]]]'::jsonb), true, 'nested arrays are safe');
select is(public.financial_reconciliation_metadata_is_safe('[{"reference":"order-1"}]'::jsonb), true, 'objects inside arrays are safe');
select is(public.financial_reconciliation_metadata_is_safe('{"references":["order-1"]}'::jsonb), true, 'arrays inside objects are safe');
select is(public.financial_reconciliation_metadata_is_safe('null'::jsonb), true, 'JSON null is safe');
select is(public.financial_reconciliation_metadata_is_safe('"plain reference"'::jsonb), true, 'safe scalar string is safe');
select is(public.financial_reconciliation_metadata_is_safe('42'::jsonb), true, 'number is safe');
select is(public.financial_reconciliation_metadata_is_safe('true'::jsonb), true, 'boolean is safe');

with recursive nested(depth, value) as (
  values (0, '{}'::jsonb)
  union all
  select depth + 1, jsonb_build_object('child', value)
  from nested
  where depth < 40
)
select is(public.financial_reconciliation_metadata_is_safe(value), true, 'deeply nested safe metadata is accepted within boundary')
from nested
where depth = 40;

select is(public.financial_reconciliation_metadata_is_safe('{"password":"redacted"}'::jsonb), false, 'prohibited top-level key is rejected');
select is(public.financial_reconciliation_metadata_is_safe('{"safe":{"items":[{"client_secret":"redacted"}]}}'::jsonb), false, 'prohibited deeply nested key is rejected');
select is(public.financial_reconciliation_metadata_is_safe('"person@example.com"'::jsonb), false, 'email-like scalar value is rejected');
select is(public.financial_reconciliation_metadata_is_safe('{"authorization_value":"Bearer abc.def.ghi"}'::jsonb), false, 'authorization key and bearer value are rejected');
select is(public.financial_reconciliation_metadata_is_safe('{"contact":{"phone":"555-0100"}}'::jsonb), false, 'sensitive identifier key is rejected');
select is(public.financial_reconciliation_metadata_is_safe('{"payment":{"card_number":"4111111111111111","bank_account":"123"}}'::jsonb), false, 'card and bank fields are rejected');
select is(public.financial_reconciliation_metadata_is_safe('{"safe":"reference","items":[{"status":"ok"},{"payload":{"value":1}}]}'::jsonb), false, 'mixed structure is unsafe when any descendant is unsafe');

with recursive nested(depth, value) as (
  values (0, '{}'::jsonb)
  union all
  select depth + 1, jsonb_build_object('child', value)
  from nested
  where depth < 64
)
select is(public.financial_reconciliation_metadata_is_safe(value), false, 'metadata at the maximum traversal depth is rejected')
from nested
where depth = 64;

select is(
  public.financial_reconciliation_metadata_is_safe(to_jsonb(repeat('x', 70000))),
  false,
  'oversized metadata is rejected'
);

select * from finish();
rollback;
