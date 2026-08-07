# Commas Phase 2 — Normalized Ingestion and Live Read Models

**Version:** 1.0

**Status:** Implementation Plan

## 1. Executive Summary

Phase 2 turns the verified read-only Commas client into a tenant-bound, replayable ingestion pipeline and then exposes normalized TraceKit read models through the existing production repository interfaces. It is divided into two independently releasable parts:

- **Phase 2A — Normalized ingestion and persistence:** connection security, durable jobs and checkpoints, evidence, identity resolution, observed Products, Orders, Order Lines, financial events, embedded Refunds, reconciliation, and shadow projections.
- **Phase 2B — Live read models and controlled Workspace activation:** server-authorized repository selection, shadow comparisons, per-Organization and per-Workspace activation, rollback, and staged rollout from Order through Money.

The recommended first vertical slice is one explicitly configured Commas connection for the Bullseye Health beta Organization, one approved Business Context, a reviewed subset of Provider Product mappings, a bounded Transaction backfill, deterministic Customer resolution, Order and fee/refund financial events, and the Order Workspace in `shadow` before `live_beta`. Commas remains a commerce/payment evidence source, not an attribution source. Provider net proceeds must never be labeled Profit.

This plan proposes additive migrations but creates none. It does not enable live repositories, persist provider records, change `TRACEKIT_REAL_DATA_ENABLED`, or modify Workspace behavior.

## 2. Current Verified Provider Capabilities

| Capability | Verified result |
|---|---|
| Authentication | Server-side `x-api-key` works for explicitly selected small and main accounts |
| Customers | `GET /public-api/customers`; main account has 50,622 records |
| Transactions | `GET /public-api/checkout-sessions/transactions`; main account has 73,018 records |
| Transaction detail | `GET /public-api/transactions/:transactionId` works on main; adds no useful fields and omits list `amount` |
| Products | Collection path is documented but returns HTTP 500 for both tested accounts |
| Observed Products | Embedded `product` and `service` objects; identical in bounded samples |
| Refunds | Embedded `refunds[]`; no live item was observed in bounded discovery |
| Disputes | `dispute.created` and `dispute.updated` webhooks documented |
| Pagination | Page starts at 1; `per_page` up to 100; two-page uniqueness verified |
| Rate limiting | Standard limit/remaining/reset headers; observed limit 10,000 |
| Checkout reference | Product/Service `payment_link` only |

## 3. Provider Limitations

- No stable list ordering was proven.
- No supported `created_at` or `updated_at` list filter was proven.
- Products cannot be enumerated directly while the Products endpoint returns 500.
- Embedded Product observations do not establish catalog completeness.
- Refund item fields and lifecycle semantics remain unverified.
- No read-only Refund collection was proven.
- Dispute and Chargeback collection probes returned 404.
- Historical Disputes require export, support-assisted backfill, webhook replay, or another supported provider mechanism.
- No Everflow, UTM, click, affiliate, campaign, session, or browser attribution identifier was observed in 100 bounded main-account Transactions.
- Currency, quantity, tax, discount, shipping, order status, subscription, rebill, and parent-transaction semantics remain incomplete or absent.
- `fee_amount` and `net_amount` are provider observations; their accounting semantics are not yet authoritative.

## 4. Phase 2 Goals

1. Bind a Commas connection to one authorized TraceKit Organization and provider account.
2. Backfill and incrementally reconcile Customers and Transactions without page-position identity.
3. Preserve replayable evidence and deterministic normalization.
4. Resolve Customers through the existing identity spine without cross-tenant merging.
5. Convert embedded Products into reviewed mappings to Business Context, Offer, Step, and Variant.
6. Maintain one canonical Order snapshot and one append-only financial ledger.
7. Normalize Refunds and future Disputes without duplicate financial effects.
8. Produce tenant-scoped read models implementing current repository contracts.
9. Activate live data through server-controlled Organization/Workspace gates with immediate rollback.

### Approved implementation decisions

- Backfill Transactions first, then enrich Customers.
- Activate Order Workspace first, only after mandatory shadow mode passes measurable reconciliation gates.
- Label `fee_amount` **Provider-observed fee** and `net_amount` **Net proceeds**; neither is Profit.
- Keep missing currency unknown unless an approved provider-account configuration supplies it; never silently infer USD.
- Persist observed Products immediately, but require reviewed Product-ID mapping before creating Canonical Offers or assigning Business Context.
- Require a verified live Refund schema before Refund UI activation.
- Use signed webhooks for new Disputes and a provider-supported export/replay/backfill for historical Disputes.
- Treat Provider Customer ID as authoritative within its Provider Connection. Email and phone are supporting signals, never unconditional merge keys.
- Use hybrid raw evidence: immutable protected payload storage plus database hash, source metadata and Evidence reference.
- Do not reuse `integrations_credentials` unless it is formally reconstructed and separately approved.
- Promote from shadow through measured reconciliation, completeness, security and rollback gates—not elapsed time.

## 5. Non-Goals

- Provider mutations, refunds initiated by TraceKit, captures, product changes, or customer changes.
- Direct Workspace calls to Commas.
- Attribution inference from absent Commas identifiers.
- Physical fulfillment for Push Button Systems or CashMyButton.
- Final Settings or Connected Systems UX.
- Production Intelligence.
- Broad activation for non-beta Organizations.
- Treating provider net as Profit or silently defaulting an unknown currency.

## 6. Phase 2A Scope

Phase 2A includes additive schema design; secure connection and credential records; durable Sync Runs, page tasks, and resource checkpoints; encrypted/raw evidence references; source mappings; Customer identity resolution; observed Product snapshots and mapping review; Order and Order Line normalization; sale, provider-fee, expected/released-fund, and Refund events; reconciliation; projection generation; audit events; and shadow diagnostics.

No UI repository changes occur until Phase 2A acceptance gates pass.

## 7. Phase 2B Scope

Phase 2B adds live repository implementations behind the existing interfaces, a server-only mode resolver, per-Organization and per-Workspace activation, shadow comparisons, safe fallback, and progressive activation for Order, Customer, Offer, Mission Control, and Money.

## 8. Canonical Data Flow

```text
authenticated server job
  -> authorized Organization
  -> Commas Provider Connection
  -> Commas Customers / Transactions pages
  -> immutable raw observation reference
  -> deterministic normalizer
  -> People + Customer source mapping
  -> observed Provider Product + reviewed Product Mapping
  -> platform_orders canonical Order snapshot + Order Lines
  -> conversions append-only Financial Events
  -> repository projections
  -> Live Repository
  -> production Workspace
```

The Commas client is an adapter dependency, never a Workspace repository. Canonical IDs and normalized product types remain provider-neutral.

## 9. Existing Database Objects

Local introspection after migrations 000–038 found the following material state:

| Object | Current purpose and state | Phase 2 decision |
|---|---|---|
| `tracekit_accounts`, `tracekit_organizations` | Persistent Account/tenant authority; UUID keys; RLS enabled; browser grants revoked | **Reuse** as authoritative Account and Organization ownership |
| `tracekit_business_context_access` | Membership-to-context authorization; not a Business Context catalog | **Reuse for access**, add a separate Organization-owned Business Context catalog |
| `tracekit_audit_events` | Server-only identity/authorization audit ledger | **Reuse** for connector administration, activation, and access decisions |
| `integration_import_jobs` | Durable legacy/import run with counters, cursor/page, progress, retry, metadata; `workspace_id` text; RLS disabled | **Reuse and harden** as Sync Run; add immutable Organization/connection/provider-account FKs and status invariants |
| `connector_import_tasks` | Durable per-job tasks with page/cursor, leases, attempts, dedupe, result summary; RLS disabled | **Reuse and harden** for bounded page work and recovery |
| `integration_import_errors` | Classified job/task failures; currently permits response excerpts | **Reuse and harden**; prohibit raw PII/provider bodies and add Organization/connection scope |
| `integrations_settings` | Legacy platform-keyed schedule; cannot represent multiple tenant connections | **Do not use as connection authority**; retain for legacy integrations |
| `integrations_credentials` | Referenced by worker and AES-GCM routines but absent from the reproducible local schema | **Not production-ready** for Commas; replace with a migration-tracked, Organization-bound credential model or formally bootstrap an approved equivalent |
| `people` | Current Customer/person identity spine; `workspace_id` text; RLS disabled | **Reuse and harden**, not duplicate with `canonical_customers` |
| `person_identifiers` | Typed email/phone/provider identifiers, source provenance and confidence; `workspace_id` text; RLS disabled | **Reuse and harden** with Organization and provider-account scope |
| `customers_identity` | Early legacy identity table; no tenant ownership and RLS disabled | **Compatibility only**; do not use as Phase 2 canonical Customer authority |
| `platform_orders` | Legacy mutable order snapshot, identity links, commercial/profit fields; global legacy uniqueness; RLS disabled | **Reuse as the single canonical Order snapshot after additive hardening**; do not create a competing Order table |
| `payment_transactions` | Legacy processor/gateway observations and matching; ambiguous Commas fit; RLS disabled | **Optional compatibility projection**, not Phase 2 financial authority |
| `conversions` | Existing append-only canonical financial-event ledger used for Refund and Chargeback ingestion; RLS disabled | **Reuse and harden** as the single financial ledger; product types expose `FinancialEvent` rather than the legacy table name |
| `financial_event_matches` | Immutable reconciliation-decision history; RLS enabled; service-role select/definer function | **Reuse** for manual/automatic financial-to-Order reconciliation where semantics align |
| `attribution_matches` | Legacy attribution match rows; no tenant FK/RLS | **Do not populate from Commas**; future attribution sources own those joins |
| `journey_events` | Append-only journey ledger with source identity | Add purchase/refund events only after canonical Order/Customer resolution; not a substitute for commerce storage |
| `domain_events` | Internal outbox for projections; workspace-scoped and RLS disabled | **Reuse after Organization hardening** for projection invalidation and operational events |
| Profit rollups | Existing Order/daily calculations keyed by workspace/connector/currency | Rebuild from hardened financial events only after semantic and tenant review |

The legacy tables' RLS-disabled state and text `workspace_id` are explicit blockers. Service-role-only application access is still required, but privileged access does not replace immutable Organization ownership or server authorization.

## 10. Required New Database Objects

Names are proposed and require schema review before migrations:

| Proposed object | Purpose |
|---|---|
| `tracekit_business_contexts` | Organization-owned Business Context catalog with type/digital-fulfillment configuration |
| `commerce_provider_connections` | Organization-bound provider configuration, credential reference, capabilities, status, activation state |
| `commerce_provider_accounts` | Provider-native account identity reached by a connection; supports future multiple accounts |
| `commerce_provider_credentials` | Encrypted server-only credential envelope, key version and rotation metadata; only if an approved external secret manager is not selected |
| `commerce_sync_checkpoints` | Durable per connection/account/resource high-water observations across Sync Runs |
| `commerce_raw_records` | Immutable evidence metadata and encrypted-object reference, not raw payload columns in read models |
| `commerce_source_mappings` | Unique provider source identity to canonical object mapping |
| `provider_products` | Mutable observed Product projection with immutable provider identity and first/last observation |
| `canonical_offers` | Organization/Business-Context-owned commercial proposition |
| `offer_steps` | Role and sequence within a Canonical Offer |
| `offer_variants` | Discount, funnel-version, price, or creative variant |
| `product_mappings` | Versioned Provider Product to Business Context/Offer/Step/Variant decision |
| `commerce_order_lines` | Order Line snapshots referencing provider Product and effective Product Mapping |
| `commerce_refund_snapshots` | Current Refund lifecycle projection after a Refund schema is verified; events remain in `conversions` |
| `commerce_disputes` | Current Dispute case projection sourced from signed webhooks/imports |
| `commerce_projection_versions` | Projection build version, source watermark, completeness and activation readiness |
| Repository projection tables | Bounded Order, Customer, Offer, Organization and Money read models; names finalized per repository |

Do **not** create separate `canonical_customers`, `canonical_orders`, `payment_events`, `refund_events`, `dispute_events`, or `financial_events` ledgers in the first migration. Use `people`, hardened `platform_orders`, and hardened `conversions`, with dedicated snapshots only where lifecycle state differs from append-only events.

## 11. Required Schema Changes

Additive migration design should include:

1. Add immutable `organization_id uuid` FKs to `people`, `person_identifiers`, `platform_orders`, `conversions`, `integration_import_jobs`, `connector_import_tasks`, `integration_import_errors`, and projection/outbox records used by Phase 2.
2. Add `provider_connection_id` and `provider_account_id` FKs to jobs, tasks, mappings, Orders, evidence and financial events.
3. Make legacy `integration_import_jobs.from_date`/`to_date` optional for page-only Commas runs, or replace them with a typed requested-scope field. Never invent dates merely to satisfy legacy NOT NULL constraints.
4. Add a canonical opaque Order UUID to `platform_orders`; retain legacy bigint `id` as storage identity during transition.
5. Replace reliance on globally unique `platform_order_id` with a validated unique source key `(organization_id, provider_connection_id, provider_account_id, platform, platform_order_id)` after legacy conflict analysis. Do not drop old constraints until compatibility consumers migrate.
6. Add Business Context, mapping version, reconciliation state, normalization version, payload hash/evidence ID, observed timestamps, and source identity columns where required.
7. Redesign the current unique Person-identifier value index so duplicate/shared email or phone values can be represented as candidates. Preserve source-mapping uniqueness separately and route ambiguous values to identity review.
8. Extend the `conversions` ledger-type constraint for required sale, fee, release, Refund and Dispute events using reviewed event names; preserve signed amounts.
9. Add immutable idempotency keys and unique indexes for Order source snapshots and each financial lifecycle event.
10. Enable RLS as defense in depth and revoke browser grants on every new/hardened tenant table. Only reviewed service roles/functions receive access.
11. Add immutability guards to append-only evidence and financial events, with correction events rather than destructive updates.
12. Add safe CHECK constraints for currency, mapping status, reconciliation state, sync state, and source identity completeness.

Migration work is split by concern and forward-fixed; no historical migration is rewritten.

## 12. Provider Connection Model

`commerce_provider_connections` should contain internal UUID, immutable Organization ID, provider (`commas`), provider-account label, environment, credential reference, status, capability snapshot, sync state, last success/error, created/updated timestamps, and audit actor. The browser never supplies tenant authority; the server resolves the connection only after membership, Organization and connector-capability checks.

One connection is configured for the beta Organization. The model permits multiple future connections through unique connection IDs and explicit provider-account records without changing normalization keys.

## 13. Credential Storage

The worker has AES-GCM helper code and hosted references to `integrations_credentials`, but that table is absent from the clean local migration chain and legacy credential lookup is platform-keyed rather than Organization/connection-keyed. It is not a safe Phase 2 foundation as-is.

Recommended beta path: migration-tracked `commerce_provider_credentials` containing connection ID, encrypted ciphertext, IV/nonce, algorithm, key version, rotated/created timestamps, status and fingerprint—never plaintext. The encryption key remains environment/secret-manager owned and server-only. Alternatively use an approved managed secret store and retain only its reference. This choice is an approval gate before Sprint 2.1.

## 14. Sync Run Model

Reuse `integration_import_jobs` as the durable Sync Run by adding Organization, connection, provider account, resource, mode (`backfill`, `incremental`, `reconcile`, `replay`), snapshot boundary, completeness state, cancellation state and normalizer/mapping versions. Counters remain useful. Metadata must contain no PII or raw payloads.

Each run records the source total observed at start/end, first/last page, request count, rate-limit observations, payload-hash outcomes, records normalized/review-required, and projection watermark.

## 15. Checkpoint Model

Use `connector_import_tasks` for per-page work and leases. Add `commerce_sync_checkpoints` for durable resource state across runs:

- Organization, connection, provider account and resource;
- last fully committed page/snapshot boundary;
- highest observed Transaction date and source ID as observations, not sole authorization/checkpoint truth;
- first-page ID/hash sample and source total;
- last deep-reconciliation boundary;
- last Refund reconciliation boundary;
- last successful Sync Run;
- version and invalidation reason.

A checkpoint advances only after raw evidence, canonical upserts, financial events, and projection invalidation commit atomically for that page.

## 16. Raw Evidence Boundary

Recommend **D — hybrid model**:

- Store encrypted full provider observations in a private, versioned object store for replay and schema evolution.
- Store `commerce_raw_records` metadata in Postgres: Organization, connection, account, source type/ID, object version/hash, source timestamps, retrieval time, provider request ID, Sync Run, object URI, encryption/key version, sensitivity, retention, normalizer version and status.
- Store selected non-sensitive normalized source fields in canonical tables.

Evidence objects are immutable. A changed source snapshot creates a new observation keyed by payload hash. Access requires a server session, Organization scope, Evidence permission, audit event and redaction. Retention and deletion policy is an approval gate; no customer row enters fixtures.

## 17. Customer Normalization

Reuse `people` as canonical Customer/person state. Update display name and current safe profile fields from the latest authoritative observation while retaining first/last seen and source evidence. Never store Commas raw objects in `people.metadata`.

Every normalized Customer receives an internal Person UUID and a `commerce_source_mappings` row for `(organization, connection, provider_account, customer, Commas fan ID)`.

## 18. Customer Identity Resolution

Resolution precedence:

1. Existing active Provider Customer source mapping.
2. One verified/observed normalized email candidate within the same Organization, with no conflicting Provider mapping.
3. One normalized phone candidate within the same Organization, with no conflicting email/provider evidence.
4. Create a new Person.
5. Multiple/conflicting candidates produce `review_required`; do not merge.

Provider account scope is included in source identity. Email and phone normalization/hashes reuse the identity service. Never merge across Organizations. Shared household emails, recycled phones, changed emails, missing phones, and duplicate provider Customer records create confidence/evidence decisions in `identity_resolution_events`. Explicit provider mapping wins over later descriptive changes; manual merges remain audited and reversible.

## 19. Observed Product Normalization

Each embedded `product`/`service` observation upserts `provider_products` by Organization, connection, provider account and immutable Provider Product ID. Persist current title/internal name/description only where observed, price observation, `payment_link` evidence reference, first/last seen, first/last source Transaction references, observation count, payload hash, and mapping state.

Conflicting Product/Service shapes or changing prices create observations and data-quality flags. They do not create new Provider Products solely because price changed.

## 20. Business Context Mapping

Create an Organization-owned Business Context catalog for Push Button Systems and CashMyButton. Mapping is server-side and versioned. A provider connection can reach records for both contexts, but every accepted Product mapping must select one permitted context. Unknown context fails closed as `review_required`; it is never widened to all Offers or the Organization.

## 21. Canonical Offer Mapping

Mapping precedence follows the approved framework:

1. Explicit Provider Product ID mapping.
2. Explicit pattern override.
3. Naming inference proposal.
4. `review_required` fallback.

The supplied 16 `GR` mappings may seed reviewed Push Button Systems proposals only after approval. Do not infer CashMyButton or funnel-version relationships. Shared main Product IDs can map to one Canonical Offer with multiple versioned placements. Differing upsell sets retain Step/Variant/funnel-version scope. Price alone is never a mapping key.

## 22. Transaction Normalization

Proposed mapping:

| Commas observation | Canonical meaning |
|---|---|
| Transaction `id` | Source mapping and idempotency identity; creates/updates one TraceKit Order snapshot |
| `transaction_date` | Provider event time |
| `fan` | Customer observation resolved to Person |
| embedded Product/Service | Provider Product observation and one Order Line when semantics are validated |
| `amount` | Provider-observed gross commercial amount, pending semantic/currency validation |
| `fee_amount` | Provider-observed fee, not automatically processor fee |
| `net_amount` | Provider-observed net proceeds, never Profit |
| `servicePayment.id` | Provider payment reference |
| `servicePayment.payment_type` | Provider payment type |
| `fund_release_on` | Expected release time |
| `fund_released` | Current provider release state |
| `refunds[]` | Refund snapshot/event inputs only after schema gate |

The normalized page write is transactional: raw observation metadata, source mapping, Person resolution, Product observation, Order snapshot, Order Lines, financial events and projection invalidation either commit together or the page item remains retryable/review-required.

## 23. Order and Order-Line Modeling

Harden `platform_orders` as the one canonical mutable Order snapshot. Add canonical UUID, Organization/connection/account ownership, Business Context, Person, mapping version, provider gross/fee/net fields, payment/release state, evidence references, reconciliation state and normalization version. Existing `gross_amount` may hold validated provider gross; existing Profit fields remain estimated/unavailable until all costs are available.

Create `commerce_order_lines` because the current table cannot represent multiple lines, quantity, unit price, mapped Offer placement or mapping version. If Commas supplies only one embedded Product, store one observed line with quantity unknown rather than assuming `1` unless provider semantics are confirmed.

## 24. Financial Event Modeling

Reuse and harden `conversions` as the one append-only Financial Event ledger. Each event includes Organization, connection/account, canonical Order/Person where applicable, source provider/type/ID, ledger type, signed amount, currency, effective/observed/ingestion timestamps, evidence ID/hash, idempotency key, normalizer version, mapping version, and reconciliation/Estimated state.

Required event families:

- sale/gross observation;
- provider fee;
- expected funds;
- released funds;
- Refund and Refund fee;
- Dispute, Dispute fee and Dispute reversal;
- manual adjustment;
- future affiliate payout and processor reconciliation.

Corrections append compensating/replacement events. Replay never updates a financial fact in place.

## 25. Fee Semantics

Until Commas confirms the fee contract, display and store `fee_amount` as **Provider-observed fee**. Do not classify it as processor fee, gateway fee, affiliate cost, or TraceKit fee. Preserve `amount`, `fee_amount`, and `net_amount` independently and test the observed relationship, allowing rounding tolerance and missing currency. Any formula is evidence-backed and versioned.

## 26. Fund-Release Modeling

`fund_release_on` is an expected release timestamp and `fund_released` is a mutable state observation. They are not settlement cash facts unless provider semantics are confirmed. Maintain a payment/release projection and append expected/released financial or operational events only on verified state transitions. Repeated identical observations produce no duplicate event.

## 27. Refund Modeling

Phase 2 has a mandatory live Refund-schema gate before normalization or Workspace activation. Once verified:

- derive a stable Provider Refund ID; if absent, use a reviewed deterministic composite with collision monitoring;
- support multiple and partial Refunds per Transaction;
- retain current Refund lifecycle in `commerce_refund_snapshots`;
- append signed Refund/fee events to `conversions` using event-specific idempotency keys;
- preserve source amount/status/time/evidence and never infer Chargeback;
- reprocess older Orders because embedded Refunds may appear after initial ingestion;
- invalidate Order, Customer, Offer, Organization and Money projections atomically.

## 28. Dispute and Chargeback Modeling

Forward path: authenticated, signed, replay-protected `dispute.created` and `dispute.updated` webhooks. Before implementation, verify signing algorithm, timestamp tolerance, event identity, retry policy and replay capability. Store the case in `commerce_disputes`; append financial effects only when status/amount semantics are verified.

Historical path: provider export, support-assisted import, provider webhook replay, or another approved mechanism. Webhook-only ingestion does not establish historical completeness.

Correlation candidate `payment_intent_id -> servicePayment.id -> Transaction -> Order` remains **unverified**. Unmatched events enter an Organization-scoped queue with evidence, reason and safe manual review. No Customer name/email or approximate amount alone may force a match.

## 29. Attribution Boundary

Do not populate attribution columns or `attribution_matches` from Commas. Commas provides commerce/payment evidence. Everflow, ClickGo and TraceKit browser events provide attribution evidence.

Future joins may consider reviewed combinations of Customer, Product, amount, timestamp, `payment_link`, and checkout context, but must produce explicit confidence and Evidence and must not manufacture click-level attribution. Direct identifiers from a future supported source take precedence.

## 30. Historical Backfill Strategy

At `per_page=100`, current estimates are:

- Transactions: `ceil(73,018 / 100) = 731` requests.
- Customers: `ceil(50,622 / 100) = 507` requests.
- Minimum list total: about **1,238 requests**, excluding retries, validation samples, reconciliation and optional detail requests.

Approved strategy: **Option A — Transactions-first, then Customer enrichment**.

Rationale: Transactions are the only current source of observed Products, Orders, payment/release facts and embedded Refunds; they also contain the Customer `fan`. A Transactions-first bounded slice proves the entire Order vertical. The separate Customer pass then enriches and reconciles the full Customer population, including Customers without Transactions. Running both fully in parallel would multiply rate/diagnostic complexity before source ordering and semantics are proven.

Execution:

1. Capture source total and page-1 boundary sample.
2. Create one backfill Sync Run and bounded page tasks (for example 5–20 pages per lease, tuned from measurements).
3. Process each page in its own database transaction; commit evidence and normalized records before checkpoint.
4. Re-read page identity/hash before declaring a range complete if ordering shifted.
5. Resume from durable tasks after failure; never assume one uninterrupted worker invocation.
6. Run Customer enrichment after the Transaction projection is stable.
7. Run a second full/deep reconciliation pass and compare source totals, unique source IDs and financial sums.

## 31. Incremental Sync Strategy

Because no timestamp filter or stable sort is proven, Phase 2 must validate ordering before choosing a normal poller. Recommended conservative strategy:

1. Poll the first `N` pages frequently, where `N` is based on measured arrival rate and a time-based safety target.
2. Deduplicate by immutable source identity and payload hash, never page position.
3. Track page-1 identity/hash samples and total-item count to detect shifting.
4. Continue until a configurable number of consecutive pages contain only known, unchanged records older than the overlap boundary.
5. Perform scheduled deep scans through all pages at a lower cadence until Commas exposes a reliable updated filter.
6. Revisit historical Transaction pages specifically for late embedded Refund changes.

A Transaction-date high-water mark is diagnostic only until ordering/filter behavior is proven. New IDs below the high-water mark must still ingest.

## 32. Reconciliation Strategy

Reconciliation has four levels:

- **Page:** count, distinct source IDs, duplicates, malformed records and payload hashes.
- **Object:** source mapping uniqueness, required ownership, Customer/Product/Order links and review state.
- **Financial:** observed gross, fee and net relationship by currency and Order, without calling net Profit.
- **Aggregate:** source Transaction/Customer totals versus normalized counts, explained by snapshot boundary, late arrivals, invalid/review records and reconciliation window.

Daily shallow reconciliation plus periodic complete scans is recommended initially. Refund reconciliation must include older Transactions, not only new IDs.

## 33. Idempotency

Minimum source key: `(organization_id, connection_id, provider_account_id, source_object_type, source_object_id)`. Raw observations add payload hash. Canonical snapshot upserts use source mappings. Financial events add event type and stable source-event identity. Webhooks add provider event ID and event type.

Database unique constraints—not in-memory checks—enforce convergence. A repeated page must create zero duplicate Orders, mappings, Refunds or financial events. Conflicting mappings fail into a Connector Error/review state.

## 34. Pagination and Recovery

- Use verified page-number pagination with `per_page <= 100`.
- Bind every task to Organization, connection, provider account, resource and Sync Run.
- Lease tasks with expiry; reclaim abandoned work safely.
- Commit one page at a time and advance only after all item writes succeed or are durably classified.
- Retry failed pages independently with capped attempts and `available_at`.
- Support cancellation without overwriting terminal state.
- Persist source totals and boundary samples to detect page shift.
- Never manually mark an unexecuted page complete.

## 35. Retry and Rate Limits

Reuse Phase 1 typed errors, 15-second timeout, bounded attempts, exponential jitter and `Retry-After`. Add per-connection request budgeting, circuit breaking for 401/403/repeated 5xx, durable retry timestamps and a safety reserve below observed limits. The observed 10,000 limit is not hard-coded. One Organization cannot exhaust another's quota.

## 36. Data Quality States

Use explicit states: `observed`, `normalized`, `review_required`, `invalid`, `reconciled`, `incomplete`, `blocked`, and `superseded`. Mapping confidence, identity confidence, currency availability, financial semantics, source completeness and Refund coverage are independent dimensions. Unknown values remain null/unavailable—not zero or healthy.

## 37. Provenance and Evidence

Every normalized conclusion retains Organization, connection/account, provider, object type/ID, payload hash, source timestamp where available, retrieval and ingestion timestamps, provider request ID where safe, Sync Run, normalizer/mapping/config versions, Evidence ID and reconciliation state. Every financial value shown must link to source Evidence or a documented formula with inputs.

## 38. Tenant and Organization Scope

Required chain:

```text
Authenticated User
  -> active Membership
  -> Account
  -> authorized Organization
  -> Organization-owned Provider Connection
  -> Provider Account
  -> Organization-owned normalized records
  -> repository authorization scope
```

The API key, provider account ID, `workspace_id`, query string and browser selectors never grant access. Cross-Organization reads return the same safe unavailable result as nonexistent records.

## 39. Sensitive Data and Encryption

- Encrypt credentials and raw evidence with versioned keys.
- Keep service-role and provider credentials server-only.
- Store normalized email/phone only where required; retain hashes for matching and permission-gate raw display.
- Separate Evidence access from ordinary read-model access.
- Redact logs, task payloads, errors, audit metadata and diagnostics.
- Define retention, erasure and legal-hold behavior before live activation.
- Never copy live records into tests, fixtures or migrations.

## 40. Audit Logging

Reuse `tracekit_audit_events` for connection creation/test/rotation/disable, sync start/cancel/replay, mapping approval/change, live-mode activation/rollback, sensitive-data access, Evidence access and denied scope. High-volume per-record ingestion belongs in Sync Run/evidence logs, not the human audit table.

## 41. Observability

Metrics include request/record throughput, page latency, rate-limit remaining/reset, retries, 4xx/5xx, page-shift detection, checkpoint lag, source/normalized counts, duplicate suppression, review-required rates, identity conflicts, unmapped Products, financial reconciliation deltas, Refund scan age, Dispute webhook lag/signature failures, projection watermark and repository-mode decisions.

Alerts are Organization/connection scoped and redact provider values. Correlation IDs connect request, page task, evidence, normalization, projection and audit records.

## 42. Live Repository Architecture

```text
Workspace server boundary
  -> authenticated TraceKit session
  -> RepositoryModeResolver(Organization, Workspace)
  -> existing Repository interface
       -> MockRepository
       -> ShadowRepository (live query + compare; returns mock)
       -> LiveReadModelRepository
```

Implement live repositories for the current `OrderRepository`, `CustomerRepository`, `OfferRepository`, and `MissionControlRepository` interfaces. Extend interfaces only when a verified product requirement cannot be represented. Repository results remain serializable product read models; no Commas raw type crosses the boundary.

## 43. Mock versus Live Switching

Recommended server-controlled states:

- `mock`: current reviewed mock repositories only.
- `shadow`: build/query live read models, compare and audit, but return mock results to users.
- `live_beta`: return live results only for an allowlisted Organization and Workspace with completeness gates.
- `live`: production-ready per Organization/Workspace after beta acceptance.

Store mode server-side by Organization and Workspace, with actor, reason, projection version and rollback target. `TRACEKIT_REAL_DATA_ENABLED` remains a global safety interlock, not authorization or rollout control. Browser flags cannot select modes.

## 44. Order Workspace Rollout

Order is first because Transaction evidence maps most directly to one Order, Customer, Product, gross, fee, net and release state. Initial live Order read model includes canonical ID, source date, Customer, Business Context, observed Product/line, provider gross/fee/net, payment type, release state/date, Refund coverage, Evidence and Estimated/Reconciled qualification.

Shipping, packaging, carrier and tracking are `not_applicable` for configured digital contexts. Profit remains Estimated/incomplete until COGS, attribution costs, taxes and other required costs are sourced.

## 45. Customer Workspace Rollout

Activate after identity conflicts and Customer enrichment pass gates. Read model includes Person, permitted identifiers, first/last observed, source Transaction count, gross, provider net, Refunds, related Orders and mapped Products/Offers. Provider aggregate values are diagnostic until reconciled against normalized Orders.

## 46. Offer Workspace Rollout

Activate only after explicit Product mappings cover the beta slice. Read model aggregates mapped Products, Transactions, Customers, provider gross/fee/net, Refunds and unmapped Product warnings. Unknown Products remain visible to authorized diagnostics but cannot leak into another Business Context.

## 47. Mission Control Rollout

Activate after Order, Customer and Offer projections reconcile. Mission Control consumes Organization/Business-Context aggregates for gross revenue, provider fees/net proceeds, Transaction/Customer counts, Refund coverage and expected/released funds. It does not derive final Profit from incomplete Commas costs.

## 48. Money Workspace Rollout

Activate after fee/currency/release semantics and Refund replay are validated. Show gross, provider-observed fees, net proceeds, expected/released funds and Refunds with Evidence. Add Chargebacks only after signed webhook and historical-completeness gates. Do not label provider net final Profit.

## 49. Beta Activation Controls

Activation requires:

- explicit Organization and Workspace allowlist;
- authorized Product Admin change with audit reason;
- projection version and completeness watermark;
- Customer/Product/financial quality thresholds;
- Evidence availability;
- no unresolved tenant/security blocker;
- tested rollback target;
- global real-data interlock enabled only during an approved deployment phase, never in this planning task.

## 50. Rollback Strategy

Rollback changes server-side repository mode from `live_beta` to `mock` without deleting normalized data. It invalidates incompatible caches, records an audit event and leaves ingestion paused or shadowing according to incident policy. Canonical/evidence records remain for diagnosis; no destructive rollback is needed.

Database migrations use forward fixes. Projection versions allow rebuilding without rewriting evidence. A failed normalization version can be disabled while the prior active projection remains readable.

## 51. Testing Strategy

- Migration replay from zero and schema/RLS/grant tests.
- Synthetic Commas contract fixtures only.
- Property/idempotency tests for repeated, overlapping and reordered pages.
- Transactional page-failure and lease-recovery tests.
- Customer identity conflict, cross-Organization and race tests.
- Product mapping/version/review-required tests.
- Financial sign, currency, fee, release and replay tests.
- Refund late-update/multiple/partial replay tests after schema discovery.
- Signed webhook, replay, ordering and unmatched-Dispute tests.
- Projection consistency and source-count reconciliation tests.
- Repository contract tests shared by mock/live implementations.
- Authorization, sensitive masking, Evidence and audit tests.
- Shadow comparison tests and live-beta rollback drills.
- Load tests for at least 73,018 Transactions and 50,622 Customers without live fixtures.

## 52. Migration Strategy

Proposed additive sequence, subject to schema review:

1. Tenant-safe Business Context, connection/account/credential and activation foundations.
2. Sync Run/task hardening plus durable checkpoints and errors.
3. Evidence metadata/object references and source mappings.
4. People/person-identifier Organization hardening.
5. Provider Products, Offers, Steps, Variants and Product mappings.
6. `platform_orders` hardening and Order Lines.
7. `conversions` financial-event hardening and idempotency.
8. Refund/Dispute snapshots and webhook inbox.
9. Projection tables, watermarks and activation controls.

Each migration has RLS/grant review, local clean replay, rollback/forward-fix notes and data-backfill separation. No migration is created in this planning task.

## 53. Deployment Sequence

1. Deploy schema/security only; no credentials or connections.
2. Deploy server services behind disabled controls.
3. Configure one beta Organization connection server-side.
4. Validate credentials and run a tiny synthetic/bounded shadow sample.
5. Run Transaction backfill in bounded resumable jobs.
6. Run Customer enrichment and deep reconciliation.
7. Build read models in `shadow` and review differences.
8. Activate Order `live_beta`; monitor and exercise rollback.
9. Progress through Customer, Offer, Mission Control and Money gates.
10. Add signed Dispute webhook only after independent security review; import history separately.

## 54. Operational Runbook

Operators need procedures to validate/rotate a connection, start/pause/cancel/resume a Sync Run, inspect safe progress, replay a page, quarantine malformed data, approve Product mappings, resolve identity conflicts, reconcile source totals, inspect Evidence under permission, rebuild a projection version, change repository mode, rollback, respond to rate limits/provider downtime, rotate webhook secrets and request historical Dispute data.

No runbook step accepts browser-supplied Organization scope or prints raw provider payloads.

## 55. Acceptance Criteria

- 100% of imported Transactions have stable Organization-bound source mappings.
- Re-running identical/overlapping pages creates zero duplicate Orders or Financial Events.
- Provider Customer mapping is deterministic; conflicts fail to review.
- Unknown Products enter `review_required` and cannot broaden Business Context access.
- Gross, provider fee and provider net reconcile to source observations within documented rounding/coverage rules.
- Refund replay is idempotent and late Refund scans are operational before Refund UI activation.
- Source counts match within an explicit snapshot/reconciliation window, with every difference classified.
- Tenant isolation, RLS/grants, sensitive masking, Evidence access and audit tests pass.
- Live repository activation is server-controlled, Organization/Workspace-specific and audited.
- Rollback to mock is tested under an active session.
- No Workspace calls Commas directly; no API key or raw payload reaches browser code.
- No cross-Organization object can resolve or disclose existence.
- Every displayed financial value has Evidence and explicit Estimated/Reconciled qualification.
- Provider net is never labeled Profit.

## 56. Risks

| Risk | Mitigation/gate |
|---|---|
| No incremental filters | Overlap, page-boundary detection, stable-ID hashes, periodic complete scans |
| Page shifting | Never checkpoint by page alone; compare source IDs/totals and rescan boundaries |
| Refund added to old Transaction | Dedicated historical Refund reconciliation cadence |
| Products endpoint failure | Embedded observed Products plus explicit mapping review; no catalog-completeness claim |
| No attribution identifiers | Separate attribution-provider integration; no Commas inference |
| No Chargeback polling | Signed webhooks plus provider-supported historical import |
| Missing currency | Block financial activation or mark incomplete; never silently default |
| Ambiguous fee/net semantics | Provider-observed labels, independent fields, semantic approval gate |
| High-volume backfill | Durable page tasks, rate budgets, bounded leases, resumability and load tests |
| Duplicate Customers | Provider mapping precedence, tenant scope, conflict queue, reversible merge history |
| Reused payment link | Evidence only; never use as unique Offer/Order identity |
| Incomplete Product mapping | `review_required`, coverage metric and per-context activation gate |
| Sensitive Customer data | Encryption, least privilege, masking, retention and audit |
| Provider schema change | Raw evidence versions, runtime validation, quarantine and normalizer versioning |
| API downtime/rate limits | Circuit breaker, bounded retries, durable resume and staleness indicators |
| Webhook replay gaps | Event idempotency, timestamp/signature verification and historical import plan |
| Mock/live divergence | Shadow comparison, repository contract tests and explicit projection version |
| Live-beta failure | Server-side per-Workspace rollback without deleting evidence |

## 57. Open Decisions

The following still require approval before their dependent sprint:

1. Set raw Evidence, PII and financial retention/deletion periods for the approved hybrid model.
2. Set shallow/deep reconciliation and historical Refund-scan windows from measured provider volume and page-shift behavior.
3. Approve initial Product-ID mappings and provide the authoritative CashMyButton configuration.
4. Decide whether unknown currency blocks normalization entirely or permits a non-financial incomplete projection. It may never default silently.
5. Confirm provider-account-to-Organization mapping and whether one API key can represent multiple provider accounts.
6. Approve the Business Context catalog/configuration for both brands and funnel versions.
7. Select the provider-supported historical Dispute/Chargeback import mechanism and completeness expectation.
8. Decide whether Mission Control waits for verified Refund coverage. Recommendation: Refund metrics wait; non-Refund metrics may activate with an explicit incomplete badge.
9. Select credential storage: migration-tracked encrypted table or managed secret store. Legacy `integrations_credentials` remains prohibited unless formally reconstructed and approved.
10. Confirm whether legacy `platform_orders`/`conversions` hardening is preferred over a one-time controlled replacement; this plan recommends hardening to avoid competing ledgers.

## 58. Recommended Sprint Sequence

| Sprint | Objective | Major files/tables | Dependencies | Validation | Rollback | Size | Explicitly out of scope |
|---|---|---|---|---|---|---|---|
| 2.0 | Approve schema/security and semantic decisions | ERD, migration specs, RLS/grants, event vocabulary | This plan and open decisions | Threat model, clean design review, migration dry-run plan | No runtime change | M | SQL migrations, live calls |
| 2.1 | Provider Connection and Sync foundations | connections/accounts/credentials, hardened jobs/tasks, checkpoints, audit | 2.0 credential decision | Tenant/RLS, encryption, task lease/idempotency tests | Disable connection/jobs | L | Normalization, UI |
| 2.2 | Transaction, evidence and observed Product backfill | raw metadata/object store, source mappings, provider Products, hardened Orders, lines | 2.1; Product mapping policy | Bounded synthetic/load replay, page shift, zero duplicates | Pause jobs; retain prior projection | XL | Live repositories, Refund financials |
| 2.3 | Customer identity and source mappings | hardened people/identifiers, identity events, Customer enrichment | 2.2 source mappings | Conflict/race/cross-tenant tests, count reconciliation | Disable normalizer version; replay | L | Final Settings UI |
| 2.4 | Financial events and embedded Refunds | hardened conversions, Refund snapshots, projection invalidation | Fee/currency approval; live Refund schema gate | Sign/formula/idempotency/late-Refund tests | Keep events inactive by projection version | XL | Dispute webhook, final Profit |
| 2.5 | Read-model projections and shadow mode | Order/Customer/Offer/org/Money projections, watermarks, mode resolver | 2.2–2.4 quality gates | Repository contract, projection replay, auth tests | Return mock; rebuild projection | XL | User-facing live data |
| 2.6 | Order Workspace shadow then live beta | Live OrderRepository, Evidence adapter, Order activation | 2.5; reviewed mappings | Browser/refresh/deep-link/masking/rollback | Per-Workspace mode to mock | L | Other Workspaces |
| 2.7 | Customer and Offer Workspaces | Live CustomerRepository and OfferRepository | Order stability; identity/mapping coverage | Cross-links, aggregate reconciliation, tenant tests | Individual mode rollback | XL | Mission Control/Money |
| 2.8 | Mission Control and Money | Live MissionControl and Money projections | Prior live projections; fee/refund gates | Aggregate/source reconciliation, badge accuracy | Individual mode rollback | XL | Attribution, final Profit |
| 2.9 | Dispute webhook and historical import | webhook inbox, signature/replay, disputes, chargeback ledger path | Provider signing docs; history mechanism | Signature/replay/order/unmatched/idempotency tests | Disable endpoint/consumer; preserve inbox | L | Unsupported polling, provider mutations |

Phase 2A comprises Sprints 2.0–2.5. Phase 2B begins with 2.6. No sprint may skip the server authorization, evidence, tenant, idempotency or rollback gates to accelerate UI activation.

## Appendix A — Sprint 2.0 implementation

Status: implemented locally for architectural, security and migration review. No provider records, credentials, connections or activation rows were created.

### A.1 Final persistence boundary

Migration `039_commerce_persistence_v1.sql` establishes the provider-neutral ownership chain:

```text
TraceKit Account
  -> TraceKit Organization
    -> Commerce Provider Connection
      -> Commerce Provider Account
        -> Sync / Evidence / Source Mapping / Observed Product records
```

`tracekit_business_contexts` is the Organization-owned classification catalog. Its opaque text key preserves compatibility with the existing persistent-session Business Context IDs; it is not an authorization tenant. `canonical_offers`, `offer_steps` and `offer_variants` are first-class Organization-owned product objects because no equivalent durable hierarchy existed.

### A.2 Existing tables reused and hardened

| Existing object | Sprint 2.0 disposition |
|---|---|
| `tracekit_accounts`, `tracekit_organizations`, `tracekit_users` | Reused as ownership and actor authorities; composite ownership indexes support cross-table tenant FKs. |
| `people` | Retained as the Customer identity spine; gains nullable `organization_id` for additive legacy compatibility and RLS/browser-role denial. |
| `person_identifiers` | Retained unchanged for legacy identity resolution, including its active-value uniqueness and race-recovery contract. Shared contact evidence belongs in `person_source_identities` until the resolver itself is redesigned and separately migrated. |
| `platform_orders` | Retained as the mutable Order snapshot; gains a nullable canonical UUID plus tenant, connection, provenance, provider-fee/net, release, reconciliation and data-quality fields. Currency becomes nullable. Legacy global provider Order-key constraints remain a compatibility boundary. |
| `conversions` | Retained as the append-only financial ledger; gains tenant, connection, source mapping, Evidence, Order, idempotency, reconciliation and quality fields. Its implicit USD default is removed and event vocabulary is expanded additively. |
| `financial_event_matches` | Retained unchanged as the reconciliation decision ledger. |
| `tracekit_audit_events` | Retained as the application audit sink. Sprint 2.1 producers will use the approved commerce event vocabulary below. |

`integration_import_jobs`, `connector_import_tasks` and `integration_import_errors` remain legacy connector runtime structures. Their required date ranges, `workspace_id` ownership and existing state semantics conflict with resumable page-based Commas synchronization, so Sprint 2.0 does not overload them. `commerce_sync_runs` and `commerce_sync_checkpoints` are the canonical provider-neutral sync control plane. A later worker may retain an optional compatibility link to a legacy job, but the legacy job cannot authorize or own commerce records.

`integrations_credentials` is not present in a clean reconstructed database despite legacy code references and is not reused. `integrations_settings` remains a platform-keyed legacy scheduler setting and is not a tenant connection or activation authority.

### A.3 New tables

- `tracekit_business_contexts`
- `commerce_provider_connections`
- `commerce_provider_accounts`
- `commerce_provider_credentials`
- `commerce_sync_runs`
- `commerce_sync_checkpoints`
- `commerce_evidence_records`
- `commerce_source_mappings`
- `canonical_offers`
- `offer_steps`
- `offer_variants`
- `commerce_provider_products`
- `person_source_identities`
- `commerce_repository_activation`

All tenant-bearing relationships use composite Organization/parent foreign keys where ownership could otherwise drift. Provider object uniqueness is connection-scoped, never global.

### A.4 Credential design

Each canonical credential version belongs to one provider Connection. At most one version may be active per Connection, while revoked versions remain as rotation history. It supports either:

- AES-GCM ciphertext with a non-secret encryption key identifier/version and separate IV; or
- a managed-secret reference with no ciphertext in Postgres.

The storage modes are mutually exclusive by constraint. `public_metadata` is protected by bounded recursive metadata validation and cannot contain token, key, credential, payload, contact or payment fields. Credential history restricts Connection deletion instead of cascading away. A database guard prevents credential material from being overwritten in place; the only permitted row update is the active-to-revoked rotation transition. The migration contains no encryption key, secret, provider credential or runtime connection. The existing AES-GCM helper may only be adapted in Sprint 2.1 after it accepts Organization/Connection ownership and never reads the legacy platform-keyed table. Application services must create a new version during rotation, revoke the previous version, and record the audit event.

### A.5 Evidence design

`commerce_evidence_records` implements the approved hybrid contract: immutable protected payload storage remains outside read models; Postgres stores the Sync Run, source key, payload hash, protected storage reference, source/observation/ingestion times, versions, size, PII classification and retention policy. Storage-reference and source/hash uniqueness make evidence replay-safe without storing raw payloads in the migration or normalized tables. A guard rejects mutation and ordinary deletion; the sole permitted update is the one-way `deleted_at` legal-erasure marker. Policy enforcement and protected object storage are Sprint 2.1 prerequisites.

### A.6 Customer source identities

`person_source_identities` binds a Person, Organization, Connection and Provider Account. `provider_customer_id` is unique within its Connection and Provider Account and is the authoritative Commas customer mapping. Email and phone observations may repeat across People and are indexed as supporting evidence, not unconditional merge keys. The legacy `person_identifiers` uniqueness remains unchanged so the current backfill and concurrent-conflict recovery behavior is not silently altered. The source identifier row cannot refer to a Person, Evidence record or provider account from another Organization.

### A.7 Observed Products and mapping

`commerce_provider_products` is an observed provider object, not a canonical Offer. Its immutable provider ID is unique per Connection and Provider Account. Currency is nullable; prices are observations; payment links are represented by a hash or Evidence reference rather than an unnecessary raw URL. Mapping states are `observed`, `proposed`, `review_required`, `approved`, `rejected` and `retired`. Composite hierarchy FKs prevent a mapping from combining a Business Context, Offer, Step or Variant from different branches. An approved mapping requires a reviewed Business Context, canonical Offer and Offer Step. Unknown products therefore fail closed.

Current mapping pointers and `mapping_version` live on the observed Product for the first slice. A versioned mapping-decision history table remains a Sprint 2.1 design gate if audit events alone cannot meet reversible mapping-history requirements.

### A.8 Order and financial compatibility

The migration does not create a competing Order or financial ledger. `platform_orders` remains a compatibility snapshot and `conversions` remains append-only. A nullable `canonical_order_id` UUID aligns generic source mappings and financial events with stable TraceKit identity without changing the legacy bigint storage key. New rows can carry Organization/Connection scope, source mapping and Evidence. `provider_fee` means **Provider-observed fee** and `provider_net` means **Net proceeds**, never Profit. Missing currency remains null; the financial ledger no longer supplies an implicit USD default.

Legacy `platform_orders.platform_order_id` uniqueness remains global through `platform_orders_platform_order_id_key` and `platform_orders_platform_order_id_uidx`; current WowBoost, Shopify and CheckoutChamp/Konnektive upserts use `onConflict: "platform_order_id"`. This is unsafe for providers whose IDs are unique only inside a Connection, but 039 deliberately does not introduce a competing provider-key uniqueness model. Sprint 2.1 should first add a nullable connection-scoped source key, backfill/verify all legacy rows, migrate every writer and conflict target, then replace global uniqueness in a later additive migration only after duplicate analysis. During transition, legacy `onConflict` behavior and existing read paths must remain valid. No Commas Order may be inserted until that gate is resolved. Order Lines and refund/dispute snapshots remain later normalization work.

### A.9 Activation and authorization

`commerce_repository_activation` is unique per Organization and Workspace with modes `mock`, `shadow`, `live_beta` and `live`. Non-mock modes require a same-Organization Connection. The migration inserts no activation rows. Mode resolution must be server-side; a query string, browser storage value or API key can never activate data.

All new tables, plus hardened `people`, `person_identifiers`, `platform_orders` and `conversions`, have RLS enabled. `anon` and `authenticated` have no direct table privileges or policies. `service_role` remains server-only and must be preceded by the TraceKit session authorization gateway. This is intentionally stricter than client-readable membership RLS.

Current WorkOS sessions do not create a constrained Supabase JWT/DB principal. Consequently PostgreSQL cannot yet derive an end-user Organization from `auth.uid()`; application authorization is mandatory and service-role access must stay behind server code. Sprint 2.1 must add server repository tests proving the session Membership Organization is used before any privileged query. RLS is defense in depth, not the only authorization layer.

### A.10 Audit vocabulary

Sprint 2.1 services must write these structured actions to `tracekit_audit_events`, without secrets or payloads:

- `provider_connection.created`, `.updated`, `.disabled`
- `provider_credential.created`, `.rotated`, `.revoked`
- `commerce_sync.started`, `.completed`, `.failed`
- `repository_mode.changed`
- `product_mapping.approved`, `.rejected`

Database triggers do not fabricate actors or permissions; authenticated server services produce the audit records with their existing request correlation ID.

### A.11 Compatibility boundaries and Sprint 2.1 prerequisites

Before a live credential or provider record is stored, Sprint 2.1 must:

1. Choose and configure the protected payload backend and retention/deletion enforcement.
2. Implement Organization-bound credential encryption/decryption or a managed-secret adapter, rotation and audit producers.
3. Resolve the global legacy Order-key constraint with evidence and an additive connection-scoped design.
4. Implement the server authorization gateway for connection, credential, sync and activation operations.
5. Implement atomic Sync Run leases/cancellation/resume semantics and safe error redaction; no Commas normalizer yet.
6. Decide whether Product mapping history requires a dedicated immutable decision table.
7. Define audit producer tests and permission capabilities for connector administration and repository activation.
8. Validate RLS/grants and service-role boundaries against a production-like role configuration.
9. Keep every repository mode `mock`; shadow activation begins only after ingestion and projection code exists.
10. Backfill `tracekit_business_contexts` for existing access IDs and validate `tracekit_business_context_access_context_fk`; until then, the access table remains compatible but cannot define catalog metadata.
11. Implement integrity checks for the polymorphic `commerce_source_mappings.canonical_object_type/canonical_object_id` contract in the transactional normalizer, because PostgreSQL cannot express one FK across several canonical tables.

### A.12 Adversarial migration and compatibility notes

Repository review found no earlier persistent Business Context catalog or canonical Offer/Step/Variant tables. Migration 038 stores only membership access IDs; application-session display metadata is temporarily supplied by the approved mock catalog. Migration 039 therefore establishes the single future catalog and adds an unvalidated FK that enforces all new access grants without breaking already-issued hosted grants. Catalog backfill and FK validation are mandatory before live activation.

Legacy identity resolution assumes `person_identifiers_active_value_uidx`, including recovery from concurrent `23505` conflicts. Migration 039 intentionally preserves that index. Shared household emails and reused phones are represented in the new source-evidence table; changing the legacy resolver is not hidden inside a schema sprint.

The source identity key includes Provider Account because one Connection can represent multiple provider accounts. The canonical key is `(connection_id, provider_account_id, source_object_type, source_object_id)`. The same rule applies to observed Products, provider Customer IDs and financial idempotency.

Alterations to large legacy tables are nullable or use metadata-only constant defaults. New CHECK and FK constraints are added `NOT VALID`, so they protect new writes without scanning all historical rows while holding the migration lock. Unique index creation and the short `ALTER TABLE` operations still require production lock review and a low-traffic migration window. A later migration should validate constraints in controlled batches after legacy-data analysis.

The clean local migration replay and database contract tests cover schema creation, ownership FKs, browser denial, credential shape, durable states/checkpoints, mapping/product identity, shared contact evidence, nullable currency, evidence isolation and zero live activation.
