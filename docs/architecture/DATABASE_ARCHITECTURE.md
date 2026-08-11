# TraceKit Database Architecture

Version: 1.0

Status: Approved Foundation Draft

## 1. Purpose

This document defines the product-data responsibilities, security boundaries, migration governance, and local bootstrap contract for TraceKit's PostgreSQL database. It is an engineering architecture document, not a complete physical schema.

## 2. Database Responsibilities

The database persists TraceKit identity and tenancy, normalized business objects, immutable evidence, financial and attribution ledgers, connector state, reconciliation decisions, audit history, and read-model inputs. It does not make connector payloads the product model or replace application authorization.

## 3. Supabase/Postgres Role

Supabase supplies managed PostgreSQL, local development tooling, migrations, and optional RLS defense in depth. PostgreSQL constraints protect structural integrity. Server application services enforce authenticated membership, capability, tenant, resource, sensitive-data, and financial-data scope before querying.

## 4. Product Objects versus Source-System Records

Offer, Customer, Order, Journey, Payment, Shipment, and Evidence are TraceKit product objects. Shopify, Everflow, payment-processor, advertising, carrier, and affiliate records are source observations mapped to those objects. Product types and repositories must not expose connector schemas directly.

## 5. Canonical IDs and Source Mappings

TraceKit objects use stable internal opaque IDs. Source-system identifiers belong in scoped mappings containing Organization ownership, source system, source account, source object type, external identifier, observation time, ingestion time, and provenance. An external identifier is never sufficient tenant authorization.

## 6. Tenant Ownership

Every tenant-owned record has immutable Organization ownership. Moving data between Organizations is a controlled migration, not a routine update. Browser-supplied tenant identifiers are never authorization, and cross-tenant denial must not disclose object existence.

## 7. Account, Agency, Organization, and Business Context

- Account is the commercial/administrative boundary: platform, Agency, or direct Client.
- Agency is an account whose authorized members may receive assignments to Client Organizations.
- Organization is the immutable business-data tenant.
- Business Context is an Offer/business inside the active Organization, not an authentication organization or report filter.

Authentication-provider organization membership does not replace TraceKit membership, Agency assignment, Organization authorization, or Business Context access.

## 8. Core Normalized Objects

The normalized foundation includes Organization, Brand, Offer, Product, Customer, Order, Order Item, Journey, Touchpoint, Identifier, Attribution Decision, Traffic Source, Campaign, Ad Set, Creative, Affiliate, Conversion, Payment, Processor Fee, Refund, Chargeback, Shipment, Shipping Charge, Shipping Cost, COGS Record, Financial Event, Connector, Connector Sync, Evidence Record, and Tracking Health Signal.

The first real-data slice should implement only the minimum relationships needed to prove one Organization, Offer, Customer, Order, Journey, payment, cost composition, profit result, and evidence chain.

## 9. Event and Ledger Architecture

Ledgers preserve financial, journey, attribution, connector, and evidence observations. Append-only events record what occurred; projections and snapshots provide efficient current-state reads. Corrections are represented as new events or audited reconciliation decisions rather than destructive history edits.

## 10. Evidence and Provenance

Evidence records retain source system, source account, source record reference, collection method, event time, ingestion time, content hash where useful, and relationships to normalized objects. Raw evidence requires stricter access and retention than derived explanations. TraceKit Intelligence builds on Evidence and never replaces it.

## 11. Financial Reconciliation

Financial values carry source, currency, calculation inputs, observed or expected status, and reconciliation state. Estimated, imported, matched, reconciled, disputed, and superseded states remain explicit. Processor captures, fees, refunds, chargebacks, shipping costs, and COGS remain independently inspectable.

## 12. Mutable Snapshots versus Append-Only Events

Mutable snapshots represent the latest operational state, such as a current Order projection. Append-only events preserve historical facts, imports, and decisions. A snapshot may be rebuilt from normalized inputs; evidence and financial decision history must not be silently overwritten.

## 13. Repository Read Models

Mission Control and Workspaces read through typed repository boundaries. Aggregated read models may be materialized when calculations are expensive, auditable, or latency-sensitive. Direct normalized-object lookups remain appropriate for bounded detail views. Repository results are tenant-scoped, permission-aware, serializable, and free of connector-specific payload shapes.

## 14. Identity and Tenancy Tables

Migration 038 introduces internal Users, Accounts, Agencies, Organizations, Roles, Memberships, permission overrides, Agency-client assignments, Business Context access, invitations, and audit events. WorkOS identifiers are external mappings, not TraceKit primary keys. Persistent Identity validation remains blocked until the complete migration chain can replay.

## 15. Sensitive Data Classification

- Restricted: credentials, session tokens, API keys, authentication secrets. These never enter fixtures or client payloads.
- Sensitive personal data: email, phone, addresses, and raw identifiers. Access requires explicit capability and auditability.
- Sensitive financial data: transaction, fee, profit, refund, and chargeback detail. Access requires financial capabilities.
- Operational metadata: connector status and import errors, subject to tenant scope and redaction.
- Public-safe metadata: schema definitions that contain no rows or secrets.

## 16. RLS and Application Authorization

Application authorization is mandatory even when RLS exists. RLS is defense in depth, not the only authorization layer. Each server request resolves authenticated User, active Membership, Account, Organization, capability, resource scope, and sensitive/financial requirements before data access.

## 17. Service-Role Boundary

Service-role access remains server-only. Browser code never receives service credentials and cannot call privileged proxies based solely on caller-controlled workspace or Organization values. Legacy proxies remain blocked from real-data mode until protected by the shared authorization gateway.

## 18. Connector Ingestion Boundary

Connectors write source observations through server-side ingestion services. Ingestion validates source account and Organization mapping, preserves provenance, uses idempotency keys, records sync status, and normalizes into product objects and ledgers. Connector credentials are never seed data.

## 19. Event Time versus Ingestion Time

Event time records when the source event occurred. Ingestion time records when TraceKit observed or stored it. Both are required for late arrivals, replay, attribution windows, reconciliation, freshness, and audit analysis.

## 20. Reconciliation State

Reconciliation state is explicit and attributable to inputs and decisions. Reprocessing must be idempotent. Manual decisions preserve actor, reason, time, prior state, resulting state, and supporting evidence.

## 21. Audit Logging

Audit events cover authentication, membership, invitation, permission, Organization switching, denied access, sensitive-data access, financial-data access, and administrative changes. Audit metadata is structured and redacted; it never stores passwords, tokens, credentials, or unnecessary raw identifiers.

## 22. Retention and Deletion

Retention must distinguish operational snapshots, immutable financial/audit obligations, raw evidence, personal data, and connector logs. Deletion workflows must respect tenant ownership, legal retention, referential integrity, and privacy requirements. Exact policies remain an open decision before beta.

## 23. Migration Governance

- Use unique, sequential, additive migration numbers.
- Never silently mutate an applied migration.
- Do not reuse migration numbers.
- Replay the complete chain locally before commit.
- Lint migrations and inspect resulting constraints, indexes, ownership, RLS, and grants.
- Require evidence for every Migration Zero object.
- Prefer forward fixes over destructive rollback of deployed migrations.
- Separate data backfills from schema changes when practical.
- Retain schema-only exports supporting baseline provenance.
- Document all material hosted/local differences.
- Review security changes independently.
- Perform a hosted dry run or reviewed plan before any remote application.

Migration Zero becomes effectively immutable after approval. Future corrections use new additive migrations.

## 24. Migration Zero / Legacy Baseline

`000_tracekit_legacy_baseline.sql` recreates only objects that predate tracked migration history. Its evidence-backed contents are the pre-001 `platform_orders` table and owned sequence, the pre-006 `integration_import_jobs` table, the pre-033 `conversions` ledger, and the pre-037 `integrations_settings` table. In every case, tracked migration-owned columns, constraints, and indexes remain excluded from Migration Zero.

### Legacy-object inventory

| Object | First prerequisite | Classification | Evidence/status |
|---|---:|---|---|
| `platform_orders` | 001 | LEGACY BASELINE REQUIRED | Authoritative hosted exports available; baseline implemented |
| `integration_import_jobs` | 006 guarded; 011 required | LEGACY BASELINE REQUIRED | Authoritative hosted exports available; baseline implemented |
| `conversions` | 033 required | LEGACY BASELINE REQUIRED | Authoritative hosted exports available; distinct legacy financial ledger baseline implemented |
| `integrations_credentials` | 004 guarded | OPTIONAL / CONDITIONALLY GUARDED | Used by runtime; authoritative export needed before deciding baseline ownership |
| `integrations_settings` | 037 required | LEGACY BASELINE REQUIRED | Authoritative hosted exports available; two-column pre-037 baseline implemented |
| `payment_transactions` | 001 | CREATED BY TRACKED MIGRATION | Later guarded/unguarded alterations are ordered after creation |
| `everflow_conversions` | 001 | CREATED BY TRACKED MIGRATION | Separate attribution-source table; not a substitute for `conversions` |
| Supabase auth/storage/realtime objects | bootstrap | GENERATED BY SUPABASE | Managed by local Supabase images |
| `pgcrypto` | 011 and others | EXTERNAL EXTENSION | Created conditionally by tracked migrations |

### Platform Orders provenance

| Category | Baseline ownership | Later tracked ownership | Intentional difference |
|---|---|---|---|
| Columns | 44 exported pre-001 columns | 001 adds 12; 008 adds `commerce_reference`; 014 adds `workspace_id`, `person_id` | None |
| Constraints | PK and unique `platform_order_id` | 014 adds `person_id` FK | None |
| Indexes | five explicit legacy indexes plus two constraint indexes | 001, 007, 008, 010, 014–016, 028, 034 add others | Migration 010 predicate differs from hosted `btrim` form; additive fix needed after review |
| Sequence | `platform_orders_id_seq`, owned by `platform_orders.id` | None identified | None |
| RLS/policies/triggers | RLS disabled; no policies; no triggers | None identified | None |
| Grants | Server role retained | Later identity security is migration 038-owned | Hosted broad anon/authenticated grants intentionally omitted |

For unresolved legacy tables, column, constraint, index, sequence, trigger, policy, and grant provenance matrices remain blocked until authoritative exports are supplied. Application usage is not accepted as proof of complete schema.

### Integration Import Jobs provenance

| Category | Baseline ownership | Later tracked ownership | Intentional difference |
|---|---|---|---|
| Columns | 20 columns through `last_error_at` | 006 adds `progress`; 011 adds 16 Connector Runtime fields | `retries` remains nullable because it predates 011's idempotent `NOT NULL` declaration |
| Constraints | Primary key on UUID `id` | None identified | None |
| Indexes | PK index and `(platform, created_at desc)` | 011 adds runtime lookup and updated indexes | None |
| Sequences | None | None | None |
| RLS/policies/triggers | RLS disabled; no policies; no triggers | None identified | None |
| Grants | Server role retained | None identified | Hosted broad anon/authenticated grants intentionally omitted |

### Conversions provenance

| Category | Baseline ownership | Later tracked ownership | Intentional difference |
|---|---|---|---|
| Columns | 38 legacy ledger columns through `connector_id` | 035 adds six processor/chargeback diagnostic fields | None |
| Constraints | UUID primary key and `conversions_ledger_type_check` | 035 converges the ledger-type CHECK to preserve all legacy values and add chargeback reversal labels | The hosted CHECK predates tracked migrations and is intentionally replaced during Batch 1 |
| Indexes | PK plus 17 exported legacy indexes | 033 adds WowSuite refund uniqueness; 034 adds financial-issue range; 035 adds three chargeback indexes; 036 adds two reconciliation indexes | Duplicate legacy order/transaction/TKID indexes preserved as exported evidence |
| Sequences | None | None | None |
| RLS/policies/triggers | RLS disabled; no policies; no triggers | None identified | None |
| Grants | Server role retained | 033 and 035 explicitly revoke direct browser-role execution on their ingestion RPCs and retain `service_role` | Hosted broad anon/authenticated grants are actively removed during Batch 1 |
| Dependencies | Hosted `everflow_vs_backend` view depends on the table | No tracked owner or definition | Not placed in Migration Zero because tracked replay does not require it and its definition was not exported |

### Migration 036 compatibility repair

The original `financial_reconciliation_metadata_is_safe(jsonb)` definition in
migration 036 used three top-level `UNION ALL` terms and referenced its recursive
CTE from both the object and array branches. PostgreSQL recursive-query grammar
permits one non-recursive term followed by one recursive term with one recursive
self-reference. Because set operations associate left-to-right, PostgreSQL
classified the second self-reference as part of the non-recursive side and
rejected the function before migration 036 could apply.

No pre-036 or post-036 additive migration can repair this fresh-bootstrap
failure: a helper created earlier would be replaced by the invalid `CREATE OR
REPLACE FUNCTION`, and a later migration can never execute. Under the repository
policy allowing correction of a proven unreplayable migration defect that cannot
be fixed additively, migration 036 was amended directly.

The corrected SQL retains one recursive reference and expands object and array
children inside a lateral subquery. It preserves nested object, nested array,
scalar-value, prohibited-key, and prohibited-value inspection. It strengthens
the original policy by rejecting metadata larger than 64 KiB and structures
that reach a depth of 64, bounding validation work instead of bypassing it.

Database-level pgTAP coverage in
`supabase/tests/036_financial_reconciliation_metadata_safety.sql` exercises safe
and unsafe scalars, objects, arrays, mixed nesting, sensitive keys and values,
deep input, and size/depth boundaries. The hosted deployed function definition
and hosted PostgreSQL version remain to be captured read-only before remote
migration planning. The known migration-010 index-predicate difference remains
unresolved and requires a future additive migration.

### Integrations Settings provenance

| Category | Baseline ownership | Migration 037 ownership | Intentional difference |
|---|---|---|---|
| Columns | `platform`, `updated_at` | `auto_import_enabled`, `auto_import_interval_minutes`, `auto_import_lookback_hours`, `last_run_at`, `last_success_at`, `last_error` | None |
| Constraints/indexes | Primary key on `platform` and its backing index | None | None |
| Sequences | None | None | None |
| RLS/policies/triggers | RLS disabled; no policies; no triggers | None | None |
| Grants | Server role retained | None | Hosted broad anon/authenticated grants intentionally omitted |

## 25. Local Bootstrap Process

1. Clone the repository.
2. Install Docker Desktop and the Supabase CLI.
3. Start Docker and confirm `docker info` succeeds.
4. Run `supabase start` from the repository root.
5. Allow Migration Zero and all tracked migrations to replay from zero.
6. Apply only reviewed, non-secret local seed data.
7. Run migration lint, database tests, and schema introspection.
8. Configure local application environment values.
9. Never use production credentials locally.

Troubleshooting:

- Docker unavailable: start Docker Desktop and verify daemon access.
- Stale containers: use `supabase stop`, then restart; remove only disposable local state.
- Replay failure: record the first failing statement and classify it before editing.
- Dirty local database: reset only the local project after confirming no needed local data exists.
- Missing schema export: stop and obtain read-only hosted metadata; do not infer a table.
- Port conflict: inspect `supabase/config.toml` and local listeners before changing ports.

## 26. Hosted-versus-Local Differences

| Difference | Classification |
|---|---|
| Legacy `platform_orders` anon/authenticated grants omitted locally | INTENTIONAL SECURITY DIFFERENCE |
| Migration-010 backfill-index predicate differs from hosted `btrim` predicate | ADDITIVE MIGRATION NEEDED after review |
| Remaining legacy objects absent locally | UNRESOLVED pending authoritative exports |

No difference should remain implicit.

## 27. Schema Export Process

Read-only metadata queries and file conventions live in `docs/schema-exports/README.md`. Exports may be committed only when they contain schema metadata, no row data, no credentials, no tokens, and no sensitive values. Each export records its date, environment classification, supported object, and migration purpose.

## 28. Testing and Validation

Database changes require a clean replay, migration list verification, lint, schema introspection, ownership/constraint/index checks, RLS and grant checks, secret scanning of exports, and the full relevant application test suites. Tests should assert semantics and ownership boundaries rather than brittle whole-file snapshots.

## 29. Open Database Decisions

- Authoritative pre-tracked definitions for the remaining legacy tables.
- Final RLS policies for normalized tenant data.
- Retention periods by data classification.
- Materialized read-model refresh strategy.
- Source mapping uniqueness across multi-account connectors.
- Encryption and key-management policy for connector credentials.
- Additive correction for the migration-010 predicate difference.

## 30. Future Data Phases

After reproducible bootstrap: validate Persistent Identity migration 038; complete server-side authorization; implement the normalized foundation; enable the smallest real-data vertical slice; add tenant-scoped Universal Search; then expose permission-propagating MCP resources. No live repositories are enabled by this foundation draft.

## Permanent Principles

- Every tenant-owned record has immutable Organization ownership.
- Browser-supplied tenant identifiers are never authorization.
- Product types do not expose connector schemas directly.
- Source-system identifiers are mappings, not primary product identity.
- Evidence provenance is preserved.
- Event time and ingestion time are distinct.
- Financial values carry reconciliation state.
- Mutable snapshots and append-only events have different responsibilities.
- Workspaces read through repository/read-model boundaries.
- Service-role access remains server-only.
- Application authorization is mandatory even when RLS exists.
- RLS is defense in depth, not the only authorization layer.
- Historical migrations are not rewritten casually after deployment.
- Migration Zero contains only pre-tracked prerequisites.
- Every fresh clone must be able to build the database from zero.
- No production secret or customer row belongs in schema fixtures.
- Schema differences between hosted and local must be explicit and documented.
