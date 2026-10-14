# WS-022 remaining regression remediation

Status: REVIEW. All previously failing configured UI/API checks pass in the local candidate. This is automated regression closure, not full Production V1 acceptance.

Branch: ws022/remaining-failure-remediation.
Code commit: e40bce7c844d57f96c67cb4156045d91d24096ea.
Parent: 044153e8 on the recovered dependency/tooling plus accepted PR570 integration. Main remains 57eaec27; separate PR569 is not integrated. No remote push, main merge, deployment, live OAuth, database or provider operation performed.

## Result

| Validation | Result |
|---|---|
| Complete UI, both configured groups | 1,452 passed, zero failed/skipped (1,405 + 47) |
| Complete API | 1,110 passed, zero failed, four skipped |
| Actual Meta route/service synthetic boundaries | Six passed, zero failed/skipped; included in full UI count |
| TypeScript on final commit | Zero diagnostics |
| Production build | PASS on the identical runtime tree before adding test-only boundary cases |
| Lint | Zero errors / nine existing warnings on the identical runtime tree |
| Whitespace | PASS |

The four local API skips require a disposable schema environment. Earlier independently accepted WS024 evidence remains scoped; this run does not claim database execution. UI/API dependencies reuse the prior clean installations with unchanged manifests and locks.

## Corrections

- Edge fixtures now iterate the canonical scenarios object rather than root metadata. All canonical payloads validate; version/tenant/routing negatives, unknown provider preservation and nested IP rejection now execute against real payload objects.
- Edge delivery assertions target the current service-credential plus tenant-binding trust model. Hash/active credential checks, validation, tenant binding rejection, organization from binding and response/log redaction checks remain. These source assertions are not a live tenancy certification.
- Queue boundary test uses the reviewed shared hard max of 1,000, accepts 1,000 and rejects 1,001; operator eight-page bounds remain. Scheduled worker checks preserve the tighter invocation ceiling and retries against actual consumed requests. No queue runtime bounds changed.
- Migration tests point to retained canonical timestamps and the deployable product-health convergence definition and review view, rather than quarantined superseded SQL. No migrations were renamed, recreated, applied or modified. Legacy numeric test retains uniqueness and exact expected versions while accounting for historical 082–088 renumbering; existing full-ledger tests cover canonical timestamps.
- Firehose logging test inspects console call arguments instead of forbidding legitimate payload reads anywhere in the worker branch. Retry and diagnostic metric assertions remain.
- Updated bounded cron concurrency, Shopify page sizing and quoted GraphQL timestamp contracts. Refund reader still proves three independently bounded requests, unchanged order watermark, correct financial cursors and no forced unbounded traversal.
- Updated Everflow metrics checks to actual awaited calls rather than import ordering, the canonical createdByCount variable and hash-based metrics finalizer. Preserved deterministic identity preference, amount/time limits and heuristic confidence below one. Thirty-minute no-amount window is tighter than the old six-hour assertion. No linkage runtime changed.
- M17 checks now target organization/connection-scoped repository reads and exact output identity instead of a removed loader implementation.
- Chargeback regression now explicitly requires the uncertified affiliate/source monetary panel to remain hidden, while preserving backend analysis. This corrects an obsolete requirement to restore the held legacy panel. It does NOT certify financial aggregation or waive its release hold.

## Missing Meta presentation and routes

Added a permission-gated Meta setup page, status GET and same-origin account-selection POST using existing organization-scoped Meta services. GET explicitly projects safe connection/account fields and excludes arbitrary metadata. POST validates internal UUID selections, limits count, rejects duplicate IDs and binds calls to authenticated session context; caller organization input has no authority. Both routes deny missing authentication, organization or connectors.manage and return generic errors with no-store responses.

The setup panel keeps selections separate by connection, displays external ID/currency/timezone/status, supports selection/save and exposes existing bounded OAuth entry. A dedicated Advertising card clearly labels connection preparation and sync off. Account selection does not create schedules or call provider APIs. Server page independently checks permission. The new UI is available only in this local candidate; Meta remains inactive and uncertified. No real account or credentials used.

Six tests bundle the actual handlers with synthetic session/service boundaries and test denial, origin, malformed inputs, field redaction, session binding, disabled schedules and sanitized errors. The final test bundles the actual Meta selection service against a synthetic repository to prove foreign connection/permission denial before writes. This is not live OAuth, deployed RLS or real Meta acceptance.

Applied the React skill checklist: server-side page/route authorization, immutable selection updates, AbortController cleanup, labeled checkbox controls, disabled controls while saving, generic errors and minimal serialized fields. No new dependency, CSS framework, credential, provider sync or campaign mutation introduced.

## Ledger and release limits

The prior 33 failing automated entries are remediated in this candidate. Historical release acceptance is preserved separately pending review of this change, especially the new Meta routes and service/tenant trust model. Do not count file-load recovery as only one newly executed assertion: full-suite totals increased because previously blocked child tests now run.

Open release gates remain: five high UI tooling package records from the braces advisory and ESLint peer compatibility; PR569 currency-contract integration; WS001 financial aggregation certification; real Meta certification before activation; authenticated combined staging/rollback and explicit release authorization. No risk waiver granted. Production V1 HOLD.
