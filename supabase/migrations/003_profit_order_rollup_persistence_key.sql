-- Repair Profit Engine order-rollup persistence constraints.
-- Existing deployments may have created profit_order_rollups before the final
-- order-level upsert key was settled. Rebuild must be able to store one row per
-- workspace/order/connector/currency.

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel
      on rel.oid = con.conrelid
    join pg_namespace nsp
      on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'profit_order_rollups'
      and con.contype = 'u'
      and (
        select array_agg(
          att.attname::text
          order by key_cols.ordinality
        )
        from unnest(con.conkey) with ordinality
          as key_cols(attnum, ordinality)
        join pg_attribute att
          on att.attrelid = con.conrelid
         and att.attnum = key_cols.attnum
      ) <> array[
        'workspace_id',
        'order_id',
        'connector_id',
        'currency'
      ]::text[]
  loop
    execute format(
      'alter table public.profit_order_rollups drop constraint %I',
      constraint_name
    );
  end loop;
end
$$;

create unique index if not exists
  profit_order_rollups_workspace_order_connector_currency_uidx
on public.profit_order_rollups (
  workspace_id,
  order_id,
  connector_id,
  currency
);
