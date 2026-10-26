-- WS-030: Core Release 1.0 Edge Intelligence ingestion exclusion.
-- Forward-only security boundary. Do not run without independent Master authorization.
-- Historical Edge evidence is retained. Do not DROP functions or tables.
BEGIN;

-- Direct RPC entry is no longer available to application runtime roles.
REVOKE ALL ON FUNCTION public.ingest_edge_intelligence_v1(uuid, jsonb)
  FROM PUBLIC, anon, authenticated, authenticator, service_role;

-- Remove direct Edge writes from all application runtime roles, including service_role
-- (which has BYPASSRLS). Preserve SELECT grants for existing reporting consumers.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.edge_intelligence_current,
  public.edge_intelligence_ingest_credentials,
  public.edge_intelligence_journey_links,
  public.edge_intelligence_observations,
  public.edge_intelligence_service_credentials,
  public.edge_intelligence_tenant_bindings
  FROM PUBLIC, anon, authenticated, authenticator, service_role;

-- NOTE: postgres (table/function owner) and other privileged BYPASSRLS identities
-- retain owner-level authority. Never treat these REVOKEs as a complete barrier
-- against an owner-context SECURITY DEFINER wrapper or privileged direct SQL.
-- Independent owner/wrapper inventory and isolated role tests are release gates.
COMMIT;
