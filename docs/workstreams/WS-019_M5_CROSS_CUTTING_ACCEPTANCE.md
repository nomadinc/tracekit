# WS-019 M5 — Cross-Cutting Controlled-Production Acceptance

Baseline: `main` @ `b8b3520a40ed29741891fda3c02a89a3007430af` (2026-10-04)

Status: **BLOCKED — controlled Shopify action remains certified; TraceKit Intelligence Production V1 is not production-ready.**

M3 and M4 are frozen PASS foundations. M5 adds no provider mutation and changes no runtime behavior.

## Release requirement assessment

| Requirement | Status | Evidence / limitation |
|---|---|---|
| authoritative_policy | PASS | `production-v1-policy.ts` freezes the provider/action matrix; unknown operations fail closed. |
| safe_disable_controls | PASS WITH DOCUMENTED LIMITATION | Evaluation, global mutation, provider-family, and exact-action controls exist and fail closed on disabled/invalid values. Repository tests exercise policy suppression. A live operator toggle drill is still required before final controlled-production acceptance. |
| capability_suppression | PASS | Shopify controlled proof is the only executable provider mutation. Commas is disabled; Everflow is read-only; unsupported/general mutations are unavailable. |
| permission_rbac | BLOCKED | Governed provider execution requires `actions.execute`, but M5 found no completed WS-017 release evidence covering all Intelligence UI/API lifecycle mutations. Work Item and Notification Next.js proxies do not resolve the authenticated application session or enforce user permissions at that boundary. |
| tenant_isolation | BLOCKED | M3 proves tenant-negative behavior for the governed Shopify action. It does not prove the Work Item/Notification UI/API path. Those proxies forward a server admin secret and client-supplied `workspace_id`; downstream tenant enforcement must be independently proven before release. |
| lifecycle_history_visibility | BLOCKED | Work Items expose durable activity/history in Operations, and M3 has durable action records. There is no proven customer-visible unified action lifecycle joining finding → intent → confirmation → authorization → execution → verification/rollback/replay. |
| notification_contract | BLOCKED | Notification Center supports current finding notifications plus read/dismiss/resolved state. The Production V1 contract also names awaiting approval, execution failure, verification failure, recurrence, and provider-health failure; repository evidence does not establish all of those event classes are durably delivered. External channels remain future. |
| operational_health | PASS WITH DOCUMENTED LIMITATION | M3 captured runtime telemetry and durable external-mutation audit; Production Intelligence runbook defines monitoring/alerts/recovery. External operational alert destination and a live Intelligence safe-disable drill remain required before final acceptance. |
| migration_convergence | PASS | Atomic confirmation migration identity was converged and M3 records the repaired/deployed production path before final replay certification. |
| regression_gates | PASS | User confirmed current regression state green. M3 also recorded no WS-019-specific regression against its baseline. |

## Security boundary requiring WS-017 acceptance

Current routes:

- `ui/app/api/work-items/route.ts`
- `ui/app/api/work-items/[...workItemPath]/route.ts`
- `ui/app/api/notifications/route.ts`
- `ui/app/api/notifications/[...notificationPath]/route.ts`

These routes use a server-side admin secret to call the API and currently do not call `resolveApplicationSession`, `requirePermission`, or `requireResourceScope`. They pass request query/body state, including `workspace_id`, downstream.

M5 does **not** claim this is exploitable. It establishes that the required tenant/RBAC release proof is absent at this boundary. Do not widen or redesign the boundary in WS-019; WS-017 must prove the downstream scope is authoritative or harden the proxy using the canonical identity/tenancy contract.

## Required evidence to unblock M5

1. WS-017 permission matrix for viewing findings/history, marking/dismissing notifications, and mutating Work Item workflow state.
2. Cross-tenant negative tests for Work Items and Notifications through the actual browser-facing routes.
3. Proof that caller-supplied `workspace_id` cannot expand the authenticated Organization/workspace scope.
4. Customer-visible governed-action lifecycle projection or an explicitly accepted limitation keeping action history operator-only for V1.
5. Notification proof for important finding, awaiting approval, execution failure, verification failure, recurrence, and provider-health failure.
6. Live safe-disable drill: disable exact Shopify action (or global Intelligence mutations), verify mutation tools/action exposure disappear or reject before provider access, then restore; no provider mutation is required for this drill.
7. Operational alert destination decision: configure/prove one or explicitly scope Production V1 to in-app Notification Center only.
8. Final acceptance manifest with all ten release requirements populated and no BLOCKED requirement.

## Production posture while blocked

- Shopify controlled proof: **PRODUCTION PROVEN**, but remains human-controlled and safe-disable governed.
- Commas test delivery: **ENGINEERING READY / NOT LIVE PROVEN**, disabled.
- Everflow remediation: **READ-ONLY FINDING**.
- General/autonomous provider mutation: **NOT SUPPORTED**.
- Production V1: **NOT READY**.
