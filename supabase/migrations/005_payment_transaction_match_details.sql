-- Store conservative PayPal-to-commerce reconciliation details.

do $$
begin
  if to_regclass('public.payment_transactions') is not null then
    alter table public.payment_transactions
      add column if not exists matched_order_id text,
      add column if not exists match_method text,
      add column if not exists match_reason text,
      add column if not exists match_candidate_count integer not null default 0;
  end if;
end
$$;
