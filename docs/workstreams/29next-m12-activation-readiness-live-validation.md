# WS-008 M12 — 29Next Activation Readiness & Live Validation

Status: REVIEW pending dedicated local regression gate and live non-production proof.

## Mission

Prove the completed M2–M11 connector is safe to activate before any production schedule, external dispatcher, or live webhook is enabled.

M12 is a validation milestone, not an activation milestone.

## M11 lock

M11 is locked at `a2861c0ecc15f62e71c9d316961841baa43e8235` with 84/84 dedicated tests passing.

## Readiness gate

`evaluateNext29ActivationReadiness()` is a pure fail-closed gate. Production readiness requires explicit evidence for:

- all required 29Next/shared migrations applied,
- stable API version `2024-04-01`,
- read-only connection verification for orders, subscriptions, and disputes,
- bounded live reads for all three resources,
- immutable evidence persistence,
- at least one canonical order reconciliation proof,
- captured webhook signature verification,
- known webhook signing serialization.

Subscription/dispute canonical samples are reported as warnings when a validation store simply has no such records; the gate does not fabricate sample data.

If production execution is already enabled before the gate is evaluated, readiness fails closed.

## Non-production live-validation harness

`runNext29LiveValidation()`:

- accepts only `preview` or `staging`,
- invokes the proven M9 bounded runtime,
- reads orders, subscriptions, and disputes,
- is hard capped at one page / 10 records per resource,
- uses the actual evidence and canonical persistence adapters supplied by the runtime,
- does not claim/enable schedules,
- does not invoke the M11 dispatcher,
- does not register webhooks,
- does not mutate 29Next.

The live report contains counts and booleans only; it does not return provider payloads or credentials.

## Webhook serialization proof

29Next currently documents `X-29Next-Signature` as HMAC-SHA256 using the webhook signing secret. Their published Python example parses JSON and then signs `json.dumps(webhook_data)`, so production activation must validate the actual delivery serialization rather than assume raw-byte semantics.

`characterizeNext29WebhookSignature()` tests a captured delivery against:

1. exact received bytes,
2. parsed + JSON reserialization,
3. otherwise returns `unknown` and blocks activation.

This diagnostic does not process, persist, or acknowledge the webhook.

## Required migrations

M12 explicitly preflights these connector dependencies:

- `097_commerce_subscriptions_v1.sql`
- `098_commerce_webhook_receipts_v1.sql`
- `20260901060000_generalize_commerce_dispute_observations.sql`
- `20260902030000_next29_incremental_scheduler_foundation.sql`
- `20260902043000_next29_scheduler_dispatch_runtime.sql`

The repository gate proves every referenced filename exists and the set is unique. Applying them to a real non-production database remains part of the live validation phase.

## Activation boundary

M12 does not:

- write or expose a 29Next API token,
- enable a production schedule,
- create/enable an external cron or timer,
- register a production webhook,
- mutate provider orders/subscriptions/disputes,
- change Shopify, Everflow, or Commas runtimes.

## Acceptance gate

The M2–M12 dedicated local gate must prove the existing 84 M2–M11 tests plus:

- complete evidence can satisfy the readiness evaluator,
- missing migrations/live reads fail readiness,
- premature production execution fails readiness,
- no-sample subscription/dispute cases remain explicit warnings,
- raw-byte webhook signatures are characterized correctly,
- JSON-reserialized signatures are characterized correctly,
- live validation exercises all three read resources with strict bounds,
- live validation refuses production,
- every required migration filename exists,
- the required migration list is unique.

Expected dedicated total after M12: 94 tests.

## Live proof still required after local PASS

A local 94/94 result makes M12 code ready for live validation, not ready for production activation. The remaining operator proof is:

1. apply/verify migrations in Preview or Staging,
2. provision one real 29Next connection with read scopes only,
3. run read-only capability verification,
4. run the one-page/10-record live validation,
5. inspect evidence/canonical rows for identity and totals,
6. send/capture one real 29Next test webhook and characterize its signing serialization,
7. evaluate the readiness gate,
8. only then decide whether a later milestone may activate ongoing execution.
