-- Forward ownership boundary for Commas refunds.
-- Before activation, embedded transactions[].refunds[] remains the economic source.
-- At/after activation, refund.created owns NEW refund economics; transaction-page observations remain reconciliation evidence only.
-- This avoids unsafe hashid-vs-numeric refund-ID matching across provider surfaces.

create table public.commerce_refund_forward_epochs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connection_id uuid not null,
  provider_account_id uuid not null,
  provider text not null check (provider = 'commas'),
  policy_version text not null check (policy_version = 'commas-refund-created-seller-cost-v1'),
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,connection_id,provider_account_id,policy_version),
  foreign key (organization_id,connection_id,provider_account_id)
    references public.commerce_provider_accounts(organization_id,connection_id,id)
);

alter table public.commerce_refund_forward_epochs enable row level security;
revoke all on public.commerce_refund_forward_epochs from public,anon,authenticated,authenticator;
grant select,insert,update on public.commerce_refund_forward_epochs to service_role;

create or replace function public.commas_refund_transaction_page_economic_owner_v1(
  p_organization_id uuid,p_connection_id uuid,p_provider_account_id uuid,p_refund_created_at timestamptz
) returns boolean
language sql security invoker stable set search_path=public,pg_temp as $$
  select not exists (
    select 1 from public.commerce_refund_forward_epochs e
    where e.organization_id=p_organization_id
      and e.connection_id=p_connection_id
      and e.provider_account_id=p_provider_account_id
      and e.policy_version='commas-refund-created-seller-cost-v1'
      and e.activated_at is not null
      and p_refund_created_at >= e.activated_at
  );
$$;
revoke all on function public.commas_refund_transaction_page_economic_owner_v1(uuid,uuid,uuid,timestamptz) from public,anon,authenticated,authenticator;
grant execute on function public.commas_refund_transaction_page_economic_owner_v1(uuid,uuid,uuid,timestamptz) to service_role;

comment on table public.commerce_refund_forward_epochs is 'Audited ownership boundary: refund.created owns Commas refund economics at/after activated_at; transaction pages remain reconciliation evidence.';
comment on function public.commas_refund_transaction_page_economic_owner_v1(uuid,uuid,uuid,timestamptz) is 'Fail-closed ownership decision that prevents cross-surface duplicate refund economics without equating webhook hashid and transaction numeric refund IDs.';
