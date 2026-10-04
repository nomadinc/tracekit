# WS-019 M1 — TraceKit Intelligence Production Readiness Audit & Release Contract

Baseline: `main` @ `828c32225ad93899a5f0e974a2e3fc9964776558` (2026-10-03)

## Disposition

M1: **PARTIAL**. The repository contains a credible controlled Intelligence foundation: deterministic Health findings, durable Work Item lifecycle/history, Notifications, tenant-scoped MCP reads, governed prepare/confirm/execute/replay infrastructure, a production-proven bounded Shopify reversible proof, and bounded Commas test-delivery execution. M17 adds read-only remediation eligibility for Shopify and Everflow. Production readiness is explicitly not declared.

## Provider/action matrix

| Provider | Finding/signal | Action | Lifecycle | Classification |
|---|---|---|---|---|
| Shopify | Missing required ingestion webhook(s), duplicate ambiguity, or healthy exact coverage | controlled disposable webhook proof | prepare → confirm → execute → provider read-back → delete/absence verify → durable replay | **PRODUCTION PROVEN** for controlled proof only |
| Shopify | Missing ORDERS_CREATE / REFUNDS_CREATE | repair_ingestion_webhooks signal | read-only assessment; no reusable M17 repair execution | **READ-ONLY FINDING** |
| Everflow | Stale/failed freshness or failed latest run, with active/stalled suppression | bounded_manual_sync signal | read-only; no governed execution contract | **READ-ONLY FINDING** |
| Everflow | Generic provider mutation | none | none | **NOT SUPPORTED** |
| Commas | Approved dispute-webhook target readiness | webhook_test_delivery | prepare → confirm → execute → provider response → durable replay | **ENGINEERING READY / NOT LIVE PROVEN** for Production V1 release gate; repository records controlled proof, but this audit did not obtain independent current-production delivery evidence |
| Commas | Create webhook subscription | candidate only | duplicate prevention/read-back exist below the governed surface; rollback absent | **NOT SUPPORTED** |
| TraceKit | Evidence-limited tracking recommendation | inspect_evidence | prepare → confirm → execute → retained-evidence verify → durable replay | **ENGINEERING READY / NOT LIVE PROVEN**; no provider mutation |

## Smallest credible Production V1

A controlled diagnostic + human-governed remediation console, not an autonomous agent:

1. Deterministic current-state findings from stored operational evidence.
2. Explicit outcomes including HEALTHY / NO ACTION REQUIRED / INSUFFICIENT EVIDENCE / ACTION ELIGIBLE / BLOCKED.
3. Durable Work Item lifecycle, activity/history, recurrence, dismissal suppression, evidence explanation, and tenant-scoped links.
4. Dashboard/Notification Center delivery until an external destination is configured and proven.
5. Read-only provider remediation signals for Shopify and Everflow.
6. Governed actions only where an exact contract and release evidence pass: prepare → explicit confirmation → execute → verify → replay/idempotency.
7. No autonomous mutation, generic provider mutation, model-selected mutation, or arbitrary provider API execution.
8. MCP remains an authenticated governed interface into the same canonical services, never a bypass around tenancy, RBAC, confirmation, or audit.

## Controlled release gates

### INTERNAL
- Current-main regression suite green for Health, Work Items, Notifications, MCP, M15–M17.
- Production target/environment identity verified before any action.
- actions.execute restricted to approved internal operators.
- Shopify controlled proof re-proven net-zero; Commas test delivery re-proven with durable audit; Everflow remains read-only.
- Applicable kill switches documented and exercised.

### SELECTED DEMO ACCOUNTS
- Explicit organization/account allowlist.
- Findings/signals demonstrated against known states with false-positive review.
- Mutations require named human confirmation and exact provider/target/effect/verification/recovery display.
- Cross-org negative tests pass.

### FOUNDING CUSTOMERS
- Per-provider live evidence pack for every enabled action.
- Durable action history visible to authorized customer roles.
- External alert destination configured if external notifications are promised.
- Escalation ownership/SLA and operator runbook defined.
- Recovery drill completed for every mutation.
- Rate/quota/failure telemetry and alerting proven.

### GENERAL AVAILABILITY
- Multi-tenant production soak, SLOs, support/recovery ownership, stable action-contract versioning, provider API drift monitoring, audit retention, and independent security review.
- No action below PRODUCTION PROVEN enabled for GA mutation.

## Key gaps

- M17 signals are current-state/read-only and not a durable unified remediation-case model.
- Everflow has no prepare/confirm/execute/verify action contract.
- Shopify M17 identifies missing ingestion topics; its executable capability is still a narrowly controlled disposable proof, not general repair.
- Commas M17 finding/remediation integration is absent.
- Slack/email/webhook notification channels are future; production activation requires an operational alert destination.
- Escalation is workflow/manual, not a defined timed escalation policy.
- Health findings are computed current snapshots; durable history is mainly Work Item activity/Notification state rather than immutable versions of every finding evaluation.
- No AI/LLM is required in the audited path. Deterministic logic and schema/tool validation are the current failure boundary. A future model must fail to INSUFFICIENT EVIDENCE/BLOCKED and never create mutation authority.
- Continuous Commerce/TKID have strong kill switches; no single Intelligence-wide action kill switch covers every governed MCP/provider action.
