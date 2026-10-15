# WS-022 Admin and consolidated live acceptance

Candidate and deployment: bcd856c39a5ab6dfbf6bdd8418afef78f931e5b6; dpl_6v7oRFdwYX3TbGpz5PwgsPQCUytF; Preview; https://tracekit-staging-50e8hokzy-tracekit.vercel.app . No application changes or redeployment in this pass. Both PR575 and PR576 remain draft.

## Live observations

| Case | Result and limit |
|---|---|
| Admin authentication | Existing platform-owner/platform account confirmed. Initial waiting callback failed, fresh preview authorization recovered without another password prompt. Cause unconfirmed; callback failure retained. |
| Admin persistence | Reload retained the explicit second-client support view and privileged chargeback list. |
| Role separation | Admin Control Center and four-client catalog available. Earlier ordinary client direct platform navigation denied404; one allowed workspace only. Support view retains Admin privileges and is not a substitute for ordinary-client tests. |
| Explicit scope | Entered first existing client support view, exited to platform catalog, selected second existing client. Banners and data changed accordingly. No membership/role changes. Normal support-view session/audit actions only. |
| Tenant denial in support view | First-client connection ID returned404 while second client selected. Earlier ordinary client own resource loaded and two distinct foreign resources404. Limited connection-resource proof, not all API coverage. |
| Privileged chargebacks | First client loaded empty portfolio; second loaded50 dispute rows. First detail loaded Lifecycle/Connected intelligence and currency unknown without guessedUSD; no financial/provider writes. |
| Detail selection | Rapid second→third row selection settled without error. Usability observation only; deliberately forced late/mismatched-response behavior covered by fresh synthetic tests, not forced in live browser. |
| Meta boundary | Ordinary client missing-permission denial retained; Admin setup visible, states SyncOff/no schedules. Connect/select/save not invoked. Provider inactivity or mutation denial not independently certified. Meta remains inactive/uncertified. |
| Customer workspace | FAIL: first allowed client unavailable for both ordinary client and Admin. Preview serverless /api/customers401 observed during Admin check. Proxy returns404 for session/permission/scope denial and forwards upstream non-success status;401 is consistent with upstream Core rejection. Exact credential/configuration cause unverified. No credential changes. |
| Orders / governed controls | Second-client Admin Orders shows No accessible Orders. Cannot certify usable live governed order controls from that screen. No mutation requests submitted. Permission/tenant/provider-no-call behavior is covered by fresh synthetic tests. |
| Logout/re-login | Earlier ordinary-client logout went to Staging, protected navigation required sign-in, fresh email-session re-login and reload persisted. Admin session remains available for diagnosis. |

Private identities, tenant/resource IDs, callback state/codes, cookies, headers, financial amounts and provider payloads are excluded from published artifacts. Raw runtime logs remain outside the package; only route/status metadata below is retained.

## Fresh exact-SHA checks

At unchanged bcd856c39a5ab6dfbf6bdd8418afef78f931e5b6, clean worktree:

- node scripts/run-tests.mjs chargeback-selected-detail.test.ts chargeback-investigation.test.ts chargeback-detail-currency-render.test.ts chargeback-detail-request.test.ts chargeback-currency-formatting.test.ts identity-authorization.test.ts meta-request-boundaries.test.ts meta-connection-ui.test.ts meta-oauth-foundation.test.ts ws020-provider-action-boundary.test.ts: ordinary36 + server-condition11 =47passed,0failed,0skipped.
- node scripts/run-tests.mjs m4-permission-tenant-audit-acceptance.test.ts m11-action-execution-permission.test.ts ws020-platform-catalog-boundary.test.ts ws020-ws021-integration-boundary.test.ts:16passed,0failed,0skipped.

Commands run from ui; logs included. Total fresh63/0/0. Prior exact-head lint0errors/9warnings, TypeScript0, contract4/0/0 and boundary51/0/0 remain separately dated. Full UI1462/0/0, build/clean install/tree/audits0 belong to b563049ae88622441498ee7efb111ba65b02bbf4; bcd differs only by ownership/provenance docs. No claim of fresh full-suite execution in this browser pass.

Fresh disposable-schema API1115/0/0 and four focused cases4/0/0 belong to88f7411457b988e83e51fbc9bf7b4b5b76002fe7, durable package4def7a82567f28db686e992a6ba72d688da2aca1. WS024 inherited migration evidence remains separately attributed. No database tests or cleanup rerun here.

## Independent source review

Separate lint_independent_review reviewer rechecked currentbcd source. Persisted platform membership/account+permission gates Admin; same-origin support-view actions require persisted admin.impersonate, active targetorg, signed user-bound expiring cookie and audit. Resolver revalidates selected org; connection queries bind thatorg. Chargeback list/detail require financials.view and orders.view_financials and bind org+ID. Approved currency evidence absent yieldsnull, formatter renders currency unknown; request generation and selected-ID guards reject late/mismatched detail responses. No new defect identified within these reviewed boundaries.

Reviewer explicitly limits conclusions: support view retains Admin privilege, rapid clicks do not prove forced races, SyncOff display does not certify provider inactivity/mutation denial, customer failure remains unresolved, affiliate exposure still formatsUSD and remains held pendingWS001. This is independent source review, not independent live browser acceptance or GitHub approval.

## Remaining blockers and owners

1. Core/customer integration and Staging configuration owners: diagnose upstream customer401 and restore allowed customer reads; verify Orders availability and then governed-action UI in non-mutating mode. Exact configuration cause unresolved; credential changes require separate authorization.
2. Authentication owner / WS022: investigate repeated delayed callback failure (client and Admin), despite fresh-flow recovery. SDK600second lifetime is only a hypothesis; no exact runtime error code captured.
3. WS022 acceptance: broader API tenant matrix and live forced-race scenarios remain uncertified; current resource-level evidence and synthetic proofs are explicitly limited. Provider/financial execution is outside scope and remains untested.
4. WS001 financial owner: affiliate/source monetary certification HOLD. Meta integration owner: inactive/uncertified. Release owner: ProductionV1 HOLD; no merge/production authorization.

Rollback: no application/configuration/credential changes in this pass. Evidence is additive. Exit support view using All Clients; sign out normally to clear session. Prior approved WorkOS Staging allowlist additions are retained; never remove preserved defaults/entries or alter production. Tooling rollback remains COVERAGE.md and reintroduces known dependency blockers; it is not release clearance.
