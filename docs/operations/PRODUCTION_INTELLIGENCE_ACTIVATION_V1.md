# Production Intelligence Activation v1

## Status and non-goals

This is an operator contract, not activation authorization. Phase 2.8 prepares Continuous Commerce and TKID Shadow controls. It does not deploy, enable a scheduler, register a webhook, install TKID, change merchant checkout/CSP/DNS, apply remote migrations, activate Workspace repositories, or begin dispute operations.

## Selected topology and trust boundaries

Use the existing Cloudflare Worker scheduled trigger and queue as the production host. Cron performs a short eligibility/configuration pass, then queues bounded jobs. Queue consumers use service-only Supabase access, lease a Connection/resource, resolve and decrypt the Organization-bound Commas credential server-side, call the provider, persist private immutable Evidence, verify hashes, normalize transactionally, checkpoint, update freshness, and evaluate bounded Investigation dependencies. Deep reconciliation is page/checkpoint resumable and must not remain in one long Worker invocation. Next.js renders Product/Admin server-derived read models only.

TKID flows from the first-party pinned SDK to the Worker ingestion boundary, then private bounded Evidence and normalized TKID tables. Handoff issuance/consumption and checkout association remain server-authoritative. Browser public source IDs route to a disabled/ready/shadow source; they never authorize Organization selection. Merchant checkout must continue when TKID fails.

## Activation states and kill switches

- Commerce scheduler: `DISABLED → READY → ENABLED ↔ PAUSED`. `tracekit_production_controls` is the global control; `commerce_connection_pauses` overrides it per Connection. Existing `commerce_sync_schedules.enabled` and the new activation state must both permit dispatch. Disable the global control first in an incident, then cancel queued/running work through the existing cancellation/lease contract. Evidence, checkpoints, normalized state, and Investigation versions remain.
- TKID source: `DISABLED → READY → SHADOW ↔ PAUSED`, with `REVOKED` terminal. Disable/pause the source to reject new Evidence safely; the SDK swallows collection failure and checkout continues. Commerce is unaffected.
- Investigation use of TKID: `DISABLED → REVIEW_ONLY → APPROVED`. Collection never changes an existing finding or version.
- Workspace repositories remain `DISABLED`; `LIVE_BETA/LIVE` require a separate approval and repository activation row.

## Scheduler, cadence, and quota

Initial overlap recommendation: every 15 minutes. The zero-change proof used two requests, so the theoretical base is 192 requests/day (5,760/30 days). For comparison: 5m=576/day, 10m=288/day, 30m=96/day, 60m=48/day. Budget routine operation at 8 pages/run for 768/day worst case, plus retries and verification. Protect at least 1,000 requests of the observed 10,000-request quota. Do not start a deep run unless at least its capped 800-request budget plus 2,000 requests of headroom remain. Quota state unknown, HTTP 429, Retry-After, or projected floor breach suppresses dispatch and creates a warning.

Deep reconciliation is proposed weekly during a low-volume window, but disabled until cadence/quota approval. It is checkpointed, quota-aware, cancellable, and resumable. A bounded run is never labeled full. If quota prevents completion, pause with an explicit checkpoint and resume after reset; last valid state remains authoritative.

Freshness SLO for 15-minute cadence: `HEALTHY` within 30 minutes of last success; `DELAYED` over 30 through 60 minutes; `STALE` over 60 minutes; `BLOCKED` when never successful or stopped by configuration/security. Deep reconciliation is current through seven days and overdue thereafter. Always show attempt, success, provider observation, normalization lag, and deep age separately.

## Monitoring and alert policy

Emit safe counters/timings for scheduler invocation, lease/recovery, run duration, provider requests/quota, new/updated/unchanged/failed records, Evidence writes/failures, normalization/schema drift, deep age, TKID accepted/rejected/duplicate/rate-dropped events, handoff outcomes, Commerce-link outcomes, Journey completeness, and Investigation refresh failures. Metadata must exclude PII, payloads, credentials, Evidence/storage references, and raw IP/user agent.

Alert on repeated sync failure (three consecutive eligible attempts), stale freshness, projected quota-floor breach, schema drift, any Evidence/hash failure, deep reconciliation overdue by more than one cadence, sustained TKID rejection/handoff/link failure, or Investigation refresh failure. Do not alert on zero-change success, one retry, or ordinary variation. `tracekit_operational_alerts` provides deduplicated internal state. **OPERATIONAL ALERT DESTINATION REQUIRED** before external delivery.

## First full deep-reconciliation procedure

1. Confirm global/Connection controls, verified Connection, active credential, Worker/queue health, private bucket access, and no conflicting run.
2. Read provider quota/total through an approved bounded verification; estimate pages at the verified page size. Require estimated pages ≤ 800 and quota remaining ≥ estimated pages + 2,000. Otherwise defer or split only through durable checkpoints.
3. Record request budget, 14-minute Worker-task budget, 10-minute lease renewed by heartbeat, operator request/audit context, current totals, normalizer and Evidence-contract versions.
4. Enqueue `deep_reconciliation`; do not run in a browser request. Verify each provider page becomes immutable Evidence and passes SHA-256 before normalization/checkpoint completion.
5. Cancellation: set run cancellation through the existing control, stop new page claims, allow the current transaction to finish, preserve the incomplete checkpoint, and release/expire the lease.
6. Resume with the same run/checkpoint contract after quota/reset/health recovery. Never restart by deleting state.
7. After the final provider boundary, verify page/checkpoint counts, Evidence hashes, duplicate constraints, source/normalizer classifications, Orders/People/Products/Lines/financial events/Refunds, provider total movement, and zero repository activation.
8. Run reconciliation/data-quality checks, update deep freshness only for a complete traversal, then obtain Product/Admin review. A partial run remains explicitly partial.

## TKID production Shadow contract

A production source requires Organization, Business Context, environment, opaque public source ID, exact origin list, schema/capture mode, pinned SDK version, distributed rate adapter, approved retention/erasure policy IDs, handoff key ID, proof caps/window, and status. It defaults `DISABLED`. **PRODUCTION ORIGIN INVENTORY REQUIRED**, **CONSENT POLICY APPROVAL REQUIRED**, and **RETENTION POLICY APPROVAL REQUIRED**.

Use exact `https://host[:port]` origins—no wildcard or suffix match. Handoff signing keys are distinct from Commerce encryption credentials and stored only in the approved secret manager. Database rows store references/key IDs and `current/previous/revoked` windows. Rotate by provisioning a new key, marking the old key previous for no longer than the five-minute token lifetime plus clock allowance, issuing only with the new key, observing verification, then revoking the old key. Audit IDs/state only.

Distributed abuse controls use the service-only `supabase_fixed_window_v1` adapter. The atomic database RPC shares limits across Worker instances for per-source accepted/invalid events, handoff issue/consume, checkout association, and short-lived transport-abuse hashes. Raw IP is SHA-256 minimized before the counter call, expires with the window, and is never persisted in TKID Journeys or Product/Admin models. If the counter backend is unavailable, TKID collection fails closed with a safe retryable response; merchant checkout continues.

Deliver the SDK self-hosted from an approved first-party asset origin, pinned to semantic version `1.0.0` and immutable filename/hash. Cache immutable versioned assets; keep the previous version for rollback. CSP minimum: `script-src 'self' <approved asset origin>` and `connect-src 'self' <exact TKID API origin>`. Do not add `unsafe-inline`, `unsafe-eval`, or wildcards. Handoff tokens are five-minute, exact-origin scoped and should use fragment/body transport where the merchant integration permits to reduce referrer/log exposure.

The merchant browser passes only Journey and checkout-session IDs to its server. The authenticated server creates the canonical/provider Order and parent/child associations. Association failure records a gap but never blocks purchase. Browser confirmation is not provider financial truth.

Initial proof recommendation: one Business Context, one funnel, exact approved origins, 50 Journeys or 1,000 events (whichever comes first), 48 hours maximum, manual start/stop. No percentage sampling. Observe acceptance/rejection, continuity, handoff, checkout association, provider/canonical linkage, parent/child charges, offer/version, price/terms, confirmation, missing steps, safe errors, SDK version, Commerce freshness, and checkout-impact reports.

Stop immediately for checkout impact, cross-tenant routing, PII/payment data acceptance, unexpected provider mutation, handoff-security defect, sustained rejection/link failure, excess request volume, quota risk, or Evidence/hash failure. Disable the TKID source; do not delete captured Evidence.

## Evidence-quality and Investigation gate

Review Journey continuity, offer-impression completeness, checkout-session completeness, Commerce association, parent/child association, confirmation completeness, handoff integrity, source freshness, and schema stability separately. No opaque composite score. TKID remains `REVIEW_ONLY` until the proof is approved; only a new immutable Investigation version may consume it. Historical Accufy and OTO2 versions remain unchanged.

## Privacy, retention, and content security

The v1 allowlist rejects email, phone, name/address, card/password data, free text, DOM/HTML, query strings, raw user agent, and fingerprint material. Remaining indirect-identification risk comes from stable Journey/session IDs, exact timestamps, rare step sequences, descriptor/offer IDs, and deterministic Commerce linkage. Mitigate with bounded lifetimes, coarse diagnostics, server-only raw tables, Product/Admin aggregate read models, approved retention/erasure, and no public object URLs. This is not legal-compliance certification.

Raw and normalized retention durations still require approved versioned policies. The erasure executor is implemented but disabled: it authorizes Organization/Journey/policy scope, deletes and verifies protected objects before database completion, redacts normalized behavioral fields, preserves canonical Commerce, tombstones TKID linkage/Journey state, and records safe provenance. Durable per-object checkpoints make interruption and partial failure retryable. Investigation versions remain immutable and receive only an `underlying_tkid_evidence_erased` provenance warning. Scheduled retention selection is not enabled.

## Continuous Commerce Worker adapter

The Cloudflare adapter is orchestration only. The scheduled callback validates environment and database controls, rechecks the global kill switch and Connection pause, applies cadence/deep eligibility and quota floors, reserves a stable scheduler identity, and emits a version-1 message to `continuous-commerce`. The message contains only job type, Connection ID, resource, mode, idempotency identity, and request time. It never contains credentials, PII, provider payloads, or Evidence.

The queue consumer validates the message and rechecks all controls before resolving protected runtime state through the server-only continuous-runtime binding. At-least-once delivery converges through scheduler identity, durable Sync Run idempotency, leases, content-addressed Evidence, and Commerce uniqueness constraints. Transient provider/429/storage/database/interruption failures retry with bounded queue policy; invalid schema, invalid credentials, cross-tenant work, and disabled/paused capability acknowledge without retry. Deep work uses the same message contract but remains separately eligible, quota guarded, and disabled. Deploying the binding does not authorize work: `TRACEKIT_COMMERCE_SCHEDULER_ENABLED=false`, the database capability is disabled, and schedule rows remain disabled.

## TKID erasure operation

An approved server job supplies Organization, opaque Journey ID, policy reference, and executor context. The executor creates or resumes one durable run, erases each protected object and verifies absence, checkpoints it, then invokes the transactional database tombstone. Object or database failure leaves an explicit retryable run; completion is never reported early. A second execution returns `already_erased`. Canonical Orders and financial records are never cascaded. Audit metadata is limited to Organization, opaque Journey ID, policy, timestamp, executor context, and result. The executor is ready but disabled until retention policy and operator/job authority are approved.

Performance budget: preserve the proven 7,167-byte source / 2,025-byte gzip client as the v1 baseline; target ≤3 KiB gzip, async initialization, ≤20 events/batch, no render/checkout blocking, and no durable sensitive browser queue.

## Secret inventory

| Secret/reference | Owner | Consumer | Storage | Rotation/activation requirement |
|---|---|---|---|---|
| Commas credential | Organization operator | Commerce worker | encrypted DB envelope | existing rotation; required |
| Commerce envelope key | Platform operations | Next.js/worker decryptor | deployment secret manager | versioned rotation; required |
| Supabase service role | Platform operations | Worker/Next server | deployment secret manager | platform rotation; required |
| TKID current/previous handoff keys | Platform security | TKID Worker only | secret manager, DB references only | independent rotation; required for handoff |
| TKID checkout server authentication | Merchant + platform | merchant server/Worker | both secret managers | provision/rotate before integration |
| Operational alert destination credential | Operations | alert adapter | secret manager | destination approval required |

Public browser-safe values are the pinned SDK URL/version and opaque public source ID. Organization IDs, service credentials, signing keys, retention controls, scheduler controls, and activation flags remain server-only and must never use `NEXT_PUBLIC_*`.

## Migration, deployment, rollback, and activation order

The proposed continuity host is the exact Cloudflare Worker custom domain `https://journey.trace-kit.io`. It shares the existing API Worker, but host routing exposes only the minimal root status and `/v1/tkid/relay/*`; it does not expose the shared Worker's other APIs. The root response sets no continuity cookie and reports relay execution disabled without tenant, binding, or database details. `TRACEKIT_TKID_RELAY_ORIGIN=https://journey.trace-kit.io` is server configuration and `TRACEKIT_TKID_RELAY_ENABLED=false` is mandatory on initial deployment. Cloudflare manages DNS and TLS for the exact custom domain—no wildcard—and responses retain HSTS, no-referrer, nosniff, no-store, and non-rendering CSP headers.

Host deployment currently requires the existing `continuous-commerce` Queue binding to exist even though Commerce scheduling remains disabled. Do not create that shared production resource under a relay-only change without its separate operational approval. A production TKID handoff signing secret and confirmed remote migrations through 055 are also prerequisites for relay activation, not for disabled host health. Commas return configuration changes only after host health, flow configuration, managed-origin activation, and a separate review.

Production migration expectation must be verified rather than assumed. Apply missing additive migrations in numeric order through 055 only after backup/change approval. Validate extensions, RLS/grants, tenant FKs, private `commerce-evidence` bucket, object/MIME limits, hashes, and zero activation rows. Prefer a forward fix; destructive rollback is not assumed safe.

Deploy only an approved branch/commit and green build after migrations. Supply server configuration/secrets, deploy Worker/API/UI with Commerce/TKID controls disabled, smoke-test health/readiness and unauthorized access, then separately approve activation. Deployment must not alter remote schedules/source states.

Safest order: migrations → private storage → secrets/config → disabled code deploy → health → enable Commerce overlap → approve/run first deep reconciliation → observe → register TKID source disabled → exact origin/CSP/checkout integration → bounded Shadow proof → quality review → broader Shadow approval → separate Investigation-use approval → separate Workspace activation approval.

Rollback rehearsal contract: globally disable scheduler, pause Connection, disable TKID source, stop claims, restore the previous Worker/SDK version, and leave Evidence/data/versions intact. Re-enable from checkpoints with idempotency. A bad normalizer is forward-fixed and replayed from Evidence under an explicit new version. No credential revocation is needed solely to pause processing.

## External approval blockers

Required inputs not inferable from the repository: production funnel origins, Business Context/funnel selection, merchant checkout integration point/auth, consent mode/legal approval, retention and erasure policies, secret-manager references/owners, Worker deployment approval, quota/cadence approval, alert destination, production migration level, CSP asset/API origins, and bounded-proof operator/stop authority. Commas dispute webhook remains contract-only and Everflow live ingestion remains not configured. Live Workspace activation and Phase 3 are out of scope.

Activation therefore remains blocked by: **PRODUCTION ORIGIN INVENTORY REQUIRED**, **CONSENT POLICY APPROVAL REQUIRED**, **RETENTION POLICY APPROVAL REQUIRED**, **OPERATIONAL ALERT DESTINATION REQUIRED**, **CHECKOUT INTEGRATION APPROVAL REQUIRED**, **WORKER DEPLOYMENT APPROVAL REQUIRED**, **CADENCE/QUOTA APPROVAL REQUIRED**, **CSP APPROVAL REQUIRED**, **PRODUCTION MIGRATION APPROVAL REQUIRED**, and **INVESTIGATION TKID EVIDENCE REVIEW REQUIRED**.
# Production maintenance write gate

`TRACEKIT_MAINTENANCE_WRITE_GATE_ENABLED` is a server-only emergency/maintenance
control. It defaults to `false`. Deploying support for the control does not enter
maintenance mode. Only the exact values `true` and `1` activate it.

When active, HTTP business-data mutations and the entire scheduled handler are
blocked with a sanitized `503` and `Retry-After: 60`. Health, authorized read-only
inspection, and the existing `wowboost-imports` Queue consumer remain available.
The consumer may finish bounded continuations/retries belonging to accepted work,
but it may not start unrelated follow-on task chains. This is a drain control, not
a database lock and not an authorization substitute.

Changing a Cloudflare Worker variable creates a new Worker version/deployment.
For a future approved window, change only
`TRACEKIT_MAINTENANCE_WRITE_GATE_ENABLED`, preserving every other binding, route,
trigger, and capability setting. Do not use a public/browser variable.

## Operator sequence (not currently active)

1. Record the deployed version, variable state, cron, Queue bindings, backlog,
   provider ingress, and migration ledger. Confirm the gate is `false`.
2. Confirm there is no active webhook whose retry/buffering contract is unknown.
3. Set the Worker variable to `true` through the Cloudflare dashboard and deploy
   that configuration-only version. Verify a representative authorized mutation
   receives `503`, while health and read-only inspection still work.
4. Let `wowboost-imports` continue consuming. Confirm scheduled invocation causes
   no provider call, Queue production, or database write.
5. Observe backlog, delayed/retry tasks, consumer activity, database writers,
   transactions, locks, health, and the migration ledger until the approved
   quiescence criteria pass.
6. Optionally pause Queue delivery only after backlog and in-flight work are zero.
7. Create, encrypt, hash, and inventory the logical backup.
8. Resume Queue delivery if paused. Set the Worker variable back to `false` and
   deploy that configuration-only version.
9. Verify scheduled/manual ingress, run the bounded catch-up procedure, and monitor
   duplicate prevention, retries, errors, Queue depth, and provider-request rate.

Abort without taking a backup if new messages continue arriving, a continuation
cannot converge, webhook delivery could be lost, a database writer remains, a long
transaction or blocking lock exists, health degrades, or the migration ledger
changes unexpectedly.
