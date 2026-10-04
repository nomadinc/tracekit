# WS-019 M4.3 Production Proof Plan

M4.3 remains implementation-ready, not production-proven, until this plan is executed after authorized integration and deployment.

1. Confirm an authenticated Stem Labs Admin Client View session and effective `audit_logs.view`.
2. Take a transactional BEFORE snapshot of the M3 intent, confirmation, authorization, execution result, recovery, external mutation audit, Work Items, notification state, and relevant audit counts/hashes.
3. GET `/api/intelligence/action-history/1c07429f-ccce-4b9f-9fa3-88b912fac422` with no query parameters.
4. Compare the allowlisted response with the certified M3 artifact. Require the independent provider read-back and observed replay to be labeled `certification_artifact_only`, readiness to remain `partial`, and exactly one execution.
5. GET a synthetic UUID and require the same non-disclosing 404 used for a missing or foreign intent. Do not obtain or inspect another tenant's lifecycle identifier.
6. In explicit platform/no-active-organization context, require lifecycle detail to fail closed with 404.
7. Verify the `/activity` governed-action detail renders the same stage/evidence model without secrets.
8. Take an identical AFTER snapshot. Require zero lifecycle, Work Item, notification-state, or audit-history business writes. A normal `membership.resolved` session event is allowed.
9. Correlate runtime telemetry and require zero credential resolution, provider readiness reads, or Shopify/Everflow/Commas requests.

Only after all checks pass may `lifecycle_history_visibility` be recorded as production-proven in the M4 acceptance evidence.
