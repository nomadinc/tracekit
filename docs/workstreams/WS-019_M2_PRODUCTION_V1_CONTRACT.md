# WS-019 M2 — Controlled Production V1 Contract

This contract makes a future controlled-production run repeatable. It does not declare TraceKit Intelligence production-ready.

## Frozen action matrix

| Provider | Operation | Production V1 classification | Mutation exposure |
|---|---|---|---|
| Shopify | `shopify.controlled_webhook_create_delete_proof` | PRODUCTION PROVEN | Controlled proof only |
| Shopify | `repair_ingestion_webhooks` | READ-ONLY FINDING | None |
| Everflow | `bounded_manual_sync` | READ-ONLY FINDING | None |
| Everflow | generic mutation | NOT SUPPORTED | None |
| Commas | `commas.webhook_test_delivery` | ENGINEERING READY / NOT LIVE PROVEN | Suppressed pending fresh production evidence |
| Commas | webhook subscription creation | NOT SUPPORTED | None |

No model output can select an operation or become provider instructions. Eligibility, target resolution, authorization, confirmation, execution, and verification remain deterministic.

## Release evidence contract

Every enabled mutation must produce references for detection, eligibility, preparation, exact target, permission, explicit confirmation, execution, verification, replay/idempotency, durable audit/history, and safe failure. The manifest must also pass organization context, current production evidence, healthy/no-action, actionable finding, unsupported-action suppression, confirmation/RBAC, exactly-once execution, verification, durable lifecycle, replay, failure, tenant-negative access, and operational telemetry scenarios.

Run `npm run verify:intelligence-production-v1 -- <manifest.json>` from `ui`. A nonzero exit means the evidence pack is incomplete. Fixture success is repository acceptance only and is not fresh production evidence.

## Safe disable

- `TRACEKIT_INTELLIGENCE_EVALUATION=disabled` makes remediation evaluation return a blocked, non-actionable signal.
- `TRACEKIT_INTELLIGENCE_MUTATIONS=disabled` disables every governed mutation.
- `TRACEKIT_INTELLIGENCE_PROVIDER_<PROVIDER>=disabled` disables one provider family.
- `TRACEKIT_INTELLIGENCE_ACTION_<NORMALIZED_OPERATION>=disabled` disables one operation.

Missing or unknown operations fail closed. Disabling execution does not delete findings, Work Items, activity, intents, confirmations, immutable execution results, verification evidence, or audit rows. Shopify remains enabled under the frozen matrix unless a disable is set. Commas remains disabled by classification.

## Lifecycle and history

The durable chain is a projection, not a new subsystem: Health finding and Work Item evidence → recommendation metadata → `mcp_action_intents` → `mcp_action_confirmations` → `mcp_action_execution_results` and provider audit/recovery rows → Work Item activity resolution/failure. Correlation identifiers and evidence references are required in the acceptance manifest. M2 adds an ordered projection helper; production evidence must demonstrate the underlying records remain tenant-scoped and visible to an authorized role.

## Notification and escalation minimum

Production V1 uses Notification Center only. Required event classes are important new finding, awaiting approval, execution failure, verification failure, recurrence, and important evidence/provider-health failure. Each class has a stable dedupe identity; failures are urgent, approval/provider-health are high, and findings/recurrence retain source severity. External Slack, email, webhooks, timed paging, and SLA automation are not promised by M2. Human ownership and response timing remain an operating-runbook requirement before activation.

## Dependencies and collision boundaries

WS-016 owns Connections UI and connection configuration. WS-019 consumes provider health/evidence only and must not add or alter Connections surfaces. WS-016 must preserve stable organization-scoped connection identifiers, provider status/evidence semantics, and credential-health signals used by the read-only evaluators.

WS-017 must prove `actions.execute` and `audit_logs.view` role behavior, tenant-negative reads and mutations, authorized Work Item transitions, and audit/history visibility. WS-019 consumes those controls and does not create parallel roles, permission grants, tenant rules, or Work Item mutation APIs.

