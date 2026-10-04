# WS-019 M2 — Production V1 Gap Closure & Acceptance Harness Plan

Baseline: M1 `1e7760157daa2125da2a2e9a08109f427469bbdf`; `origin/main` `828c32225ad93899a5f0e974a2e3fc9964776558`.

## Evidence-led scope

M1 proves one production action: the bounded, reversible Shopify controlled webhook proof. Everflow remains a read-only finding. Commas test delivery remains engineering-ready but not live-proven. M2 will not add provider actions, make the M17 recommendations executable, change Connections UI, or replace the existing M15–M17 intent/confirmation/execution foundations.

## Implementation sequence

1. Add a single Production V1 policy module that freezes the provider/action matrix, required release-evidence stages, notification classes, and fail-closed enablement rules.
2. Apply the policy at Intelligence evaluation and every governed action boundary (prepare, confirm, execute). Reads, persisted evidence, replay results, and history remain available when execution is disabled.
3. Suppress Commas mutation exposure by default because its Production V1 classification is not live-proven. Preserve its implementation and tests as engineering evidence; permit only an explicit, action-scoped evidence override for a future controlled proof.
4. Keep Everflow and Shopify repair signals read-only. Unsupported or unregistered operations must never appear as executable capabilities.
5. Build a lifecycle projection over existing Work Items/activity plus action intents, confirmations, immutable execution results, and provider verification/audit records. Add linkage only where needed; do not add a parallel lifecycle table.
6. Add a deterministic acceptance harness that produces a machine-readable evidence manifest for organization context, current evaluation, healthy and actionable paths, unsupported-action suppression, RBAC/confirmation, exactly-once execution, verification, durable history, replay, failures, tenant negatives, and telemetry.
7. Document the minimum Notification Center contract and explicit WS-016/WS-017 dependencies. No external escalation engine is in M2.

## Acceptance boundary

M2 passes when repository tests prove the frozen matrix and fail-closed policy, the harness rejects incomplete evidence, existing M15–M17/MCP regressions remain green, and the production runbook can collect fresh evidence without changing code. M2 does not declare Intelligence production-ready and does not substitute fixture evidence for a controlled production run.
