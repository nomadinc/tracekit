# WS-008 M12 — 29Next Activation Readiness & Live Validation

Status: PASS for bounded live ingestion proof. Production activation remains blocked pending M13 webhook characterization/readiness gate.

## Mission

Prove the completed M2–M11 connector can safely read and persist real 29Next data before any production schedule, external dispatcher, or live webhook is enabled.

M12 is a validation milestone, not an activation milestone.

## M11 lock

M11 is locked at `a2861c0ecc15f62e71c9d316961841baa43e8235` with 84/84 dedicated tests passing.

## Local regression gate

The dedicated M12/UI regression gate passed 25/25 after the operator-surface and capability-regression fixes.

The existing connector regression suite also proved the bounded M2–M12 runtime surfaces without enabling schedules or webhook delivery.

## Live environment

Live validation was executed from the non-production TraceKit UI against Supabase project `joahiwgidfbzwzyslrbq` using the working Stem Labs 29Next connection:

- connection: `3c9a11bf-d4bc-4328-b627-0808d0db5670`
- API version: `2024-04-01`
- Orders read: PASS
- Subscriptions read: PASS, zero records observed in bounded sample
- Disputes read: PASS, zero records observed in bounded sample
- Scheduled execution: disabled
- Webhook delivery: disabled

## Bounded live-ingestion proof

The M12 operator harness remained hard capped at one page / 10 records per resource.

Final successful run:

- orders: 10
- subscriptions: 0
- disputes: 0
- evidence and canonical persistence path: executed

The successful order run completed with:

- `records_seen = 10`
- `pages_completed = 1`
- completed checkpoint at page 1
- no next cursor

## Persistence reconciliation

The successful order run reconciled cleanly:

- latest-run order Evidence rows: 10
- distinct latest-run source objects: 10
- missing Evidence storage references: 0
- platform orders: 10
- order source mappings: 10
- order lines: 18
- provider products observed: 4
- orders without mappings: 0
- orders without Evidence: 0
- duplicate provider orders: 0
- duplicate source mappings: 0
- order lines without parent order: 0
- order lines without Evidence: 0

There are 13 total order Evidence rows on the connection because three earlier failed M12 attempts persisted immutable Evidence before failing farther downstream. This is expected evidence-first behavior. The successful run itself contains exactly 10 Evidence rows for 10 distinct source orders.

## Rare-sample warnings

### Subscription live canonical sample

**WARNING — sample unavailable, not a failure.**

The bounded subscription read completed successfully but returned zero subscription records. No synthetic subscription was created and no canonical subscription proof is claimed.

The M5/M6 subscription model, normalization, schema, ingestion, rebill lineage, pending reconciliation, and regression tests remain intact. A real subscription sample should be observed opportunistically when available.

### Dispute live canonical sample

**WARNING — sample unavailable, not a failure.**

The bounded dispute read completed successfully but returned zero dispute records. No synthetic chargeback/dispute was created and no canonical dispute proof is claimed.

The M8 dispute API ingestion, webhook refresh path, reconciliation, lifecycle, financial projection, provenance, and regression tests remain intact. A real dispute sample should be observed opportunistically when available.

These two warnings are explicitly non-blocking for completing M12 bounded live-ingestion proof. They must remain visible until real samples are observed; they must never be converted into fabricated PASS evidence.

## Live defects found and corrected during M12

M12 live proof exposed and corrected several integration-boundary defects before activation:

- 29Next OAuth app permissions were initially absent.
- A token minted before permissions were configured returned 401 and had to be reissued.
- The generic credential-rotation path did not serialize 29Next `{ store, accessToken, apiVersion }` credentials correctly; a provider-specific rotation path/UI was added.
- M12 persistence diagnostics were hardened so cleanup writes cannot hide the original persistence boundary.
- `commerce_order_lines.id` was NOT NULL with no default; the schema now supplies `gen_random_uuid()` for the surrogate key.
- stale/duplicate 29Next connection state was identified; the working connection above is the validation baseline.

## Readiness boundary carried into M13

M12 proves real bounded reads and real Evidence/canonical order persistence. It does **not** activate ongoing production execution.

The following remain disabled after M12:

- production schedules
- external cron/timer dispatch
- live webhook processing
- provider mutations

Webhook signature characterization and the final fail-closed activation-readiness decision are carried into M13 and must complete before any ongoing execution is enabled.

## M12 result

**PASS — bounded live 29Next ingestion and order canonical persistence.**

Known non-blocking warnings:

1. no live subscription sample in the bounded validation window;
2. no live dispute sample in the bounded validation window.

Next milestone: **M13 — Controlled Activation, Webhook Characterization & Canary.**
