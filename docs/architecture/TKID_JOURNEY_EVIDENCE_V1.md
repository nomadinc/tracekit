# TKID Prospective Journey Evidence v1

## Purpose and boundary

TKID v1 captures bounded first-party Evidence needed to reconstruct a buyer flow: funnel steps, offer and upsell versions, displayed price/terms, explicit CTA and offer decisions, checkout identity, confirmation, coarse milestones, cross-domain handoff, and sanitized client-error categories. It is not advertising surveillance, session replay, fingerprinting, arbitrary analytics, or a dispute-operation system. Production funnel installation is not approved by this phase.

TKID reuses TraceKit's Evidence-first principle but not the legacy broad browser-event payload contract. `POST /v1/tkid/events` accepts only an explicit v1 allowlist and writes private bounded Evidence before its normalized event. Raw tables have RLS, service-role-only grants, and no browser read path.

## IDs and lifetime

Journey, browser-session, checkout-session, event, and handoff IDs are random UUIDv4 values. They encode no customer, acquisition, Product, or campaign semantics. A Journey is a two-hour bounded funnel flow. A browser session expires after 30 minutes; the SDK uses `sessionStorage`, never fingerprints an expired visitor, and stores no secret or PII. Reset occurs on expiry or explicit new-Journey initialization.

## Source and public ingestion

`tkid_sources` binds a public opaque source identifier to Account, Organization, Business Context, environment, capture mode, schema version, approved origins, and rate policy. New sources default disabled. The browser supplies only the public source identifier; it cannot choose an Organization. Ingestion enforces exact normalized origin, 32 KiB request size, 1–20 events, UUIDv4 IDs, 24-hour timestamp window with five-minute clock skew, schema/event allowlists, field length/type bounds, and event-ID idempotency. Operational rate accounting is host/runtime infrastructure still required before production activation.

## Event envelope and taxonomy

Every event records `event_id`, `event_name`, `schema_version`, `occurred_at`, server `received_at`, Journey/session IDs, optional checkout ID, privacy mode, immutable Evidence hash/reference, source version, and normalizer version. v1 events are: Journey start, page/funnel step view, offer/upsell view, CTA click, offer accept/decline, checkout start/submit, browser purchase confirmation, confirmation view, receipt observation, cross-domain handoff, sanitized client error, and bounded VSL milestone.

No arbitrary metadata, event names, URLs with query strings, HTML/copy blobs, DOM selectors, form values, free text, stack traces, raw network payloads, payment-card data, passwords, IP identity, user-agent strings, or fingerprint components are accepted.

## Offer, consent, descriptor, and receipt semantics

Offer Evidence stores stable offer/version/step identifiers and a bounded snapshot of displayed amount, ISO currency, recurring flag, cadence/trial state, terms/disclosure versions, affirmative-action observation, and merchant-displayed descriptor/version. It does not assert legal consent or the eventual issuer statement descriptor. Receipt states are emitted only by an explicit source: confirmation viewed, requested, sent, or delivered must not be inferred from one another.

## Checkout and Commerce linkage

Browser confirmation, server checkout success, provider Transaction observation, and canonical Order persistence are distinct. Only the authenticated server association endpoint may create `tkid_commerce_links`. It binds checkout/Journey to canonical/provider Order references, explicit parent/child charge references, sequence, and `TKID_DIRECT` provenance. Browser events alone cannot establish financial truth. Continuous Commerce can later resolve a provider Order deterministically from this bridge; it must not use fuzzy matching or overwrite Everflow provenance.

## Cross-domain handoff

Approved first-party origins request a five-minute HMAC-signed opaque handoff. The token scopes source, Journey, browser session, exact target origin, expiry, and random handoff ID. The receiving origin validates signature and scope; durable single-use consumption prevents replay. Tampered, expired, disallowed-origin, cross-source, or replayed tokens fail closed. The signing secret is server-only and absent from browser storage.

## Privacy, retention, and erasure

Capture mode is `ESSENTIAL` or `ANALYTICS_ALLOWED`; non-essential VSL/progress Evidence is suppressed in essential mode. Retention uses a versioned policy identifier; final duration requires legal/product approval. Controlled erasure marks Evidence/Journey erased and removes behavioral content under the approved job, while preserving non-PII tombstone/audit facts. Existing Investigation versions retain their original cutoff and expose an Evidence-erased/completeness warning rather than silently changing provenance.

## SDK and failure behavior

The self-hostable client is explicit-first. Limited automatic behavior is Journey/session initialization, optional configured page view, bounded queueing, and asynchronous retry. It does not auto-capture clicks, inputs, forms, DOM changes, scroll streams, or session replay. Collection failures are swallowed and checkout continues; retries reuse event IDs and cannot duplicate events. Strict CSP needs only the merchant's first-party script and configured API origin—no third-party CDN is required.

## Journey read model and Investigation integration

The safe server-derived read model exposes identifiers, time range, observed steps, offer snapshot, accept/decline state, linked parent/child charges, confirmation/handoff/client-error aggregates, completeness, and missing expected Evidence. It excludes PII and raw Evidence. Completeness is `COMPLETE`, `PARTIAL`, `BROKEN_HANDOFF`, `MISSING_CHECKOUT`, `MISSING_CONFIRMATION`, `UNLINKED_COMMERCE`, or `ERASED`; non-applicable events are not failures. Investigation Journey drawers can label prospective first-party TKID Evidence separately from historical reconstructed Journeys without generating new conclusions.

The OTO2 reference flow can prospectively answer which offer/version and displayed terms appeared, explicit acceptance, timing, confirmation, descriptor display, cross-domain continuity, safe client errors, and main/child charge linkage. It does not retroactively fill historical gaps.

## Production activation gate

Before production instrumentation: approve worker-host rate limiting/abuse controls, secret provisioning/rotation, source registration, origin inventory, retention/erasure policy, consent policy, CSP/script delivery, monitoring/alerting, synthetic-to-staging validation, and merchant checkout integration. `TRACEKIT_REAL_DATA_ENABLED=false`, Workspace repository activation remains zero, and no Phase 3 dispute operation is included.
