do $$
begin
  if to_regclass('public.platform_orders') is not null then
    alter table public.platform_orders
      add column if not exists commerce_reference text;

    create index if not exists platform_orders_platform_commerce_reference_idx
      on public.platform_orders (platform, commerce_reference)
      where commerce_reference is not null;
  end if;

  if to_regclass('public.payment_transactions') is not null then
    alter table public.payment_transactions
      add column if not exists commerce_reference text,
      add column if not exists external_record_id text,
      add column if not exists transaction_event_code text,
      add column if not exists transaction_initiated_at timestamptz,
      add column if not exists transaction_updated_at timestamptz;

    create index if not exists payment_transactions_platform_commerce_reference_idx
      on public.payment_transactions (platform, commerce_reference)
      where commerce_reference is not null;

    create index if not exists payment_transactions_paypal_event_code_idx
      on public.payment_transactions (platform, transaction_event_code)
      where transaction_event_code is not null;

    create unique index if not exists payment_transactions_platform_account_external_record_uidx
      on public.payment_transactions (platform, account_id, external_record_id);
  end if;
end $$;
