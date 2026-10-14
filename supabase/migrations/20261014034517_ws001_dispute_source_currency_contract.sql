-- Additive source-backed dispute currency contract. No existing values are rewritten.
alter table public.commerce_provider_disputes
 add column currency_source text,
 add column fee_currency text,
 add column fee_currency_source text;
alter table public.commerce_historical_disputes
 add column currency text,
 add column currency_source text,
 add column fee_currency text,
 add column fee_currency_source text;
comment on column public.commerce_provider_disputes.currency_source is 'Explicit normalized source-field provenance. NULL means currency is unverified; legacy currency alone must not be exposed as authoritative.';
comment on column public.commerce_provider_disputes.fee_currency is 'Nullable source-backed currency of descriptive dispute fee; never inherited from principal/account/provider.';
comment on column public.commerce_historical_disputes.currency is 'Nullable source-backed dispute principal currency. Approved legacy 12-column Resolution Center export has no currency field.';
comment on column public.commerce_historical_disputes.currency_source is 'Currency source-field provenance; absent source evidence stays NULL.';
comment on column public.commerce_historical_disputes.fee_currency is 'Nullable source-backed descriptive dispute fee currency; independent of principal and wallet loss.';
