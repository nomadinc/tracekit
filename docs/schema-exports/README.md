# TraceKit Schema Exports

These files preserve schema-only evidence required to reconstruct Migration Zero. They contain no customer rows, credentials, tokens, or application secrets.

## Current evidence

The `platform_orders_*` CSV files were exported from the authoritative hosted Supabase `public` schema on 2026-08-02. They support `supabase/migrations/000_tracekit_legacy_baseline.sql` and record columns, constraints, indexes, and table grants. Additional verified hosted facts are:

- sequence `public.platform_orders_id_seq`, owned by `public.platform_orders.id`;
- RLS disabled and not forced;
- no policies;
- no triggers.

The hosted project identifier is intentionally omitted. These exports are metadata only and must be reviewed for row data and secret patterns before commit.

## Required next exports

Migration replay requires authoritative exports for:

- `public.integration_import_jobs` (current blocker at migration 011);
- `public.conversions` (required unconditionally by migration 033 and later);
- `public.integrations_settings` (required unconditionally by migration 037);
- `public.integrations_credentials` if the legacy connector configuration is intended to exist in a fresh local product database.

For each table, save results as `<table>_columns.csv`, `<table>_constraints.csv`, `<table>_indexes.csv`, and `<table>_grants.csv`. Also retain sequence, RLS/policy, trigger, and dependency results using similarly explicit filenames.

## Read-only extraction queries

Replace only the value in the `target` CTE. These queries inspect metadata and do not read application rows.

### Columns

```sql
with target(schema_name, table_name) as (
  values ('public'::text, 'integration_import_jobs'::text)
)
select
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_schema,
  c.udt_name,
  c.is_nullable,
  c.column_default,
  c.is_identity,
  c.identity_generation,
  c.is_generated,
  c.generation_expression,
  c.collation_schema,
  c.collation_name
from information_schema.columns c
join target t on t.schema_name = c.table_schema and t.table_name = c.table_name
order by c.ordinal_position;
```

### Constraints

```sql
with target(schema_name, table_name) as (
  values ('public'::text, 'integration_import_jobs'::text)
)
select
  con.conname as constraint_name,
  con.contype as constraint_type,
  pg_get_constraintdef(con.oid, true) as definition
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
join target t on t.schema_name = nsp.nspname and t.table_name = rel.relname
order by con.conname;
```

### Indexes

```sql
with target(schema_name, table_name) as (
  values ('public'::text, 'integration_import_jobs'::text)
)
select i.indexname, i.indexdef
from pg_indexes i
join target t on t.schema_name = i.schemaname and t.table_name = i.tablename
order by i.indexname;
```

### Sequences and ownership

```sql
with target(schema_name, table_name) as (
  values ('public'::text, 'integration_import_jobs'::text)
)
select
  ns.nspname as sequence_schema,
  seq.relname as sequence_name,
  pg_get_userbyid(seq.relowner) as sequence_owner,
  ps.data_type,
  ps.start_value,
  ps.minimum_value,
  ps.maximum_value,
  ps.increment,
  ps.cycle_option,
  dep_ns.nspname as owned_by_schema,
  dep_table.relname as owned_by_table,
  dep_col.attname as owned_by_column
from pg_class seq
join pg_namespace ns on ns.oid = seq.relnamespace
left join pg_sequences ps on ps.schemaname = ns.nspname and ps.sequencename = seq.relname
left join pg_depend dep on dep.objid = seq.oid and dep.deptype in ('a', 'i')
left join pg_class dep_table on dep_table.oid = dep.refobjid
left join pg_namespace dep_ns on dep_ns.oid = dep_table.relnamespace
left join pg_attribute dep_col on dep_col.attrelid = dep.refobjid and dep_col.attnum = dep.refobjsubid
join target t on t.schema_name = dep_ns.nspname and t.table_name = dep_table.relname
where seq.relkind = 'S'
order by ns.nspname, seq.relname;
```

### RLS and policies

```sql
with target(schema_name, table_name) as (
  values ('public'::text, 'integration_import_jobs'::text)
)
select n.nspname, c.relname, c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join target t on t.schema_name = n.nspname and t.table_name = c.relname;

with target(schema_name, table_name) as (
  values ('public'::text, 'integration_import_jobs'::text)
)
select p.schemaname, p.tablename, p.policyname, p.permissive, p.roles,
       p.cmd, p.qual, p.with_check
from pg_policies p
join target t on t.schema_name = p.schemaname and t.table_name = p.tablename
order by p.policyname;
```

### Table, sequence, and function grants

```sql
with target(schema_name, table_name) as (
  values ('public'::text, 'integration_import_jobs'::text)
)
select g.grantee, g.privilege_type, g.is_grantable
from information_schema.role_table_grants g
join target t on t.schema_name = g.table_schema and t.table_name = g.table_name
order by g.grantee, g.privilege_type;

select *
from information_schema.role_usage_grants
where object_schema = 'public'
order by object_name, grantee, privilege_type;
```

### Triggers and trigger functions

```sql
with target(schema_name, table_name) as (
  values ('public'::text, 'integration_import_jobs'::text)
)
select
  trg.tgname as trigger_name,
  pg_get_triggerdef(trg.oid, true) as trigger_definition,
  proc_ns.nspname as function_schema,
  proc.proname as function_name,
  pg_get_functiondef(proc.oid) as function_definition
from pg_trigger trg
join pg_class rel on rel.oid = trg.tgrelid
join pg_namespace rel_ns on rel_ns.oid = rel.relnamespace
join pg_proc proc on proc.oid = trg.tgfoid
join pg_namespace proc_ns on proc_ns.oid = proc.pronamespace
join target t on t.schema_name = rel_ns.nspname and t.table_name = rel.relname
where not trg.tgisinternal
order by trg.tgname;
```

### Dependent views and functions

```sql
with target as (
  select 'public.integration_import_jobs'::regclass as relation_oid
)
select distinct
  dependent_ns.nspname as dependent_schema,
  dependent_class.relname as dependent_object,
  dependent_class.relkind,
  pg_get_viewdef(dependent_class.oid, true) as view_definition
from pg_depend dependency
join target on target.relation_oid = dependency.refobjid
join pg_rewrite rewrite on rewrite.oid = dependency.objid
join pg_class dependent_class on dependent_class.oid = rewrite.ev_class
join pg_namespace dependent_ns on dependent_ns.oid = dependent_class.relnamespace
order by dependent_schema, dependent_object;

select n.nspname as function_schema,
       p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where pg_get_functiondef(p.oid) ilike '%integration_import_jobs%'
order by n.nspname, p.proname;
```

Repeat the queries for each required table. Do not export table rows.
