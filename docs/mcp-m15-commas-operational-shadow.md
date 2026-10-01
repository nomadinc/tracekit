# M15 — Commas operational shadow acceptance

Status: ACTIVE
Branch: workstream/mcp-m15-commas-operational-shadow
Base acceptance: M14 Production PASS

## Mission
Prove that the canonical Accufy Commas transaction runtime operates safely as a normal shadow/incremental cycle after tenancy convergence. Do not redesign the connector and do not broaden provider mutation capability.

## Production baseline
Canonical scope:
- organization: Accufy (c98d44be-5f7f-41a2-a9d3-ae67a811a872)
- connection: 8030cf89-88f3-433f-99ec-c2083c4e5698
- provider account: dd3506d5-3417-4086-8623-9f8ec6b81694
- PBS context: push-button-system-c98d44be

M14 proved:
- exact tenant-scoped credential resolution;
- exact approved Commas webhook subscription/event;
- prepare -> human confirmation -> durable authorization -> atomic consumption;
- provider HTTP 200, event_sent=true, target response 200;
- persisted execution result and verified delivery;
- providerConfigurationMutation=false.

## Current M15 observation
The canonical Accufy transaction schedule exists and is configured:
- enabled=true
- activation_state=enabled
- sync_frequency=hourly
- overlap_interval=15 minutes
- deep_reconciliation_interval=7 days
- quota_minimum_remaining=1000
- deep_request_budget=800
- max_execution_seconds=840
- production control commerce_scheduler=enabled with shadow_only=true

But schedule progress is stale since the tenancy canonicalization window:
- last_enqueued_at=2026-09-28T06:10:10.509Z
- last_completed_at=NULL
- last_failed_at=NULL
- successful_through_at=NULL
- resume_cursor=NULL
- no current active transaction run observed for the canonical Accufy connection.

Webhook shadow ingestion is active independently and has produced completed dispute_webhook runs under Accufy.

## First acceptance question
Why is an enabled, overdue, shadow-only canonical Accufy transaction schedule not dispatching normal incremental work?

Do not create a competing manual transaction run until this scheduler boundary is explained.

## Acceptance constraints
1. Preserve raw/source evidence and deterministic commerce + attribution identities.
2. Historical TraceKit provider observations remain provenance; normal M15 scope is canonical Accufy only.
3. Normal scopedConnection() must resolve the single connected Commas connection dynamically. Historical fixed-ID recovery helpers are not normal dispatch paths.
4. No routine sync may invoke the governed M14 webhook test-delivery action.
5. No new provider configuration mutation.
6. No live repository activation. Shadow-only until acceptance is complete.
7. Diagnose scheduler/dispatch state before manual execution.
8. A Production acceptance cycle must prove:
   - bounded provider requests and quota safety;
   - checkpoint durability after each completed page;
   - overlap/stable-boundary behavior;
   - retry/recovery without duplicate accounting;
   - evidence hash verification and evidence reuse;
   - no skipped source records within the accepted boundary;
   - explicit stopping reason and observable counters;
   - no conflicting active run;
   - preserved unresolved evidence rather than dropped records.
9. Fail closed on ambiguous ordering, scope mismatch, stale/insufficient quota, conflicting run, invalid credential, or evidence-integrity failure.

## M15 slices
A. Scheduler dispatch diagnosis (read-only first).
B. Canonical Accufy quota/checkpoint preflight.
C. Small normal shadow cycle.
D. Recovery/idempotency proof.
E. Production acceptance evidence + milestone verdict.
