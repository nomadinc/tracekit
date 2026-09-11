alter table public.commerce_order_lines
  alter column id set default gen_random_uuid();
