# WS-008 M6 — 29Next Subscription Ingestion & Rebill Reconciliation

Status: REVIEW

## Scope

M6 connects the stable 29Next subscription read surface to the provider-neutral subscription model introduced in M5.

Implemented:
- subscription list/detail reads through the existing 29Next client
- cursor pagination using the same origin/path validation as order reads
- bounded historical subscription ingestion (default 3 pages / 100 subscriptions; hard maximum 25 pages / 500 subscriptions)
- immutable full-detail subscription evidence before normalized persistence
- canonical subscription and subscription-line persistence contracts
- source-mapping identity for subscriptions
- renewal-order reconciliation against already-ingested canonical 29Next orders
- unresolved renewal orders retained as pending links rather than guessed or discarded
- durable checkpoints and resume cursors
- fail-closed list/detail identity validation

## Explicitly not activated

M6 does not add or activate:
- subscription webhooks
- scheduled/continuous subscription polling
- retry-payment or payment mutation behavior
- subscription cancellation/pause mutations
- provider-specific schema outside the existing provider-neutral tables
- Shopify, Everflow, or Commas runtime changes

## Persistence order

For each subscription detail:
1. immutable evidence
2. provider source mapping
3. canonical subscription
4. subscription lines
5. resolve each renewal order against the existing order source/canonical mapping
6. persist subscription-order links, including unresolved `pending_order` links

This preserves evidence and rebill lineage even when an order has not yet arrived in the order ingestion stream.

## Review gate

Run the complete M2–M6 29Next regression set locally. M6 remains REVIEW until the dedicated test suite is green.
