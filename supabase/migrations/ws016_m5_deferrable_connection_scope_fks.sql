-- WS-016 M5 tenancy canonicalization
--
-- TraceKit's canonical model uses Organization-scoped composite foreign keys to
-- prevent cross-tenant relationships. Those constraints must remain enforced,
-- but an existing graph cannot move atomically between Organizations when each
-- composite FK is NOT DEFERRABLE.
--
-- Make every multi-column FK containing organization_id transaction-deferrable.
-- They remain INITIALLY IMMEDIATE, so ordinary application transactions retain
-- immediate FK enforcement. Only an explicit migration transaction using
-- SET CONSTRAINTS ... DEFERRED may postpone validation until transaction end.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT
      n.nspname AS schema_name,
      c.relname AS table_name,
      con.conname AS constraint_name
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN unnest(con.conkey) AS key(attnum) ON true
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = key.attnum
    WHERE con.contype = 'f'
      AND n.nspname = 'public'
      AND array_length(con.conkey, 1) > 1
      AND con.condeferrable = false
    GROUP BY n.nspname, c.relname, con.conname
    HAVING bool_or(a.attname = 'organization_id')
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER CONSTRAINT %I DEFERRABLE INITIALLY IMMEDIATE',
      r.schema_name,
      r.table_name,
      r.constraint_name
    );
  END LOOP;
END $$;
