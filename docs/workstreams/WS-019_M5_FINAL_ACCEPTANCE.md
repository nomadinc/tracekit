# WS-019 M5 — Final Cross-Cutting Controlled-Production Acceptance

Baseline: `main` @ `3cfb48786179c7532d3397451291a496f590c729`
Observed: 2026-10-04

## Status

**PARTIAL — cross-cutting implementation and safe-disable acceptance are green; final Production V1 readiness is not declared.**

M15–M17, M3, M4, M5B remain frozen foundations. No provider mutation was performed for M5C.

## M5C live safe-disable acceptance — PASS

Production-only control exercised:

`TRACEKIT_INTELLIGENCE_ACTION_SHOPIFY_CONTROLLED_WEBHOOK_CREATE_DELETE_PROOF`

### Disabled observation

After setting the exact-action switch to `disabled` and redeploying Production, authenticated same-origin MCP `tools/list` returned 23 tools.

Absent:
- `tracekit.prepare_shopify_controlled_proof`
- `tracekit.confirm_shopify_controlled_proof`
- `tracekit.execute_shopify_controlled_proof`

Still present:
- `tracekit.inspect_shopify_controlled_proof_readiness`
- other read-only Intelligence/MCP tools

No preparation, confirmation, execution, Shopify request, or provider mutation occurred.

### Restored observation

After changing the same exact-action switch to `enabled` and redeploying Production, the identical authenticated MCP `tools/list` returned 26 tools.

Restored:
- `tracekit.prepare_shopify_controlled_proof`
- `tracekit.confirm_shopify_controlled_proof`
- `tracekit.execute_shopify_controlled_proof`

Still present:
- `tracekit.inspect_shopify_controlled_proof_readiness`

Delta: exactly +3 controlled Shopify tools.

No preparation, confirmation, execution, Shopify request, or provider mutation occurred.

Conclusion: exact-action safe-disable is live-proven to suppress and restore the controlled Shopify mutation capability before provider access while leaving read-only Intelligence available.

## Release requirement manifest

| Requirement | M5 status | Evidence |
|---|---|---|
| authoritative_policy | PASS | Production V1 action matrix and fail-closed policy are merged. |
| safe_disable_controls | PASS | Live Production disable → 23-tool suppression → restore → 26-tool availability proof. |
| capability_suppression | PASS | Shopify exact action suppresses independently; Commas remains disabled; Everflow remains read-only. |
| permission_rbac | PASS | WS-017 operational boundary merged; lifecycle mutations require `actions.execute`; audit uses `audit_logs.view`. |
| tenant_isolation | PASS | Live production foreign-scope reads and mutations fail non-disclosing; authorized reads remain active-Organization scoped. |
| tenant_negative_reads | PASS | Authorized Work Items/Notifications reads returned 200; foreign workspace hints and foreign Work Item object returned non-disclosing 404 in Production. |
| tenant_negative_mutations | PASS | Foreign workspace Work Item mutation, spoofed actor mutation, and foreign Notification mutation each returned non-disclosing 404 in Production. |
| authorized_work_item_transitions | OUT OF SCOPE | Production Stem Labs organization returned zero Work Items (open=0); no safe disposable fixture exists. Acceptance plan forbids manufacturing/mutating a real finding solely for proof. |
| audit_visibility | PASS | Live Production: Admin Client View returned scope=active_organization; official DELETE /api/session/admin-view returned 200; after refresh Platform context returned scope=platform_account. Both returned bounded 10-event pages. |
| lifecycle_history_visibility | PASS | Work Item activity plus tenant-scoped Audit History and M5B governed-action projections are customer/operator visible. |
| notification_contract | PASS WITH DOCUMENTED LIMITATION | Production V1 is explicitly in-app Notification Center only. Health/recurrence/provider-health findings plus awaiting-approval, execution-failure and Shopify verification-failure projections are implemented. |
| operational_health | PASS WITH DOCUMENTED LIMITATION | Existing telemetry/runbook plus live safe-disable proof. External notification channels are not part of V1. |
| migration_convergence | PASS | M3/M4 production migration convergence evidence retained. |
| regression_gates | PASS | User confirmed green after M5B; preview/build checks were green before merge. |

## Final-production evidence disposition

The bounded M4.2 production acceptance sequence is complete for every safely exercisable gate. Active-Organization reads, foreign read negatives, foreign/spoofed mutation negatives, and both Audit History contexts were live-proven. The authorized Work Item transition scenario is explicitly OUT OF SCOPE because the approved Stem Labs organization has zero Work Items and therefore no disposable fixture; no production finding was manufactured merely to satisfy acceptance.

## Provider posture

- Shopify controlled reversible proof: **PRODUCTION PROVEN**, human controlled, live safe-disable proven.
- Shopify ingestion repair: **READ-ONLY FINDING**.
- Everflow bounded remediation: **READ-ONLY FINDING**.
- Commas test delivery: **ENGINEERING READY / NOT LIVE PROVEN**, disabled.
- General/autonomous provider mutation: **NOT SUPPORTED**.

TraceKit Intelligence is **not declared production-ready** by this document.
