# TraceKit Identity Model

Status: foundational architecture specification.

## Core Principle

Identity is the foundation of TraceKit.

TraceKit must connect identifiers from affiliate networks, websites, commerce
platforms, CRMs, payment processors, subscription systems, and customer records
without losing source-specific identity.

Identity tells TraceKit who and what belongs together.

## Core Identity Principle

Every Journey should have two deterministic identity anchors whenever possible.

### Commerce Identity

The Commerce Identity represents the commercial transaction across commerce
systems, payment processors, subscriptions, and financial events.

Examples include:

- Commerce Reference Number
- Merchant Order ID
- Invoice Number
- External Reference
- Parent Order Reference
- Subscription ID

These values answer:

> Which commercial transaction does this financial event belong to?

Whenever possible, TraceKit normalizes these values into the canonical Commerce
Identity while preserving every original source identifier.

### Attribution Identity

The Attribution Identity represents the marketing event that introduced or
influenced the customer.

Examples include:

- Everflow Transaction ID
- Click ID
- Voluum Click ID
- Impact Click ID
- Rakuten Click ID
- CJ Click ID
- Google GCLID
- Meta FBCLID
- TikTok TTCLID

These values answer:

> Where did this customer come from?

Whenever possible, TraceKit preserves the original attribution identifier
exactly as received.

### Why Both Matter

Neither identity is sufficient by itself.

Commerce Identity connects:

```text
Commerce
-> Payment Processor
-> Ledger
-> Profit
```

Attribution Identity connects:

```text
Affiliate
-> Campaign
-> Click
-> Journey
-> Customer Acquisition
```

Together they allow TraceKit to connect:

```text
Marketing
-> Commerce
-> Payments
-> Ledger
-> Profit
```

using deterministic identifiers instead of heuristic matching whenever possible.

This is one of TraceKit's primary architectural principles.

## Canonical Identity Objects

| Object | Definition |
| --- | --- |
| Workspace | The tenant boundary for all source data, identities, journeys, and reporting. |
| Person / Customer | A known customer identity assembled from deterministic and audited evidence. |
| Anonymous Visitor | A pre-identification visitor known through TraceKit or browser identifiers. |
| Device | A device-level identity signal observed through tracking, events, or source systems. |
| Browser | A browser-level identity signal, usually tied to cookies or local storage. |
| Session | A bounded period of activity for a visitor, browser, or device. |
| Touchpoint | An immutable marketing, site, referral, or interaction event. |
| Lead | A captured prospect identity or intent signal before purchase. |
| Commerce Order | A source commerce order, upsell, rebill, subscription charge, or related purchase. |
| Payment Transaction | A processor event such as authorization, capture, refund, fee, dispute, or reversal. |
| Subscription | A recurring billing relationship and its related charges. |
| Affiliate Click | An affiliate-network click or transaction identity signal. |
| Journey | The complete acquisition, monetization, payment, ledger, and profit lifecycle. |
| Connector Instance | A configured source-system connection inside a workspace. |

## TraceKit-Owned Identifiers

TraceKit-owned identifiers are generated or assigned by TraceKit and should be
stable across services:

| Identifier | Purpose |
| --- | --- |
| identity_id | Canonical person or customer identity. |
| visitor_id | Anonymous visitor identity. |
| device_id | Device identity. |
| session_id | Session identity. |
| touchpoint_id | Immutable touchpoint identity. |
| journey_id | Canonical Journey identity. |
| order_group_id | Grouping for related base orders, upsells, rebills, and adjustments. |
| connector_id | Connector instance identity. |
| tkid | TraceKit tracking identifier used for deterministic cross-system joins. |

## Source Identifiers To Preserve

TraceKit must preserve every source identifier in raw and normalized forms when
possible. Normalized values support matching. Raw values preserve evidence.

### Customer

| Field | Notes |
| --- | --- |
| source_customer_id | Customer identifier from a source system. |
| email | Original source email. |
| email_normalized | Trimmed and lowercased email for matching. |
| email_hash | Hashed email for privacy-preserving joins where appropriate. |
| phone | Original source phone. |
| phone_normalized | Normalized phone using workspace-supported phone rules. |
| phone_hash | Hashed phone for privacy-preserving joins where appropriate. |

### Commerce

| Field | Notes |
| --- | --- |
| platform_order_id | Source platform order identifier. |
| merchant_order_id | Merchant-facing order identifier. |
| merchant_invoice_id | Invoice identifier used across commerce and payment systems. |
| merchant_custom_reference | Custom reference used for deterministic reconciliation. |
| parent_order_id | Parent order for upsells, rebills, replacements, or adjustments. |
| order_group_id | Grouping identifier across related orders. |
| subscription_id | Subscription or recurring billing identifier. |
| upsell_chain_id | Identifier for ordered upsell/downsell sequences. |

### Payment

| Field | Notes |
| --- | --- |
| processor_transaction_id | Processor transaction, capture, or sale identifier. |
| processor_parent_transaction_id | Parent transaction for refunds, disputes, reversals, or fees. |
| authorization_id | Authorization identifier. |
| capture_id | Capture identifier. |
| refund_id | Refund identifier. |
| dispute_id | Dispute or chargeback identifier. |
| processor_account_id | Merchant, processor, or payment account identifier. |

### Affiliate / Attribution

| Field | Notes |
| --- | --- |
| affiliate_transaction_id | Affiliate network transaction identifier. |
| Everflow transaction ID | Everflow-specific transaction identifier when available. |
| click_id | Click identifier from affiliate or ad systems. |
| affiliate_id | Affiliate identifier. |
| offer_id | Offer identifier. |
| campaign_id | Campaign identifier. |
| source_id | Source, placement, or traffic-source identifier. |
| uid | Affiliate or network user identifier. |
| sub1 through sub10 | Preserved affiliate sub-parameter values. |

### Tracking

| Field | Notes |
| --- | --- |
| tkid | TraceKit tracking identifier. |
| visitor cookie ID | First-party anonymous visitor cookie. |
| session ID | Session identifier from tracking. |
| device ID | Device-level tracking identifier. |
| first-party click IDs | TraceKit or customer-owned click identifiers. |
| external ad click IDs | Click IDs from ad networks and third-party platforms. |

## Identity Rules

1. Never discard a source identifier.
2. Never overwrite the original source value.
3. Store raw and normalized forms.
4. Identity relationships must be auditable.
5. Exact identifiers outrank heuristic matching.
6. Email alone is never sufficient to link an order or payment automatically.
7. Ambiguous matches remain unresolved.
8. Identity merges must preserve all prior anonymous histories.
9. Identity splits and corrections must be reversible and audited.
10. Missing joins must not block ingestion.

## Deterministic Reconciliation Priority

TraceKit should use the strongest available evidence first:

| Priority | Evidence |
| --- | --- |
| 1 | Shared TraceKit ID. |
| 2 | Exact source transaction ID. |
| 3 | Exact merchant order, invoice, or custom reference. |
| 4 | Exact parent-child reference. |
| 5 | Exact customer or platform ID. |
| 6 | Normalized email + amount + currency + bounded time window. |
| 7 | Normalized phone + amount + currency + bounded time window. |
| 8 | Manual review. |

## Match Evidence Fields

Every automatic or manual match should be explainable with structured evidence:

| Field | Meaning |
| --- | --- |
| match_status | Current state, such as matched, unmatched, ambiguous, or manually_reviewed. |
| match_method | Matching method used. |
| match_confidence | Numeric confidence score. |
| match_reason | Human-readable explanation. |
| matched_source_type | Source type matched against. |
| matched_source_id | Source identifier matched against. |
| candidate_count | Number of qualifying candidates. |
| matched_at | Timestamp of the match decision. |
| matched_by | System, service, or user that made the decision. |
| manually_overridden | Whether a user overrode an automatic result. |
| evidence JSON | Raw structured match evidence and candidate details. |

## Confidence Principles

| Confidence | Meaning |
| --- | --- |
| 100 | Deterministic shared identifier. |
| 95 | Exact processor or source transaction identifier. |
| 90-100 | Exact merchant reference. |
| 80-89 | Strong composite match. |
| Below 80 | No automatic linking. |
| Multiple valid candidates | Ambiguous, no automatic linking. |

## Parent-Child Identity

One customer or funnel may produce:

- Base order
- Upsell
- Downsell
- Add-on
- Warranty
- Subscription
- Rebill
- Replacement order

Each remains a separate order and payment, but may share:

- order_group_id
- journey_id
- parent_order_id
- upsell_chain_id
- subscription_id

## Transaction Roles

Transaction roles describe how a commerce or payment event participates in the
customer lifecycle:

| Role | Meaning |
| --- | --- |
| base | Initial purchase in a Journey or order group. |
| upsell | Additional purchase offered after the base order. |
| downsell | Lower-priced follow-up purchase. |
| addon | Add-on product or service. |
| warranty | Warranty or protection purchase. |
| subscription | Initial subscription purchase. |
| rebill | Recurring subscription charge. |
| renewal | Renewal event for a subscription or service. |
| replacement | Replacement order. |
| adjustment | Non-order correction or financial adjustment. |

## Connector Requirements

Every connector must map available source identifiers into canonical identity
fields.

Every connector must preserve:

- Raw source payload
- Source system
- Connector instance
- Ingestion method
- Original timestamps

Connectors must not require perfect identity evidence before ingestion. Missing
joins create unresolved records, not dropped records.

## Connector Identity Requirements

Every connector should expose deterministic identities whenever available.

### Commerce Connectors

Must preserve:

- Commerce Reference
- Merchant Order ID
- Parent Order ID
- Subscription ID
- Customer ID

### Tracking Connectors

Must preserve:

- Transaction ID
- Click ID
- Affiliate ID
- Campaign ID
- Offer ID
- Source ID
- Sub IDs
- External click identifiers

### Payment Processors

Must preserve:

- Processor Transaction ID
- Parent Transaction ID
- Commerce Reference
- Invoice Number
- Custom Reference
- Authorization ID
- Capture ID
- Refund ID
- Dispute ID

Whenever two systems share the same deterministic identifier, TraceKit should
prefer that relationship over heuristic matching.

## Future-State Onboarding Behavior

TraceKit setup should encourage or require deterministic cross-system
identifiers wherever platforms support them.

Examples:

- Save Everflow transaction ID on the commerce order.
- Pass merchant order or Journey reference into PayPal.
- Save PayPal capture or transaction ID back onto the commerce order.
- Preserve parent order and upsell relationships.
- Validate identity mappings with a test order.

## Future-State Identity Health

TraceKit should eventually score identity completeness for each integration and
workspace. Example signals include:

| Signal | Why It Matters |
| --- | --- |
| merchant order ID present | Supports commerce and payment reconciliation. |
| customer identity present | Supports customer-level Journey assembly. |
| processor transaction ID present | Supports fee, refund, and dispute attachment. |
| affiliate transaction ID present | Supports affiliate attribution and payout validation. |
| parent order present | Supports upsell, rebill, and adjustment hierarchy. |
| Journey ID present | Supports deterministic lifecycle grouping. |
| subscription ID present | Supports recurring revenue and lifecycle analysis. |

## Closing Principle

Identity tells TraceKit who and what belongs together.
