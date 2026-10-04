-- Staging/runtime schema readiness contract.
-- Read-only RPC used by deployment diagnostics; it does not mutate business data.
create or replace function public.tracekit_runtime_schema_readiness_v1()
returns jsonb
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $$
  select jsonb_build_object(
    'ok',
      to_regclass('public.tracekit_organizations') is not null
      and to_regclass('public.tracekit_accounts') is not null
      and to_regclass('public.tracekit_memberships') is not null
      and to_regclass('public.edge_intelligence_observations') is not null
      and to_regclass('public.edge_intelligence_current') is not null
      and to_regclass('public.edge_intelligence_service_credentials') is not null
      and to_regclass('public.edge_intelligence_tenant_bindings') is not null
      and to_regprocedure('public.list_tracekit_active_organizations()') is not null
      and to_regprocedure('public.ensure_tracekit_platform_owner(uuid,text,text)') is not null
      and to_regprocedure('public.ingest_edge_intelligence_v1(uuid,jsonb)') is not null,
    'identity', jsonb_build_object(
      'organizations', to_regclass('public.tracekit_organizations') is not null,
      'accounts', to_regclass('public.tracekit_accounts') is not null,
      'memberships', to_regclass('public.tracekit_memberships') is not null,
      'organizationCatalogRpc', to_regprocedure('public.list_tracekit_active_organizations()') is not null,
      'platformOwnerBootstrapRpc', to_regprocedure('public.ensure_tracekit_platform_owner(uuid,text,text)') is not null
    ),
    'edgeIntelligence', jsonb_build_object(
      'observations', to_regclass('public.edge_intelligence_observations') is not null,
      'current', to_regclass('public.edge_intelligence_current') is not null,
      'serviceCredentials', to_regclass('public.edge_intelligence_service_credentials') is not null,
      'tenantBindings', to_regclass('public.edge_intelligence_tenant_bindings') is not null,
      'ingestRpc', to_regprocedure('public.ingest_edge_intelligence_v1(uuid,jsonb)') is not null
    )
  );
$$;
revoke all on function public.tracekit_runtime_schema_readiness_v1() from public,anon,authenticated;
grant execute on function public.tracekit_runtime_schema_readiness_v1() to service_role;
