begin;

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.run_everflow_order_reconciliation_batch_v2(uuid,integer)'::regprocedure)
    into v_definition;
  v_definition := replace(v_definition, '''tight_email_window_minutes''', '''tight_window_minutes''');
  execute v_definition;
end;
$$;

commit;
