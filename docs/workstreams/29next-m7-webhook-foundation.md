# WS-008 — M7 29Next Webhook Foundation

Status: REVIEW pending isolated local regression gate.

## Scope

M7 establishes a webhook receiver foundation only. It does not register a webhook with 29Next, enable production delivery, activate a scheduler, mutate orders/subscriptions/payments, or change Shopify/Everflow/Commas runtime.

## Documented 29Next contract

The 29Next webhook guide documents an envelope containing `object`, `data`, unique `event_id`, `event_type`, `webhook`, and `api_version`. Requests include `X-29Next-Signature`, described as an HMAC-SHA256 signature using the webhook signing secret. Failed non-200 deliveries are retried up to 10 times over several days using exponential backoff, so durable event idempotency is required.

M7 supports the commerce events needed by TraceKit now:

- `order.created`
- `order.updated`
- `transaction.created`
- `transaction.updated`
- `subscription.created`
- `subscription.updated`
- `dispute.created`
- `dispute.updated`

The 29Next docs also state that webhook `data` generally matches the Admin API serializer for the same object. `transaction.created` may include a `subscription` object that identifies a subscription charge and billing cycle.

## Processing order

1. Require tenant/connection/provider-account scope.
2. Verify `X-29Next-Signature` before parsing or persistence.
3. Parse and validate the documented event envelope.
4. Reject unsupported event families and object/event mismatches.
5. Reserve the unique provider `event_id` in the provider-neutral webhook receipt ledger.
6. If already reserved/processed, acknowledge as duplicate without writing evidence or re-running canonical handlers.
7. Persist the exact received JSON bytes as immutable `next29_webhook` evidence.
8. Route the event family to the existing provider-specific canonical ingestion handler.
9. Mark the receipt completed, or failed with a bounded redacted error.

## Persistence

Migration `098_commerce_webhook_receipts_v1.sql` adds a provider-neutral, server-only receipt ledger keyed by connection + provider account + provider + provider event ID. It does not activate delivery or expose receipt state to browser roles.

## Important live-validation item

The documentation describes the signature as being generated from the webhook payload and provides a Python example that parses JSON and serializes it before hashing. M7 verifies the exact received body bytes, which avoids accepting alternate JSON representations. Before production webhook registration, validate this against a real 29Next test webhook and capture the exact signing behavior. If 29Next signs a normalized JSON serialization instead of transmitted bytes, add that documented serialization as a narrowly scoped compatibility path rather than weakening signature checks.

## Exit gate

M7 passes when the dedicated M2–M7 test suite is green. Live registration and test-delivery validation belong to the next activation milestone and are not prerequisites for this code-foundation gate.
