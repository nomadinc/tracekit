# WS-019 M4.4 Production Proof Plan

Status: **PHASE A CLOSED / PHASE B FIXTURE PRODUCTION EVIDENCE REQUIRED**

The frozen governed-action Notification Center contract contains exactly three abnormal or action-required conditions:

1. unexpired, unconfirmed executable intent awaiting explicit approval (`high`);
2. durable terminal non-success execution (`urgent`);
3. provider mutation with incomplete rollback/net-zero verification (`urgent`).

Routine success, completed replay, safe-disable suppression, unsupported operations, and read-only findings remain history-only. Provider and credential degradation remains part of `operational_health`. Delivery is in-app Notification Center only.

## Deployment prerequisite

Before runtime deployment, query the production migration ledger and require version `20261004202000` to be absent and unowned. Apply `20261004202000_m5b_action_notification_state.sql` through the normal migration mechanism, then verify:

- ledger identity `20261004202000 / m5b_action_notification_state`;
- table `public.mcp_action_notification_states` exists with RLS enabled;
- `service_role` has select/insert/update;
- `anon`, `authenticated`, `authenticator`, and `public` have no table privileges.

This prerequisite and the table-specific ACL hardening are production-proven. Do not rewrite the production ledger. Stop on any future version/name collision.

## Existing non-mutating specimens

- Expired unconfirmed intent `7cbe1acf-f8b0-4c95-8c4e-2edd25c1bb66`: prove awaiting-approval suppression.
- Certified completed M3 execution: prove successful execution, rollback/net-zero, and replay create no governed notification.

Production currently has no safe active-awaiting, terminal-failure, or incomplete-recovery specimen. Do not manufacture a provider failure.

## Production acceptance sequence

1. Capture transactional BEFORE hashes/counts for governed lifecycle tables, presentation state, Work Items/activity, general notification state, and external action/mutation audit.
2. Through an authenticated Stem Labs first-party session, list governed notifications and verify tenant, permission, filtering, counts, sorting, pagination, and source-health behavior.
3. Verify the expired intent and completed M3 execution produce no active governed notification.
4. Exercise foreign/synthetic notification read and update; require the same non-disclosing 404.
5. Verify missing permission and no-active-client fail closed.
6. For the separately reviewed fixed-purpose `ws019.m4.4.phase_b` fixture only, prove active awaiting approval, authorized read/dismiss presentation state, confirmation suppression, terminal failure, incomplete recovery, and rollback-verified suppression. Creation and each resolution remain separately unauthorized until production review. The fixture must never call a provider or create a Work Item.
7. Verify deep links open the exact intent lifecycle/proposal and never auto-confirm or execute.
8. Capture identical AFTER snapshots and require only the explicitly authorized presentation-state change.
9. Correlate telemetry and require zero Shopify, Everflow, Commas, credential, readiness, or external-delivery access.

Phase A is closed and production-proven. `notification_contract` remains blocked until the Phase B fixture mechanism is integrated and its separately authorized authenticated production evidence is complete.

## Phase B retained evidence contract

- Keep all three deterministic acceptance intents after certification.
- Keep the terminal failed execution result immutable and its notification presentation-dismissed.
- Keep the awaiting intent's deterministic confirmation so its underlying condition stays resolved.
- Keep the recovery row in `rollback_verified` so net-zero resolution stays evident.
- Keep exactly two presentation rows: awaiting/read and execution-failure/dismissed.
- Identify every lifecycle record through namespace `ws019.m4.4.phase_b`, deterministic IDs, `acceptance_only=true`, and non-dispatchable synthetic targets.
- Do not create Work Items, external-action audit, external-mutation audit, credentials, provider objects, or external delivery evidence.
