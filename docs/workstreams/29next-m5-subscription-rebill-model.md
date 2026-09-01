# WS-008 M5 — 29Next Subscription & Rebill Model

Status: REVIEW pending isolated local test gate and migration coordination.

## Scope

M5 introduces the provider-neutral canonical subscription lifecycle needed by 29Next without activating subscription polling, webhooks, scheduler jobs, or production ingestion.

29Next stable Admin API documentation establishes subscription lifecycle states `active`, `past_due`, `canceled`, `retrying`, and `paused`, plus recurrence interval/count, next renewal date, recurring total/currency, subscription lines, customer identity, attribution, and renewal-order links carrying `billing_cycle` and `order_number`.

## Canonical model

Migration `097_commerce_subscriptions_v1.sql` adds:

- `commerce_subscriptions`
- `commerce_subscription_lines`
- `commerce_subscription_order_links`

The schema is provider-neutral. It scopes every subscription to organization, connection, and provider account and keeps browser roles revoked. No scheduler or queue activation is present.

`commerce_subscription_order_links` deliberately retains both the provider order identity and an optional canonical order UUID. This allows renewal lineage to be captured as soon as the subscription is observed and reconciled to the canonical order after that order is ingested, without inventing an order relationship.

## 29Next normalization

`api/src/connectors/next29/subscription.ts` maps only documented subscription fields into the canonical model:

- durable subscription ID and customer ID
- lifecycle status
- recurring amount and currency
- `day` / `month` interval plus interval count
- next renewal and creation timestamps
- bounded cancellation reason and payment-method label
- durable subscription lines with product/variant IDs, SKU, quantity, and recurring unit amount
- renewal order numbers and billing-cycle positions
- allowlisted attribution keys plus structured attribution metadata

IP address, user-agent, email, raw payment details, and arbitrary undocumented fields are not promoted into the canonical subscription object.

## Rebill lineage

Renewal orders use a deterministic linkage identity:

`next29:{provider_subscription_id}:order:{provider_order_id}`

The billing-cycle number is retained as evidence but never used by itself as an order identity.

## Coordination

M1 identified shared schema as a coordination-required surface. The active `workstream/shopify-m5` comparison currently contains no migration changes, so there is no observed Shopify migration collision at this checkpoint. Migration `097` must still be rechecked against the merge target immediately before integration because other TraceKit workstreams can advance shared migrations independently.

## Explicitly deferred

- subscriptions API client/list/detail ingestion
- subscription evidence storage and source mapping
- historical subscription backfill
- webhook subscription lifecycle updates
- scheduled subscription verification
- retry/payment mutation endpoints
- production activation

These belong to subsequent milestones after the canonical model passes its regression gate.
