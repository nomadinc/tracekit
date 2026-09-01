# WS-008 M8 — 29Next Disputes & Chargebacks Canonical Ingestion

Status: REVIEW pending dedicated local regression gate.

## Scope

M8 adds read-only 29Next dispute ingestion and canonical lifecycle handling. It does not register webhooks, activate a scheduler, mutate disputes, submit evidence, or perform any provider write action.

## 29Next source contract

The stable Admin API exposes:

- `GET /disputes/`
- `GET /disputes/{id}/`
- OAuth scope `disputes:read`
- dispute types `alert` and `chargeback`
- lifecycle statuses `new`, `open`, and `resolved`
- durable provider references for order and transaction
- amount/currency, ARN, case number, dispute dates, resolution and resolution detail

Historical ingestion uses list pagination but retrieves full dispute detail before normalization.

## Bounded historical ingestion

The dispute backfill uses the same safety envelope as order and subscription backfills:

- default: 3 pages / 100 disputes
- hard maximum: 25 pages / 500 disputes
- durable cursor checkpoint
- full detail identity must match list identity
- immutable evidence before canonical persistence
- failures mark the run failed rather than partially inventing canonical state

## Canonical persistence

TraceKit already has provider-neutral dispute infrastructure (`commerce_provider_disputes` and `commerce_provider_dispute_lifecycle_events`). M8 does not create a 29Next-specific dispute table.

Historical API ingestion requires provenance that is not a webhook event. The additive compatibility migration `20260901060000_generalize_commerce_dispute_observations.sql` therefore adds `commerce_provider_dispute_observations` and allows either an API observation or an existing webhook event to prove the current dispute/lifecycle state.

Existing webhook rows remain valid.

Persistence order is:

1. immutable provider payload evidence
2. provider-neutral dispute observation
3. direct reconciliation using provider transaction ID, then provider order ID
4. canonical provider dispute snapshot
5. lifecycle observation only when lifecycle state changed

Unmatched disputes are retained as unmatched/review evidence; matching is never guessed.

## Financial-event discipline

A dispute lifecycle update is not itself a new financial event.

Only a provider object whose type is `chargeback`, with a durable provider transaction ID and amount, is eligible for the chargeback financial projection contract. The projection uses the deterministic idempotency identity:

`next29:dispute:{provider_dispute_id}:chargeback`

Alerts do not project chargeback money. Repeated `dispute.updated` observations do not create new losses merely because status or resolution changed.

M8 defines this projection contract but does not activate a new production ledger writer.

## Webhook integration

M7 already routes dispute webhook events. M8 adds the dispute-specific adapter: the webhook event ID and raw delivery evidence are retained, but the adapter fetches the current dispute from the Admin API before canonical processing. This prevents sparse webhook payloads from replacing richer provider state.

## Out of scope

- scheduler activation
- live webhook registration
- dispute update/write API
- evidence submission to processors
- automatic refund or payment retry actions
- changes to Shopify, Everflow, or Commas runtimes

## Acceptance gate

Dedicated tests cover:

- dispute API paths and filters
- documented normalization
- direct reconciliation keys
- lifecycle fingerprinting
- bounded/resumable historical ingestion
- immutable evidence ordering
- provider-neutral API observation provenance
- webhook current-detail refresh
- deterministic chargeback financial projection
- alerts never becoming chargeback money
- server-only schema access
