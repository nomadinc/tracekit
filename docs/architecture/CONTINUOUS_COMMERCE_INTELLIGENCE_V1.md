# Continuous Commerce Intelligence V1

## Boundary

Phase 2.6 keeps the protected Commerce Shadow model current. It does not activate Orders, Customers, Offers, Money, Mission Control, or Operations read models. `TRACEKIT_REAL_DATA_ENABLED` remains false and `commerce_repository_activation` remains empty. Continuous is not Live.

## Worker and scheduler

A production-neutral scheduler reads `commerce_sync_schedules` and enqueues due `continuous` or `deep_reconciliation` Sync Runs through a service-only RPC. The RPC serializes enqueue decisions by Connection, Provider Account, and resource and reuses queued/running work. A durable worker—not a browser request—claims the existing Sync Run lease, heartbeats it, processes Evidence-first checkpoints, and records a safe completion or failure.

The default proposed cadence is a 15-minute overlap scan and a seven-day deep reconciliation. Both are persisted and configurable. Scheduling remains disabled until a production worker host is separately approved. Deep reconciliation wins when both jobs are due so it cannot race an overlap scan.

## Commas overlap strategy

Commas exposes page-number pagination and no verified incremental timestamp filter. TraceKit therefore measures the ordering of each first page from observed Transaction timestamps. Newest-first sources scan from page 1. Oldest-first sources use provider pagination metadata to scan the tail. Mixed or unprovable ordering fails conservatively.

Each page is fetched, written to immutable private Evidence, hash verified, parsed, compared with existing source mappings, normalized transactionally only when new/source-changed or when the normalizer version changes, and then checkpointed. Identical source records do not become updates.

A normal run stops at a **stable-known boundary**: two consecutive pages whose source IDs are all mapped and whose source/normalizer fingerprints are unchanged. Page fingerprint movement with identical known records is recorded as page movement, not Transaction mutation. New or changed records reset the boundary. A bounded-page or rate-limit safety stop requests deeper reconciliation. The stop reason and Evidence used to reach it are durable.

Provider total movement between the first and last observed pages is recorded. It is not automatically corruption; subsequent overlap runs converge through stable source IDs. This state is explicitly a TraceKit observation checkpoint, not a provider cursor.

## Deep reconciliation

Deep reconciliation uses the same Evidence-first worker with `deep_reconciliation` mode and can traverse the full provider history. It detects missed or changed Transactions, missing Evidence, source-map inconsistencies, pagination movement, and normalizer drift. It is periodic and quota-aware, not part of every routine run. Bounded fixture/region proof is required before a full real traversal.

## Change and provenance semantics

The worker distinguishes:

- `NEW`: no source mapping exists.
- `SOURCE_CHANGED`: stable source ID, different provider payload hash.
- `SOURCE_IDENTICAL`: stable source ID and payload hash.
- `NORMALIZER_CHANGED`: identical provider source interpreted by a new explicit normalizer version.

Refunds retain their own stable source mapping and payload hash. Products remain observations from Transactions and unresolved mappings remain `review_required`. Commas fan/customer ID remains authoritative within Connection and Provider Account; email and phone remain supporting Evidence only.

## Freshness and attribution availability

`commerce_continuous_sync_state` records last attempt, last success, provider observation, normalization, provider total, latest provider timestamp, page fingerprints, stability boundary, deep-reconciliation age, normalizer/Evidence versions, warnings, and attribution-source availability. It exposes context rather than one misleading health light.

The historical Everflow report is not a live connector. No verified live Everflow API credential/capability exists in this repository, so the decision is **EVERFLOW LIVE NOT CONFIGURED**. New post-cutoff Commerce Orders are `ATTRIBUTION_SOURCE_UNAVAILABLE`, not eligible-but-unattributed. Historical attribution never propagates beyond the approved V2 Journey boundaries.

## Investigation freshness and signals

Immutable Investigation versions remain valid at their Evidence cutoff. Scoped dependencies allow new relevant Evidence to set separate freshness state: `CURRENT`, `NEW_EVIDENCE_AVAILABLE`, `REFRESH_QUEUED`, `REFRESHING`, or `REFRESH_FAILED`. Refreshing creates a new version; it never overwrites an older version. Unrelated Organizations, Products, periods, and operational metadata do not stale an Investigation.

Investigation candidates are reviewable signals, not Findings. Candidate identity includes Organization, candidate type, metric/entity, comparison period, baseline version, and Evidence snapshot. Generation requires mature cohorts, documented minimum sample and movement thresholds, and suppression when an existing Investigation covers the signal. Candidate inputs retain current/baseline values, samples, maturity, Evidence quality, and trigger reason without causal language.

## Disputes and webhook decision

Decision: **CONTRACT ONLY**. Commas documents `dispute.created` and `dispute.updated` payload structure, but verified signature algorithm, timestamp/replay contract, endpoint routing secret, and configured secret are unavailable. TraceKit will not accept a webhook without those controls. The Resolution Center workbook remains immutable historical Evidence and is not repeatedly imported as a substitute for forward ingestion.

## Failure, recovery, and rate limits

Evidence failure prevents normalization and checkpoint completion. Normalization failure preserves Evidence and marks the checkpoint retryable. Expired leases can be reclaimed; duplicate scheduling converges to one active run; replay relies on stable source identities and idempotent persistence. Prior normalized state and prior Investigation versions remain available after failure.

The worker honors `X-RateLimit-Remaining`, reset diagnostics, `Retry-After`, bounded exponential retry, and a conservative low-quota stop. Tests use synthetic 429/low-quota behavior; real quota is never deliberately exhausted.

## Security and future Evidence

Credentials decrypt only inside the server worker. Browser roles cannot read the continuous state, schedules, dependencies, freshness, candidates, or raw Evidence tables. Diagnostics contain no PII, credentials, raw payloads, signatures, or storage references.

Future TKID/browser Journey Evidence can enter as another versioned source dependency (Journey/session/checkout/order/charge/funnel/offer/consent/descriptor/confirmation/support/access identifiers and events). The Commerce scan and source identity model do not require redesign when that separately approved source arrives.
