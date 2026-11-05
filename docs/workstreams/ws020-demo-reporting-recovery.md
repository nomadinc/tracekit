# WS-020 Demo Reporting Recovery

Status: implemented for integration review; undeployed. Combined customer demo remains HOLD.

## Source and scope

- Branch: `ws020/demo-reporting-recovery`.
- Verified GitHub `main` / parent: `57eaec27b4b5022ec5ba5e81c0cdcb3182c150f3`.
- This source has not been independently matched to the running production deployment or the separately accepted offline staging candidate. Reconcile the bounded commit into the current authoritative integration worktree before release.
- No production data, ownership, RLS, grants, financial calculations, ingestion, schedules, credentials, or deployments changed.

## Implemented corrections

1. Orders list failures now render an explicit unavailable state instead of an empty list. Detail failures clear stale snapshots and surface an error; loading a different Order clears the prior detail.
2. Customer Explorer consumes the canonical opaque `next_cursor` / `has_more` contract through all pages. Search and tenant scope remain on every request; repeat filtering runs after pagination. Stable IDs are deduplicated; missing/repeated cursors and later-page failures reject the read rather than returning partial totals as complete.
3. Customer detail failures are handled and previous errors reset when loading a new list.
4. Customer-related Order links retain the full platform Order ID. Drawer parsing preserves IDs containing colons.
5. Order and Customer amount presentation preserves source currency and distinguishes missing/redacted/invalid values from genuine zero. Unqualified customer aggregate currency remains unavailable. No financial formula or source value was changed.
6. Customer and Order Journey reads consume every canonical event page, reject cursor cycles, and retain API errors rather than silently converting them into absent evidence.
7. Order relationships require exact retained platform identifiers, or an unambiguous provider-scoped order number. Timestamp proximity and substring matching no longer create relationships. Canonical events and unresolved attribution are not invented.
8. Orders explicitly returned under a conflicting workspace/organization are rejected rather than relabeled as the active tenant. Requests continue through the existing authenticated APIs.

## Changed files

- `ui/components/orders/order-workspace.tsx`
- `ui/components/customers/customer-workspace.tsx`
- `ui/lib/orders/production-repository.ts`
- `ui/lib/orders/types.ts`
- `ui/lib/customers/production-repository.ts`
- `ui/lib/customers/types.ts`
- `ui/lib/reporting/observed-money.ts`
- `ui/lib/reporting/order-relationship.ts`
- `ui/lib/reporting/journey-pages.ts`
- `ui/tests/ws020-reporting-recovery.test.ts`
- This report.

## Verification

- Focused UI/repository/security regression group: 51 PASS, 0 FAIL, 0 SKIP.
- Existing Core Customer Orders gates: 3 PASS, 0 FAIL, 0 SKIP. They verify both tenant predicates, unresolved evidence, deterministic pagination, read failure and GET-only routing.
- Next.js production build: PASS on the final candidate source. Existing WorkOS Edge API, hook-dependency, browser-data-age and prerender chart-dimension warnings remain.
- Standalone repository-wide TypeScript check: 62 test-file diagnostics on both untouched parent and candidate; normalized diagnostic sets match, with no new or resolved diagnostics. This is not a claim that the repository-wide typecheck passes.
- `git diff --check`: PASS.
- Full UI/API regression suites were not rerun; no full-regression claim is made.
- Test fixtures are local only. No demo/source data was fabricated in production.

Commands from `ui/`:

```sh
node --import tsx --test tests/ws020-reporting-recovery.test.ts tests/ws020-order-read-model.test.ts tests/ws020-scoped-core-gateway.test.ts tests/customer-repository.test.ts tests/order-repository.test.ts tests/mission-control-portfolio.test.ts tests/mission-control-repository.test.ts tests/m13-journey-analysis-pagination.test.ts tests/m13-server-customer-read-origin.test.ts tests/m13-direct-core-customer-read.test.ts
node --import ./node_modules/tsx/dist/loader.mjs --test ../api/src/ws020-customer-orders.test.ts
npm run build
```

## Live evidence and remaining dependencies

The preceding read-only audit established these observations; this implementation has not been deployed and those observations are not post-fix acceptance:

- Stem Labs: UI/API/database agree on 115 orders; 59 Shopify and 56 next29. Sample Order #1059 agrees at USD 87.29. Mission Control's scoped 89 orders total USD 7,552.07. Four retained September refunds are outside that period. Portfolio/Order Profit remains explicitly unavailable; populated historical `net_profit` columns alone do not qualify it.
- Customer Explorer displayed 50 of 106 Stem Labs people. The corrected adapter's 106-record, three-page fixture passes, including later-page search/filter and failure cases. Live post-release 106-customer verification is still required.
- NH Discounts: 8,193 existing organization-scoped WowBoost/PayPal records use workspace `default`; the canonical organization-workspace Orders API returns an empty result. No ownership or workspace rewrite was attempted. WS-001 must supply the reviewed read-model/scope resolution.
- NH Discounts next29 connection `92b02244-32b5-4ddf-aec4-fc7574848983`: no persisted next29 orders at audit time. Existing tenant-safe Orders pagination/unresolved-identity tests pass, but first live imported-row verification depends on WS-001.
- NH Discounts has no direct organization/owning-account customer membership in the audited join, and Mission Control has no accessible Business Context. The identity/context owner must establish the approved account and canonical context through the normal process.
- Neither organization workspace had canonical Journey rows/events in the audited tables. The UI pagination and relationship corrections cannot create the missing canonical read evidence; WS-001 must reconcile source/customer/order/conversion/attribution relationships without heuristics.
- Both clients' Financial Reconciliation pages returned API 404. The checked-out UI route and Core handler exist and remain permission/scoped. Deployed identity, permission resolution and upstream route compatibility must be established before fixing the runtime discrepancy. No financial API permission was weakened.
- The shared live TraceKit browser tab was claimed by another session during this implementation. It was left undisturbed. Customer-login, post-fix UI, foreign-tenant denial and independent Admin Client View certification remain pending on the final integrated/deployed candidate.

## Integration and acceptance

1. Review the single bounded commit and reconcile it with the current application/staging source, preserving newer restricted transports and authorization changes. Do not replace the current application with this parent snapshot.
2. Re-run the listed focused tests and build on the integrated commit.
3. Resolve the runtime Financial Reconciliation 404, NH account/context, and canonical read-model scope with their owners. Keep ingestion and historical ownership corrections outside this patch.
4. After release authorization, verify actual customer sessions for both organizations: complete Orders/Customers counts and navigation, currencies/unavailable values, redaction, server tenant denials, and independent Admin Client View.

Rollback for this UI-only change is reverting the bounded commit through the established release process. No data rollback, credential rotation or schedule change is required by this patch.
