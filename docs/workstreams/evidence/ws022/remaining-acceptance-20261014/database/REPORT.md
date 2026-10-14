# WS-022 fresh disposable database acceptance — 2026-10-14

Tested application commit: `88f7411457b988e83e51fbc9bf7b4b5b76002fe7`.
No source, test, migration, or test-expectation edits were made by this executor.
This is fresh execution evidence, distinct from inherited WS-024 results. The executor is not the independent application reviewer.

## Results

- Authoritative harness: PASS, migration ledger converged through `20261014034517` (`ws001_dispute_source_currency_contract`), including historical M15 fixture prerequisites and RPC/RLS/ACL assertions.
- Focused real-database API file: 4 passed, 0 failed, 0 skipped (`api-integration.log`).
- Full API suite with the same real disposable database: 1,115 passed, 0 failed, 0 skipped (`api-full.log`).

Exact case identifiers in `api/src/tkid-event-persistence.integration.test.ts`:
1. `real SDK-compatible journey_started follows the Worker claim/persistence pipeline against the actual schema`
2. `evidence-only interruption resumes the same event without another reservation`
3. `Stage-1 event types share the same explicit persistence mapper`
4. `an event without its matching evidence fails closed`

## Environment and commands

Dedicated containers created for this task only:
- `ws022-remaining-db-20261014`, Supabase Postgres `17.6.1.143`, host loopback port 56822.
- `ws022-remaining-storage-20261014`, official Storage API `v1.62.5`, authentic platform storage-schema prerequisite initialization.
- `ws022-remaining-rest-20261014`, official PostgREST `v14.14`, host loopback port 56821.

Supabase CLI `2.109.1`; PostgreSQL server `17.6`.
The bare Postgres image provides auth/platform roles but not storage tables. Official Storage API initialized those prerequisites; no synthetic platform replacement table was created. Only local disposable role/schema setup was performed. Existing local workstream databases and containers were not altered.

From repository root:
```
TRACEKIT_MIGRATION_TEST_DB_URL=<dedicated-local-disposable-url> TRACEKIT_MIGRATION_TEST_DISPOSABLE=1 bash scripts/test-m15-authoritative-migration-chain.sh
```
The unchanged harness resets through `20261001061138`, installs `supabase/tests/fixtures/m15_stem_labs_workspace_prerequisites.sql`, applies the authoritative remaining migration chain, and verifies convergence and security assertions. Successful output: `attempt-6-migration-chain.log`.

From `api` with `TKID_DATABASE_INTEGRATION_URL=http://127.0.0.1:56820` and an ephemeral generated service-role test JWT in process environment:
```
node --import tsx --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/tkid-event-persistence.integration.test.ts
npm test
```
`run-integration.redacted.py` is a publication copy of the orchestration script; the disposable local password is replaced with an environment reference and the original script SHA256 is recorded. A local HTTP forwarding adapter strips only the SDK `/rest/v1` prefix and forwards requests/responses to real PostgREST without mock responses. Secrets are generated in memory and not printed. The adapter exits with the script. The tests use synthetic fixture UUIDs; the entire database is discarded after execution.

## Exact failure ledger and disposition

Prerequisite failures were environment/setup failures, not application failures. Initial raw attempt logs 1–4 were overwritten before separate log preservation began; their exact diagnostic strings are recorded here and in the execution transcript. This evidence gap is disclosed rather than fabricating historical logs.

1. Sandbox local TCP denial: `connect: operation not permitted`. Resolved by approved local-only escalation.
2. Database initialization not yet complete: `failed to receive message (unexpected EOF)`. Resolved by readiness diagnosis; later direct SQL succeeded.
3. Transient local Docker/SASL connectivity: `failed SASL auth ... i/o timeout`. Resolved once database/network became responsive. No application changes.
4. Bare platform prerequisite missing: `relation "storage.buckets" does not exist (SQLSTATE 42P01)` at historical migration042. Resolved by official Storage API schema initialization.
5. First Storage API initialization: `permission denied for schema storage`. Resolved by dedicated local storage-role/schema grants in disposable DB; recreated only owned Storage container. Subsequent harness retry raced delayed storage initialization and failed at same missing storage table (`attempt-5-storage-prerequisite-missing.log`). Resolved by waiting for official `Started Successfully` readiness; attempt6 passed.
6. SDK URL shape mismatch: all four hook failures `PGRST125 Invalid path specified in request URL`, because direct PostgREST has no `/rest/v1` prefix (`attempt-7-api-path-prefix.log`). Resolved with transparent local forwarding adapter; unchanged focused and full API suites passed.

A read-only storage schema export from existing local WS-022 stack was considered as fallback during startup delays. It was not imported or used; official Storage API startup succeeded. No fresh results depend on that export.

## Cleanup and limits

Only the three owned disposable containers and their anonymous volumes were removed (`cleanup.log`). `post-cleanup-containers.txt` verifies no owned fixture containers remain; preexisting workstreams remain running. No production database, provider or financial write occurred. Test data never reached staging or production.

The four DB skips can be closed for this exact commit based on actual fresh execution. These tests do not certify broader WS-024 migration work, financial reporting, authenticated staging roles, or Meta activation. WS-001 financial certification and Meta hold remain unchanged.
