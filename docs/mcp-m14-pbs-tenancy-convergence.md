# PBS tenancy convergence — M14 prerequisite

## Decision
Push Button System (PBS) is operationally owned by Accufy. Historical TraceKit-scoped PBS identities were created before commerce tenancy convergence. WS-016-M5 migrated the active Commas connection from TraceKit to Accufy and revoked the old TraceKit connection, but the PBS canonical/workspace graph remained TraceKit-scoped.

M14 MUST NOT cross organization boundaries to compensate. Converge the canonical/current PBS tenancy first.

## Fixed identities
- historical TraceKit org: `5f1de64a-1b37-40bb-81c8-32197eda0b41`
- historical TraceKit account: `39d895f9-71ac-44d3-ac33-6e9043f6267e`
- Accufy org: `8b5a93d2-23d2-4feb-8a1b-c775d4e7aae0`
- Accufy account: `0fcdf5ad-e7f4-460d-b9c8-457806e8c531`
- PBS business context: `push-button-system-5f1de64a` (preserve ID)
- PBS canonical offer: `b842611c-9918-40ac-9241-d542a8c6f8b4` (preserve ID)
- historical Commas connection: `ea1c2313-6120-4692-84c5-ec3562e7dcf6` (preserve as revoked provenance)
- historical provider account: `0369c701-717f-4c34-b230-8341bcdb7e65`
- active Accufy Commas connection: `8f56afa7-efc2-40d0-9a1f-c991f364c252`
- active Accufy provider account: `995e96b8-5e21-4d23-b2b2-7f87163003a1`
- PBS TKID source: `ae61827d-1503-4304-b187-9989390ab8d3`
- PBS TKID public source: `tksrc_pushbutton_prod_v1`
- PBS TKID origin: `66fe24db-452e-4da1-baa7-973709ab8089`

## Evidence-preservation rule
Do not rewrite historical provider evidence merely because tenancy later converged. Rows that record observations through the revoked TraceKit Commas connection retain their original connection/provider-account/source identifiers and organization provenance. The WS-016-M5 migration link remains the bridge to the active Accufy connection.

Canonical/current ownership records may be converged only where their contract represents present ownership rather than immutable source evidence.

## Mandatory preflight
Executable SQL MUST abort unless the target database proves all of:
1. Both exact organizations/accounts exist and are active.
2. PBS context exists exactly once under the historical TraceKit scope with the expected name/metadata.
3. PBS canonical offer exists exactly once with the expected context and fixed ID.
4. Expected offer-step graph exists without conflicting duplicate identities.
5. Historical Commas connection is revoked and named Accufy.
6. Active Accufy Commas connection is connected and carries `tenancy_migration=WS-016-M5` plus the exact `migrated_from_connection_id`.
7. Active Accufy provider account exists.
8. PBS TKID source/origin identities, if present, match the exact historical fixed identities.
9. No conflicting Accufy-owned PBS context/canonical offer already exists.
10. Every FK/reference table containing actual PBS rows is inventoried before mutation.

If any condition differs, fail closed with no mutation.

## Current environment warning
The Supabase connector currently available to this workstream contains the historical TraceKit/Accufy Commas connection records and old-connection evidence, but returns zero PBS `tracekit_business_contexts` rows. The live Production server nevertheless authorizes `push-button-system-5f1de64a` through `/api/session/business-context`.

Therefore the connected Supabase project is not yet proven to be the authoritative Production identity/catalog database. DO NOT apply a PBS ownership migration through this connector until the runtime database project is positively identified and the mandatory preflight passes there.

## Observed historical old-connection evidence in the currently connected DB
These are provenance records and are not candidates for blind rewriting:
- commerce_evidence_records: 6
- commerce_order_lines: 6
- commerce_provider_accounts: 1
- commerce_provider_credentials: 1
- commerce_provider_products: 3
- commerce_source_mappings: 6
- commerce_sync_runs: 2
- commerce_sync_schedules: 1
- conversions: 12
- person_source_identities: 10
- platform_orders: 6

## Intended convergence boundary
Preserve deterministic IDs. Move/rebind only canonical/current PBS ownership and authorization records after target-DB preflight. Update composite organization/account FK participants atomically in dependency order. Preserve historical source evidence and the revoked old connection.

After convergence, the expected runtime path is:
PBS context -> Accufy organization -> active Accufy Commas connection -> governed credential -> M14 prepare/confirm/execute lifecycle.

## Acceptance
- server session selecting PBS resolves Accufy as the authoritative organization;
- read-only M14 readiness sees exactly one connected Commas connection and one active credential;
- no historical evidence identifiers are lost or overwritten;
- no cross-org lookup exception is added to M14;
- all FK constraints valid after commit;
- audit event records the convergence correlation and fixed identities.
