-- Restore Production schema drift for commerce_order_lines.id.
-- Staging and the 29Next persistence runtime expect database-generated UUIDs.
-- This changes only the default for future inserts; existing rows are untouched.

alter table public.commerce_order_lines
  alter column id set default gen_random_uuid();
