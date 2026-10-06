create table if not exists public.mcp_external_mutation_audit(
 execution_id uuid primary key, organization_id uuid not null, provider text not null, operation text not null,
 controlled_target text not null, mutation_object_type text not null, created_external_id text not null,
 rollback_external_id text not null, create_verified boolean not null, rollback_verified boolean not null,
 net_provider_configuration_mutation boolean not null, audit_correlation_id text not null, idempotency_key text not null,
 executed_by uuid, executed_at timestamptz not null default now(), evidence jsonb not null default '{}'::jsonb,
 check(provider='shopify'), check(operation='controlled_webhook_create_delete_proof'),
 check(created_external_id=rollback_external_id), check(create_verified), check(rollback_verified),
 check(not net_provider_configuration_mutation), unique(organization_id,idempotency_key)
);
alter table public.mcp_external_mutation_audit enable row level security;
revoke all on table public.mcp_external_mutation_audit from anon, authenticated;
grant select, insert on table public.mcp_external_mutation_audit to service_role;;
