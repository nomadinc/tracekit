begin;

create index if not exists platform_orders_everflow_reconcile_email_time_idx
  on public.platform_orders (
    organization_id,
    lower(btrim(email)),
    order_ts
  )
  include (canonical_order_id, receipt_total, gross_amount)
  where canonical_order_id is not null and email is not null;

create index if not exists platform_orders_everflow_reconcile_tid_idx
  on public.platform_orders (organization_id, everflow_transaction_id)
  include (canonical_order_id)
  where canonical_order_id is not null and everflow_transaction_id is not null;

create index if not exists platform_orders_everflow_reconcile_transaction_idx
  on public.platform_orders (organization_id, transaction_id)
  include (canonical_order_id)
  where canonical_order_id is not null and transaction_id is not null;

commit;
