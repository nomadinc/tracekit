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

-- Effective privilege verification, including inherited grants. Any failure aborts
-- this transaction and prevents a false-success containment migration.
DO $ws030$
DECLARE
  role_name text;
  edge_table text;
  edge_function oid := 'public.ingest_edge_intelligence_v1(uuid,jsonb)'::regprocedure;
  privileged_wrapper record;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','authenticator','service_role'] LOOP
    IF has_function_privilege(role_name, edge_function, 'EXECUTE') THEN
      RAISE EXCEPTION 'WS030 effective RPC EXECUTE persists for %', role_name;
    END IF;
    FOREACH edge_table IN ARRAY ARRAY[
      'edge_intelligence_current','edge_intelligence_ingest_credentials',
      'edge_intelligence_journey_links','edge_intelligence_observations',
      'edge_intelligence_service_credentials','edge_intelligence_tenant_bindings'
    ] LOOP
      IF has_table_privilege(role_name, 'public.' || edge_table,
          'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'WS030 effective Edge table write privilege persists for % on %', role_name, edge_table;
      END IF;
    END LOOP;
  END LOOP;

  -- An owner-context or SECURITY DEFINER wrapper can bypass application grants.
  -- Refuse to commit while any non-Edge function definition references the
  -- ingestion RPC or protected Edge tables under elevated function authority.
  FOR privileged_wrapper IN
    SELECT n.nspname AS schema_name, p.proname AS function_name
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.prosecdef
      AND p.oid <> edge_function
      AND n.nspname NOT IN ('pg_catalog','information_schema')
      AND (
        pg_get_functiondef(p.oid) ILIKE '%ingest_edge_intelligence_v1%'
        OR pg_get_functiondef(p.oid) ILIKE '%edge_intelligence_observations%'
        OR pg_get_functiondef(p.oid) ILIKE '%edge_intelligence_current%'
        OR pg_get_functiondef(p.oid) ILIKE '%edge_intelligence_journey_links%'
        OR pg_get_functiondef(p.oid) ILIKE '%edge_intelligence_tenant_bindings%'
      )
  LOOP
    RAISE EXCEPTION 'WS030 privileged Edge wrapper requires independent review: %.%',
      privileged_wrapper.schema_name, privileged_wrapper.function_name;
  END LOOP;
END
$ws030$;

COMMIT;
