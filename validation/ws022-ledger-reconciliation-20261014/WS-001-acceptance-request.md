# WS-022 → WS-001: exact outstanding acceptance packet

28 unresolved historical entries. REVIEW request prepared only; not sent. No merge/deploy authorization.

Review each exact failure against the current runtime and retained schema. Supply the contract-authoritative correction or prove replacement behavior with bounded tests; keep auth/tenant boundaries, exact source identity, queue bounds, append-only mappings, currency partitioning and retry/redaction checks. Do not restore uncertified affiliate/source monetary sums. For missing migration filenames, map to the authoritative retained migration before changing test paths; do not recreate or renumber migrations to satisfy assertions. Include focused and full-suite evidence at the exact final commit. The four local TKID skips require a disposable database; previously accepted WS024 evidence remains scoped and is not revoked by this unconfigured run.

| Historical row position | Boundary | Exact test | Current evidence |
|---|---|---|---|
| 1 | ui | commerce API and runtime entrypoints remain present | tests/capability-regression.test.ts:1:3320 |
| 3 | ui | review workspace preserves the existing affiliate/source chargeback report | tests/chargeback-review-workspace.test.ts:1:1947 |
| 7 | ui | scheduled deep bound survives scheduler, queue, runtime, and worker | tests/commas-scheduled-deep-request-bound.test.ts:1:953 |
| 8 | ui | product mapping decisions are append-only, tenant-scoped, and expected-version guarded | tests/commerce-control-plane.test.ts:1:20385 |
| 9 | ui | normal imports preserve an explicit product mapping and historical order identity | tests/commerce-control-plane.test.ts:1:21933 |
| 10 | ui | tests/commerce-product-mapping-workflow.test.ts | tests/commerce-product-mapping-workflow.test.ts:1:1 |
| 15 | ui | affiliate endpoints use authenticated application routes | tests/everflow-affiliates-step3.test.ts:1:2485 |
| 16 | ui | conversion sync snapshots evidence before ingest and finalizes metrics afterward | tests/everflow-conversion-run-metrics.test.ts:1:1005 |
| 17 | ui | conversion sync uses durable runs, checkpoints, leases, and the Step 6 order resolver | tests/everflow-conversions-step7.test.ts:1:3911 |
| 18 | ui | email fallback is guarded by time and amount when amount is available | tests/everflow-order-linkage-step6.test.ts:1:792 |
| 19 | ui | email alone is never treated as deterministic transaction identity | tests/everflow-order-linkage-step6.test.ts:1:1249 |
| 20 | ui | Everflow has an isolated authenticated five-minute Vercel cron trigger | tests/everflow-scheduled-worker.test.ts:1:3055 |
| 21 | ui | Everflow conversion sync persists observable run metrics | tests/everflow-sync-metrics.test.ts:1:426 |
| 74 | ui | M17 live Everflow remediation derives only from authorized Connections experience | tests/m17-everflow-live-sync-remediation.test.ts:1:293 |
| 75 | ui | M17 live Everflow remediation reports exact connection identity | tests/m17-everflow-live-sync-remediation.test.ts:1:749 |
| 87 | ui | order reads split refund reconciliation into independent bounded Shopify requests | tests/shopify-refund-reconciliation.test.ts:1:345 |
| 88 | ui | Shopify M6 scheduler reuses the certified incremental runtime with bounded leases | tests/shopify-scheduled-worker.test.ts:1:358 |
| 89 | ui | account selection accepts many internal account IDs and never activates schedules | tests/meta-oauth-foundation.test.ts:1:6809 |
| 90 | ui | status presentation is tenant scoped and returns no credential material | tests/meta-oauth-foundation.test.ts:1:7447 |
| 91 | api | decision home links to dedicated refund and chargeback analysis routes | src/app-shell.test.ts:2:14228 |
| 92 | api | overlap idempotency migration keys lifecycle effects by logical payload | src/commas-dispute-webhook.test.ts:2:14863 |
| 93 | api | migration is additive, service-role-only, shadow-only, and leaves attribution credits untouched | src/commas-provider-attribution.test.ts:2:6416 |
| 94 | api | Evidence reconciliation remains service-role-only, exact-ORD-only, and credit-free | src/commas-provider-attribution.test.ts:2:8386 |
| 95 | api | src/commas-refund-created-runtime.test.ts | src/commas-refund-created-runtime.test.ts:1:1 |
| 96 | api | scheduled deep queue bounds are trusted and separate from operator bounds | src/continuous-commerce-cloudflare.test.ts:2:38304 |
| 97 | api | migration filenames are unique and numerically ordered | src/database-bootstrap.test.ts:2:8393 |
| 98 | api | migration codifies duplicate, out-of-order, stale-update, and poll convergence semantics | src/everflow-firehose.test.ts:2:17230 |
| 99 | api | worker consumer retries failures and never logs raw payloads | src/everflow-firehose.test.ts:2:19109 |
