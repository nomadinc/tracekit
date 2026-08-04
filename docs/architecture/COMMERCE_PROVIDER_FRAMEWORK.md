# TraceKit Commerce Provider Framework

**Version:** 1.0
**Status:** Approved Foundation Draft

## 1. Purpose

This document defines the reusable boundary through which commerce-platform data enters TraceKit, becomes canonical product data, and is exposed through permission-aware repositories to Mission Control and the production Workspaces.

The framework is provider-neutral. Commas is the first implementation target and the first concrete mapping example. Shopify, Checkout Champ, Konnektive, WooCommerce, Next29, and Sticky.io must be able to implement the same contract without changing Workspace product types or UI behavior.

The permanent flow is:

```text
Commerce Platform
  -> Provider Adapter
  -> Raw Provider Records
  -> Normalizer
  -> Canonical TraceKit Objects
  -> Repositories / Read Models
  -> Mission Control and Workspaces
```

Provider schemas end at the normalization boundary. Provider IDs are source mappings, never TraceKit's primary product identity.

## 2. Scope

This foundation covers read-only commerce ingestion; provider connections; products, customers, orders, transactions, refunds, disputes, chargebacks, subscriptions, and rebills; mapping provider products into TraceKit's Offer hierarchy; evidence and reconciliation; durable synchronization; and the read-model inputs needed by Mission Control, Offer, Customer, Order, and Money.

## 3. Non-Goals

This document does not define a detailed Commas API reference, implement a connector, select storage schemas, enable live repositories, or authorize writes back to a provider. The first Commas slice excludes customer and order updates, payment capture, TraceKit-initiated refunds, product creation, and inventory updates. Production Intelligence and physical-fulfillment capabilities are also outside this slice.

## 4. Supported Provider Families

| Family | Providers | Framework role |
|---|---|---|
| Commerce | Commas, Shopify, Checkout Champ, Konnektive, WooCommerce, Next29, Sticky.io | Products, customers, orders, commercial adjustments, subscriptions |
| Payments / PayFacs | Stripe, Shopify Payments, PayPal, NMI | Authoritative payment lifecycle, fees, refunds, disputes, settlements |
| Attribution | Everflow, ClickGo, Meta Ads, Google Ads, TikTok Ads, Microsoft Ads, Taboola, Outbrain | Touchpoints, identifiers, traffic cost, attribution evidence |

Checkout Champ and Konnektive share a technology family, but remain separately configured adapters. Their credentials, provider accounts, capability checks, source mappings, sync state, and evidence must not be conflated.

## 5. Commerce Provider Responsibilities

A commerce provider supplies commercial facts from its own system of record. An adapter must discover supported capabilities, validate read-only access, retrieve source objects completely, preserve source timestamps and identities, normalize provider errors, and hand immutable retrieval results to the raw-record boundary.

The provider is not responsible for TraceKit tenant authorization, canonical identity, Offer hierarchy decisions, cross-provider reconciliation, Profit calculation, Workspace presentation, or final attribution conclusions.

## 6. Provider Adapter Contract

Every adapter implements the same conceptual capabilities, with unsupported capabilities reported explicitly:

| Capability | Contract |
|---|---|
| Connection validation | Authenticate server-side and return account identity, scopes, capabilities, and safe diagnostics |
| Account discovery | Resolve the provider account without treating it as a TraceKit tenant |
| Product sync | Page through immutable provider product identities and mutable product snapshots |
| Customer sync | Page through customer snapshots and identifiers with sensitivity classifications |
| Order sync | Retrieve orders, lines, totals, discounts, tax, statuses, and source relationships |
| Transaction sync | Retrieve payment events and provider transaction identities when available |
| Refund/dispute sync | Retrieve lifecycle events without overwriting prior financial facts |
| Subscription sync | Retrieve subscription and rebill records when supported |
| Checkpointing | Return a documented cursor or timestamp checkpoint and source high-water mark |
| Evidence | Produce source references, payload hashes, timestamps, and normalization diagnostics |

Adapter responses use a provider-neutral envelope containing provider key, provider account ID, source object type, source object ID, source timestamps, retrieval timestamp, cursor metadata, payload hash, and an opaque raw-record reference. The provider payload itself does not become a canonical product type.

## 7. Authentication Boundary

Credentials are stored encrypted and server-side only. Connection administration requires an authenticated TraceKit session, active membership, Organization access, and the appropriate connector capability. Provider account discovery never grants TraceKit Organization access.

The browser receives only safe connection status and capability summaries. It never receives API keys, passwords, tokens, provider secrets, service-role credentials, or raw authentication responses. Credential creation, testing, rotation, and revocation produce audit events.

## 8. Raw Record Boundary

A Raw Provider Record is an immutable ingestion artifact or immutable reference to one. It preserves what the adapter observed before product normalization. It is Organization-bound and records the connection, provider account, object type, object ID, source timestamps, retrieval timestamp, payload hash, sync run, schema version, and retention classification.

Raw records are evidence, not Workspace read models. Raw payload access remains behind the Evidence boundary, permissions, redaction, and retention policy. A provider may issue a changed snapshot for the same source object; TraceKit records the new observation and updates the canonical projection without rewriting historical events.

## 9. Normalization Pipeline

```text
authorized connection
  -> fetch page
  -> validate envelope and source identity
  -> persist raw observation/evidence
  -> normalize provider fields
  -> resolve Organization and provider account mapping
  -> resolve product/Offer configuration
  -> idempotently upsert canonical snapshots
  -> append lifecycle and financial events
  -> reconcile relationships
  -> refresh materialized/read-model projections
```

Normalization is deterministic for a given raw record, normalization version, mapping version, and configuration version. Failed normalization never silently drops a source record; it creates a reviewable Connector Error and preserves the evidence required to replay it.

## 10. Canonical Commerce Objects

| Object | Canonical responsibility |
|---|---|
| Commerce Provider Connection | Organization-bound, encrypted configuration and capability state |
| Provider Account | Provider-native account or store identity reached through a connection |
| Provider Product | Immutable provider product identity plus versioned descriptive snapshots |
| Canonical Offer | TraceKit commercial proposition, independent of provider product count |
| Offer Step | Ordered or role-based position in an Offer's commercial journey |
| Offer Variant | A price, discount, creative, or funnel-version variation of an Offer Step |
| Product Mapping | Versioned relationship from Provider Product to Business Context, Offer, Step, and Variant |
| Customer | Organization-owned person/customer projection with source mappings |
| Customer Identifier | Typed, provenance-bearing identifier with sensitivity and confidence |
| Order | Organization-owned commercial transaction aggregate |
| Order Line | Quantity and commercial terms for a canonical/provider product on an Order |
| Transaction | Provider/payment transaction observation linked to an Order where proven |
| Refund | Append-only refund lifecycle fact and affected amounts/lines when available |
| Dispute | Provider dispute lifecycle and evidence, distinct from its financial effect |
| Chargeback | Financial loss/recovery event resulting from a dispute or processor event |
| Subscription | Recurring commercial agreement and current mutable projection |
| Rebill | A discrete renewal charge/order event; never only a subscription counter |
| Financial Event | Append-only signed ledger event with currency and reconciliation state |
| Evidence Record | Immutable provenance for an observed or derived conclusion |
| Sync Run | Durable attempt, checkpoint, counts, timings, status, and diagnostics |
| Connector Error | Classified, bounded, retryable or review-required failure record |

Each object distinguishes the internal opaque Canonical TraceKit ID from Provider object ID, Provider account ID, source-system external ID, Business Context ID, and Organization ID. Only the TraceKit ID is canonical across providers.

## 11. Offer Hierarchy

```text
Organization
  -> Business Context
    -> Canonical Offer
      -> Offer Step
        -> Offer Variant
          -> Provider Product
```

- **Organization** is the immutable tenant owner of every canonical and source-mapping record.
- **Business Context** is the active business/Offer scope used by the shell. For the first customer, the configured business identities are Push Button Systems and CashMyButton.
- **Canonical Offer** is a commercial proposition that can span provider products and funnel versions.
- **Offer Step** expresses commercial role: Front End, Order Bump, Upsell, Downsell, Subscription, Trial, or Renewal.
- **Offer Variant** captures Standard, Discount 1, Discount 2, alternate creative/funnel version, or price variation without inventing a new top-level Offer.
- **Provider Product** is the immutable Commas or other provider product identity and its mutable descriptive snapshots.

Not every provider product is a top-level TraceKit Offer.

## 12. Offer Step Model

An Offer Step has a canonical ID, Offer ID, role, optional sequence, status, and applicability dates. Sequence is meaningful within an Offer or funnel version, not globally. Front End normally uses sequence `0`; order bumps may be unordered or explicitly sequenced; OTO upsells use positive sequence numbers. A Downsell may be a step when it changes the proposition, or a Variant when it is the same step at a discounted price. Configuration decides; naming alone proposes.

## 13. Offer Variant Model

An Offer Variant belongs to an Offer Step and records kind, sequence, funnel-version key, pricing characteristics, and active period. Variants allow the same Canonical Offer to represent multiple provider configurations without collapsing different commercial paths. A Provider Product may map to more than one funnel-version placement when the provider genuinely reuses it; each mapping retains its own provenance and validity interval.

## 14. Product Model

Canonical Product describes what was sold. Provider Product describes how a provider identifies it. A Product can participate in multiple Offers or steps; an Offer Step can be fulfilled by multiple Products. Product name, internal name, price, and status are mutable descriptive snapshots. Provider product ID is immutable within a provider account and is the source mapping key, not the Product primary key.

## 15. Customer Model

A provider customer maps into an Organization-owned TraceKit Customer through an explicit source mapping. Email, phone, and other personal identifiers are sensitive and permission-gated. Matching across funnels or provider accounts must use approved identity-resolution evidence; matching email alone is not unquestioned proof. Conflicts remain reviewable and must not merge tenant boundaries.

## 16. Order Model

An Order is the canonical commercial aggregate for a purchase attempt or completed purchase. It retains provider order/transaction mappings, Customer, Business Context, Offer, lines, gross amount, discounts, tax, commercial shipping charge if present, currency, status, event time, ingestion time, and reconciliation state. Order Lines resolve Provider Products through the mapping version effective at the event time.

## 17. Refund Model

A Refund is an append-only lifecycle fact linked to an Order, Transaction, and affected lines when the provider supplies those relationships. Partial refunds remain partial. Later updates change a mutable refund projection while preserving each observed event. Refund amounts become signed Financial Events only from authoritative provider semantics.

## 18. Dispute / Chargeback Model

Dispute is the case lifecycle; Chargeback is a financial event or state arising from that case. TraceKit preserves dispute opened, updated, won, lost, reversed, fee, and recovery facts separately where the provider exposes them. A provider label is never converted to a chargeback amount without validated semantics.

## 19. Subscription and Rebill Model

Subscription represents the agreement, cadence, status, trial terms, and provider identity. Each rebill is modeled as a discrete Order/Transaction/Financial Event when source evidence supports it. Initial sale, trial authorization, renewal, failed rebill, cancellation, refund, and recovery remain distinct. Unknown Commas subscription semantics are discovery items, not assumptions.

## 20. Digital versus Physical Fulfillment

The first Commas businesses sell digital information products. Their Business Context configuration declares physical fulfillment not applicable. Shipment status, carrier, packaging, physical shipping cost, and tracking are therefore absent—not unhealthy or zero-valued evidence—unless the source explicitly records a commercial shipping charge.

Order and Money read models emphasize gross revenue, discounts, taxes, refunds, disputes, chargebacks, processor fees, affiliate costs, configured product costs, and Net Profit. Digital fulfillment may become a separate capability later. The UI must not emit physical-shipping warnings for a digital-only context.

## 21. Business Context Mapping

Every provider connection belongs to one Organization. Provider records are assigned to a Business Context only through an authorized, versioned mapping. The initial configured contexts are Push Button Systems and CashMyButton. Provider prefixes, funnel metadata, account boundaries, or explicit product mappings may help resolve them, but no browser-supplied context ID grants scope.

An unresolved or conflicting context fails closed into `review_required`. It is not broadened to the whole Organization.

## 22. Product Mapping Rules

Mapping precedence is:

1. Explicit Provider Product ID mapping.
2. Explicit provider/pattern override.
3. Configured naming inference.
4. Review-required fallback.

Rules:

- Source row order is never authoritative.
- Provider Product ID is immutable; names are descriptive metadata.
- `MAIN` proposes `front_end`; `OB` proposes `order_bump`; `OTO1`–`OTO4` propose sequenced upsells; `DS1` and `DS2` propose discount variants.
- A shared main Product ID across funnel versions does not create duplicate Canonical Offers.
- Different upsell sets remain associated with their configured Business Context, Offer Step, Variant, and funnel version.
- Reused products may have multiple placements if supported by source evidence/configuration.
- Every accepted mapping records provider provenance, mapping source, confidence, reviewer where applicable, and mapping version.

## 23. Naming-Convention Inference

Inference tokenizes configured fields such as provider internal name without assuming a universal provider grammar. Matching is case-normalized and anchored to configured delimiters. It yields a proposal with parsed prefix, step token, variant token, confidence, and warnings.

The supplied `products-2026-07-30.xlsx` contains 16 product records with columns including Product, Internal Name, Type, Product ID, Price, and billing fields. Its observed `GR` family includes one base `GR` record, four `GR -> OB` records, OTO1–OTO4 records, and DS1/DS2 variants. This supports the illustrative token grammar. It does **not** establish CashMyButton mappings, cross-version reuse, authoritative sequence by row position, or a complete Commas API contract.

Unknown, ambiguous, or conflicting tokens require review. Inference never silently overwrites an explicit mapping.

## 24. Configuration Overrides

Illustrative provider-neutral configuration (not production code):

```yaml
business_contexts:
  push-button-systems:
    provider_prefixes:
      - GR

offer_steps:
  MAIN:
    role: front_end
    sequence: 0
  OB:
    role: order_bump
  OTO1:
    role: upsell
    sequence: 1

variants:
  DS1:
    kind: discount
    sequence: 1
  DS2:
    kind: discount
    sequence: 2

explicit_product_mappings:
  provider-product-opaque-id:
    business_context: push-button-systems
    canonical_offer: configured-offer-id
    offer_step: configured-step-id
    variant: configured-variant-id
```

Configuration is Organization-bound, versioned, auditable, validated before activation, and replayable. Changing it creates a new mapping version and a controlled renormalization/reconciliation job; it does not rewrite evidence.

## 25. Provenance and Evidence

Every normalized record preserves provider, provider account, source object type, source object ID, source payload hash, source created/updated timestamps, ingestion timestamp, Sync Run, normalization version, mapping version, and reconciliation state. Derived relationships also record their rule/configuration and supporting Evidence IDs.

Product read models expose conclusions and safe source summaries. Raw evidence remains progressively disclosed behind the Evidence boundary and relevant sensitive-data permission.

## 26. Mutable Snapshots versus Append-Only Events

Mutable projections answer current questions: product name/status, customer profile, order status, subscription status, current mapping, and current reconciliation result. Append-only records answer what happened: raw observations, transactions, refund/dispute lifecycle, financial events, mapping decisions, sync attempts, and audit events.

A new source observation may update a projection. It must not erase the event or evidence that produced the prior state.

## 27. Idempotency and Source Mapping

The minimum source identity is `(organization_id, connection_id, provider_account_id, source_object_type, source_object_id)`. Upserts use this stable key plus provider version/update marker or payload hash. Financial and lifecycle events additionally require an event-specific stable idempotency key.

Retries, overlapping windows, duplicate pages, and webhook/poll overlap must converge. Conflicting source identities create a Connector Error rather than cross-linking records heuristically.

## 28. Pagination and Incremental Sync

Each object domain owns durable sync state: cursor/token, source high-water timestamp, last successful page, overlap window, counts, and last error. The adapter must document whether cursors are stable, whether sorting is deterministic, and which source timestamp supports incremental filtering.

Incremental polling uses overlap windows to catch late updates. Deduplication relies on source identity and hashes, never on page position. A failed page can resume independently without marking later state complete.

## 29. Rate Limits and Retry Behavior

Adapters classify errors as transient, permanent, authentication, rate-limit, data-quality, or blocking. Retries use bounded exponential backoff with jitter and provider `Retry-After` guidance. Jobs have maximum attempts, durable next-run time, and circuit-breaking for invalid credentials or repeated provider failures. Rate limits are enforced per connection/provider account and must prevent one tenant from exhausting another's capacity.

## 30. Backfill Strategy

The initial backfill runs by domain and bounded time/page ranges. Products precede transaction normalization so mappings can be reviewed. Customers and transactions can be staged while unresolved mappings remain quarantined. Refunds and disputes overlap the transaction window and may extend later because their event time can follow the sale.

Backfills are restartable, observable, idempotent, and repairable. Completion means pagination and reconciliation checks passed, not merely that an HTTP request returned successfully.

## 31. Webhook Strategy

Webhooks are optional accelerators for freshness, not the sole source of truth. Future webhook ingestion must verify signatures, bind endpoints to a server-resolved connection, preserve delivery identity, deduplicate deliveries, and enqueue normalization. Polling/backfill remains authoritative for recovery, missed delivery repair, and historical reconciliation.

## 32. Reconciliation

Reconciliation compares normalized commerce facts with payment, attribution, and configured cost evidence. States include at least Pending, Matched, Conflict, Estimated, and Reconciled. Monetary values preserve currency, sign, source, event time, and reconciliation state.

TraceKit must not fabricate processor fees, COGS, affiliate cost, tax, or shipping cost. Missing authoritative data stays unavailable or Estimated under an approved method. Reconciliation decisions and overrides are append-only and auditable.

## 33. Repository Contracts

```text
Workspace
  -> Repository interface
    -> Mock Repository
    -> Live Read-Model Repository
```

The adapter writes normalized data; it is never the Workspace repository. Live repositories enforce authenticated Organization scope, Business Context access, permissions, sensitive/financial visibility, and object scope before returning serializable read models. Mock and live implementations conform to the same production use cases without sharing provider schemas.

## 34. Mission Control Read Models

Mission Control consumes Organization- and Business Context-scoped summaries: revenue/Profit state, orders/customers, trend points, top traffic sources, attention items, recent changes, connector freshness, and reconciliation confidence. It must expose freshness or missing-source limitations and deep-link by canonical IDs.

## 35. Offer Workspace Read Models

Offer read models aggregate Canonical Offer, Steps, Variants, mapped Provider Products, commercial performance, traffic sources, Profit drivers, customer quality, significant events, comparison metrics, and Evidence IDs. Provider-specific product naming is supporting context, not the primary hierarchy.

## 36. Customer Workspace Read Models

Customer read models combine the canonical Customer, identifiers, Order history, Offer relationships, journey evidence, refunds/disputes, tracking health, and sensitive-data masking. Commerce supplies purchase facts; it does not independently decide cross-provider identity or attribution.

## 37. Order Workspace Read Models

Order read models expose commercial composition, lines by Offer Step/Variant, discounts, taxes, payment/refund/dispute lifecycle, Profit ledger, related Customer/Offer, attribution, timeline, and evidence. Digital contexts omit inapplicable physical-fulfillment diagnostics. Financial rows retain Estimated/Reconciled state and source lineage.

## 38. Money Workspace Read Models

Money read models consume append-only Financial Events and current reconciliation decisions, not commerce totals alone. They show sales, refunds, chargebacks, fees, configured costs, and missing/unreconciled sources by Organization and Business Context. Commerce-provider revenue is operational until authoritative payment and cost evidence supports Reconciled Profit.

## 39. Error Handling

Connector errors are durable, classified, bounded, and linked to connection, Sync Run, object/page, and safe diagnostics. A single malformed record does not erase a successful page, and partial success is explicit. Authentication failures pause the connection; mapping ambiguity requests review; transient failures retry; permanent schema/capability failures block affected domains. User-facing errors never expose credentials, raw payloads, or provider internals unnecessarily.

## 40. Tenant and Organization Scope

Every connection, raw record, source mapping, canonical object, event, evidence record, Sync Run, and error has immutable Organization ownership. Active Organization and Business Context are resolved through the server authorization gateway. Caller-controlled Organization, workspace, provider account, or context identifiers never authorize access.

Agency access requires an active Agency membership and assignment to the client Organization. Cross-tenant reads fail without revealing object existence. RLS is defense in depth; application authorization remains mandatory.

## 41. Sensitive Data

Customer email, phone, addresses, provider customer identifiers, payment references, and raw payloads are classified and minimized. Sensitive fields are encrypted or protected as appropriate, masked in read models without permission, excluded from URLs, and accessed through auditable server paths. Card, bank, credential, token, or authentication secrets do not belong in canonical metadata or audit payloads.

Retention and deletion must distinguish legal/financial evidence from removable profile data and provider raw payloads. Those policies remain an open database decision.

## 42. Audit and Observability

Audit events cover connection create/test/update/disable, credential rotation, mapping approve/change, sync start/pause/resume/complete/fail, backfill, replay, and sensitive/financial access decisions. Operational telemetry includes lag, source high-water mark, pages/records, retry count, rate-limit state, error class, mapping-review count, normalization version, and read-model freshness.

Logs redact credentials, tokens, raw customer payloads, and sensitive identifiers. Correlation IDs connect authorization, Sync Run, raw observation, normalization, and repository refresh.

## 43. Connector Maturity States

| State | Exit evidence |
|---|---|
| Planned | Provider priority and accountable owner |
| Discovery | Auth, capabilities, pagination, limits, and sample schemas documented |
| Adapter Alpha | Read-only retrieval and raw evidence validated |
| Normalization Alpha | Canonical mappings and replay tests validated |
| Read-Only Beta | Tenant-scoped backfill/polling and repository slice validated |
| Production Beta | Operational controls, security review, reconciliation, and customer validation |
| Production | Reliability objectives, recovery, support, and change management met |
| Deprecated | Replacement/retention plan and disabled onboarding |

Work is also classified as **Existing Integration Migration**, **New Adapter**, or **New Capability**. Existing repository support for Shopify, Checkout Champ/Konnektive, PayPal, and NMI is evidence to migrate behind this contract; it is not proof that those connectors already meet every maturity exit criterion.

## 44. Provider Onboarding Workflow

1. Approve provider priority and tenant use case.
2. Document auth, accounts, scopes, domains, pagination, rate limits, timestamps, and webhooks.
3. Obtain schema-only samples and synthetic fixtures; classify sensitive fields.
4. Define capability matrix and source identities.
5. Implement adapter retrieval and connection test.
6. Validate raw-record/evidence persistence and replay.
7. Define canonical normalization and mapping rules.
8. Review unknown/ambiguous mappings with product/domain owners.
9. Validate idempotent backfill, incremental sync, retries, and recovery.
10. Activate live read-model repositories behind authorization and feature controls.
11. Validate Workspace, financial, tenant-isolation, and observability acceptance criteria.
12. Advance maturity only with recorded evidence.

The product lifecycle remains Connected -> Initial Import Complete -> Automatic Sync Enabled -> Dashboard Ready. Each gate is explicit and reversible.

## 45. Commas First Vertical Slice

### Source domains

The initial discovery contract covers Products, Customers, Transactions, Refunds, and Disputes:

```text
Commas Product      -> Provider Product -> Canonical Offer / Step / Variant mapping
Commas Customer     -> TraceKit Customer
Commas Transaction  -> TraceKit Order + Order Lines (+ Transaction when evidenced)
Commas Refund       -> Refund + Financial Event
Commas Dispute      -> Dispute / Chargeback + Financial Event
```

### Alpha sequence

1. Authenticate to Commas and validate read-only credentials.
2. Sync Products.
3. Generate and review proposed Product mappings.
4. Sync Customers and Transactions.
5. Sync Refunds and Disputes.
6. Normalize canonical objects.
7. Persist source mappings and Evidence.
8. Reconcile relationships and financial state.
9. Serve production read-model repositories.
10. Render Mission Control and approved Offer, Customer, Order, and Money views.

The slice supports Push Button Systems, CashMyButton, multiple funnel versions, shared main Product IDs, differing upsell variants, digital-only fulfillment, and high transaction volume—but each behavior must be validated against actual Commas source metadata or explicit reviewed configuration.

What remains mocked until its source is activated includes attribution/media facts not provided by Commas, processor fees not authoritatively available, affiliate costs without a verified source, configured COGS, and Intelligence.

## 46. Future Providers

Commerce implementation order is Commas, Shopify, Checkout Champ, Konnektive, WooCommerce, Next29, then Sticky.io. Shopify's existing normalization, Checkout Champ/Konnektive compatibility, and existing payment work should be migrated to the canonical objects and durable runtime rather than copied into Workspace-specific paths.

Payments/PayFac integrations remain complementary: Stripe, Shopify Payments, PayPal, and NMI can reconcile commerce Transactions and Financial Events but do not replace commerce product/order semantics. Attribution providers likewise enrich journeys and costs without becoming commerce repositories.

Provider-specific extensions are allowed only behind adapter capability metadata, raw evidence, and normalization modules. They must not add provider fields directly to shared Workspace types.

## 47. Open Decisions

The following require provider documentation, safe sample responses, or implementation discovery:

- Exact Commas authentication and pagination semantics.
- Commas rate limits and retry guidance.
- Supported incremental filtering fields and timestamp guarantees.
- Availability of product-to-funnel source metadata.
- Whether Transactions expose funnel or payment-link identifiers.
- Subscription, trial, and rebill representation.
- Refund and dispute update semantics and authoritative event timestamps.
- Processor-fee availability and authority.
- Product COGS availability.
- Whether cash or digital-fulfillment events exist.
- Whether multiple Provider Accounts can or should belong to one Organization connection.
- Approved rules for merging Customers across funnels/provider accounts.
- Representation of shared Product IDs across funnel variants when source metadata is incomplete.
- Whether Offer Variant becomes a first-class database object in the first slice.
- Whether an Offer Downsell is a distinct Step or a Variant for each observed Commas pattern.
- Raw-record retention, erasure, and reprocessing windows by sensitivity class.
- Read-model freshness objectives and high-volume backfill thresholds.

Until resolved, adapters report unsupported or review-required states. They do not infer production truth from naming, row order, or display metadata alone.
