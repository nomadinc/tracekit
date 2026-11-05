# WS-021 Production Demo Access and API Repair

Status: PARTIAL PASS — isolated financial UI correction prepared; customer enrollment and legacy Orders scope remain blocked. Production V1 HOLD.

## Source and production identity

- Inspected production source and exact parent: `57eaec27b4b5022ec5ba5e81c0cdcb3182c150f3`.
- Production Vercel deployment: `dpl_AkSdKkdhnSPWn1kdK7fE8GQMAAuv`, main, production, `app.trace-kit.io`.
- Immutable hostname: `tracekit-3sw8ute1r-tracekit.vercel.app`.
- Isolated repair branch: `ws021/demo-access-api-repair`; no push, merge or deployment performed.
- Verification date: 2026-11-05 UTC. Existing signed-in administrator used Admin Client View; this is not independent customer-login certification.

## Financial Reconciliation: proven root cause

The deployed client hardcodes `WORKSPACE_ID = "default"` into report GET, filter GET and decision POST. The existing scoped gateway correctly rejects a conflicting tenant hint before Core transport. This is a translated authorization/resource 404, not a missing Next.js route.

The existing `/api/financial-reconciliation` handler calls `/v1/financial-reconciliation` through `scopedCoreGet` and `projectCoreCustomerRead`. Read authorization requires BOTH `financials.view` and `orders.view_financials`. Decisions require `financials.reconcile` and `orders.view_financials`. The gateway injects the authenticated canonical organization as `workspace_id`; decisions also receive the authenticated actor. None of these controls change.

The repair removes all browser-supplied workspace hints from this page. Filters, report requests and authorized decisions let the server select scope. No calculation, upstream route, server authorization, credential or database change is required for this defect.

Live evidence on the exact production deployment:

| Request | UTC timestamp | Request ID | Result |
| --- | --- | --- | --- |
| GET /api/financial-reconciliation?limit=1 | 2026-11-05T06:01:35.508Z | dtfnm-1793858495508-55947d7149d6 | 200, canonical organization scope |
| GET /api/financial-reconciliation?workspace_id=default&limit=1 | 2026-11-05T06:02:50.315Z | fvjx7-1793858570315-62280f4ab56a | 404, generic resource-unavailable response |

Both clients' Financial Health pages reproduced the 404. Direct authenticated report GET without the hint succeeds for both scoped clients. Stem Labs' September 2026 report contains four refunds totaling -182.47000000000003 USD ($182.47 magnitude); four require review and lack attribution. This verifies returned report evidence, not complete accounting reconciliation. NH Discounts returns an empty report. No missing data is represented as invented financial totals by this correction. Tests preserve genuine zero, partial evidence, unavailable status and sensitive-field redaction.

The upstream Core route is operational. Its deployment-specific origin, full Worker version and physical/effective database credential role were NOT established by these browser responses or request logs. They remain UNKNOWN; no historical credential safety or staging/production pairing is inferred. No environment variables were read or modified for this repair.

## NH Discounts: independent customer access

Read-only production database inspection verified:

| Object | Identifier | Status |
| --- | --- | --- |
| NH Discounts organization | ab757103-4ad9-4fd8-a3f1-3f5adaee9b03 | active |
| Owning client account | 26a6eabb-2ddc-4b0d-8bf2-ce61c2ca700f | active |
| Memberships for organization OR owning account | none | no rows, not merely inactive rows |
| Business Contexts for organization | none | no rows |
| Invitations targeting organization/account | none | no rows |

The audit's missing membership is confirmed. Evidence does not establish why enrollment was omitted or prove a revocation/provider failure. Administrator client viewing does not create an independent customer membership.

Smallest proposed operator correction, NOT executed:

1. Identify and approve the real NH customer application-user/verified email and intended existing customer role. Both are currently UNKNOWN; do not substitute an administrator or fabricate a member.
2. Approve an organization-scoped membership for that identity, limited to the existing owning account and canonical NH organization above. Preserve intended read-only and financial permission decisions; no blanket role escalation.
3. Approve an owned NH Business Context and explicit membership/context access using the existing supported onboarding path. Do not repurpose another tenant's context or use `default` as a security scope.
4. Independently verify customer login, refresh, organization selection, revocation and foreign-tenant denial. Record the exact authorized records and scope before any production write.

No membership, invitation, account, context, permissions or RLS changes were made.

## Orders transport / WS-020 and WS-001 handoff

`/api/customer-orders` requires `orders.view` and routes to the scoped Core read model. Canonical organization/workspace scope is enforced by the server; financial amounts are removed unless the required financial permissions are present. Retained regressions exercise scope, permissions and order-model behavior.

Production read-only aggregate evidence:

| Client | Canonical organization | Rows and stored workspace |
| --- | --- | --- |
| Stem Labs | 8f6bb14b-2126-49b8-bfdb-c60edbc3549b | 115: 56 next29 + 59 Shopify, canonical workspace |
| NH Discounts | ab757103-4ad9-4fd8-a3f1-3f5adaee9b03 | 8,193: 8,188 WowBoost + 5 PayPal, workspace `default` |

`listCustomerOrders` filters both workspace_id and organization_id to the canonical organization. NH's legacy workspace does not match; the legitimate scoped API returns `{ok:true,orders:[],next_offset:null}` in NH Admin Client View. This is separate from the Financial Reconciliation browser-hint defect. Do not fix it by accepting `default`, dropping tenant filters or widening customer permissions.

WS-020/WS-001 action: select a reviewed tenant-safe legacy read-model compatibility or data-normalization correction preserving the NH organization boundary; independently test customer-role results, financial redaction and pagination. WS-020's existing Orders error-to-empty UI finding/patch remains separate and was not overwritten or silently integrated. No 29Next ingestion changes were made.

Actual customer-role access remains NOT CERTIFIED. Management SQL and administrator client view are diagnostic evidence only. An approved customer identity/session is required for native acceptance.

## Validation and reproducibility

From the repository root, install the locked UI dependencies:

```sh
npm --prefix ui ci --ignore-scripts
node --import ./ui/node_modules/tsx/dist/loader.mjs --test ui/tests/ws021-financial-reconciliation-scope.test.ts ui/tests/ws020-scoped-core-gateway.test.ts ui/tests/ws020-order-read-model.test.ts
node --import ./ui/node_modules/tsx/dist/loader.mjs --test api/src/financial-reconciliation.test.ts api/src/ws020-customer-orders.test.ts
cd ui
./node_modules/.bin/tsc --noEmit -p tsconfig.application.json
./node_modules/.bin/next lint --file 'app/(app)/dashboard/financial-reconciliation/financial-reconciliation-client.tsx' --file tests/ws021-financial-reconciliation-scope.test.ts
npm run build
```

- Focused UI/gateway/order tests: 15 PASS, zero failures. Original page's default-workspace request reproduces 404 with zero Core calls for BOTH canonical clients; corrected actual page query returns 200 through the synthetic gateway and receives canonical server scope.
- API financial and customer-order tests: 25 PASS, zero failures.
- Application TypeScript: PASS, zero diagnostics.
- Focused lint: PASS, no warnings/errors in changed files.
- Full Next.js production build: PASS, exit 0. Logs attached to the immutable handoff package. Existing WorkOS Edge warnings, three unrelated hook dependency warnings and chart prerender size warnings remain. Build ran without application credentials, using only existing network proxy/trusted CA settings for Next font retrieval; TLS validation remained enabled. No environment files were supplied.
- No live financial decision POST was sent. Mutation and redaction checks use synthetic local sessions and stub transports.
- Expired Admin Client View messaging: no independently reproduced defect; unchanged.

## Deployment and rollback plan — NOT execution authorization

1. WS-022 reviews the exact minimal patch and tests. Confirm all unrelated accepted protections remain unchanged.
2. Reconcile current production HEAD before integration. If it advanced beyond the inspected parent, integrate only the runtime page change and tests into a reviewed candidate; rerun checks. Do not replace current production with an older full tree.
3. Before any deployment, accountable Vercel/Core custodians attest the candidate's existing production-only WorkOS, Core and database targets and credential authority, without displaying values. This task did not close historical credential custody. No staging variables or shared credential fallback are introduced by this patch.
4. Obtain separate authorization for production release. Publish/build only after reviewing automatic deployment behavior; no push was performed here.
5. Verify exact new deployment/source identity. In authorized client view and then approved independent customer sessions, confirm report calls omit browser scope and succeed only with financial permissions; foreign/default scope remains denied. Test NH Orders only after its separate reviewed correction.
6. Roll back only the application deployment to the recorded prior deployment if approved and needed; no database rollback, credential restoration, RLS change or shared scheduler disablement is part of this correction. Prior deployment restores the known financial UI defect, so monitor/report that limitation.

Remaining gates: exact NH principal/role and enrollment authorization; NH Orders compatibility correction; independent customer sessions and financial permission acceptance; WS-022 review; deployment-bound credential/target attestation; separate production deployment approval. Both demo clients are NOT yet certified end-to-end. Production V1 remains HOLD.
