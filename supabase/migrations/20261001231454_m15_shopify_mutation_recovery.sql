create table if not exists public.mcp_shopify_mutation_recovery (
  recovery_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.tracekit_organizations(id),
  intent_id uuid not null references public.mcp_action_intents(intent_id) on delete restrict,
  plan_identity text not null,
  shop_domain text not null,
  callback_url text not null,
  topic text not null check(topic='APP_UNINSTALLED'),
  state text not null check(state in ('prepared','created','rollback_verified')),
  created_external_id text,
  created_verified boolean not null default false,
  rollback_verified boolean not null default false,
  audit_correlation_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,intent_id),
  check((state='prepared' and created_external_id is null and not created_verified and not rollback_verified)
     or (state='created' and created_external_id is not null and created_verified and not rollback_verified)
     or (state='rollback_verified' and created_external_id is not null and created_verified and rollback_verified))
);
alter table public.mcp_shopify_mutation_recovery enable row level security;
revoke all on table public.mcp_shopify_mutation_recovery from public,anon,authenticated,authenticator;
grant select,insert,update on table public.mcp_shopify_mutation_recovery to service_role;

alter table public.mcp_action_intents drop constraint if exists mcp_action_intents_operation_check;
alter table public.mcp_action_intents add constraint mcp_action_intents_operation_check check(operation in ('inspect_evidence','commas.webhook_test_delivery','shopify.controlled_webhook_create_delete_proof'));
alter table public.mcp_action_intents drop constraint if exists mcp_action_intents_target_shape_check;
alter table public.mcp_action_intents add constraint mcp_action_intents_target_shape_check check(
 (operation='inspect_evidence' and customer_id is not null)
 or
 (operation='commas.webhook_test_delivery' and target_kind='commas_webhook_subscription' and target is not null and customer_id is null and journey_id is null)
 or
 (operation='shopify.controlled_webhook_create_delete_proof' and target_kind='shopify_webhook_subscription' and target is not null and customer_id is null and journey_id is null)
);
