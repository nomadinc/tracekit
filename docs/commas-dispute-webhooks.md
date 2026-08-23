# Commas dispute webhooks

TraceKit receives the two documented Commas lifecycle events at:

`POST https://<TraceKit API host>/v1/connectors/commas/webhooks`

The receiver accepts only `application/json` POST requests. Commas delivers an
envelope with `id`, `type`, `created_at`, and `data`; supported types are
`dispute.created` and `dispute.updated`.

Commas signs the exact raw request body with HMAC-SHA256 and sends the lowercase
hex digest in `x-webhook-signature`. The API Worker secret is
`COMMAS_WEBHOOK_SECRET`; it must contain the `secret_key` returned when the
subscription is created. The secret is never logged or returned.

The receiver first verifies the signature, validates the envelope, and resolves
the single connected Commas connection and active provider account. It writes
the raw bytes to the private `commerce-evidence` bucket, records an immutable
Evidence row, then records a deduplicated webhook event, current dispute
projection, and append-only lifecycle event. Duplicate delivery is acknowledged
without additional writes. No provider request or scheduler path is used.

## Production setup (prepared, not executed)

1. Apply migration `071_commerce_dispute_webhooks_v1.sql` through the reviewed
   production migration process.
2. Store the subscription `secret_key` as the API Worker secret
   `COMMAS_WEBHOOK_SECRET`.
3. Create one Commas webhook subscription using the existing Commas connection
   API key:

```json
{
  "webhook_url": "https://<TraceKit API host>/v1/connectors/commas/webhooks",
  "event_types": ["dispute.created", "dispute.updated"]
}
```

The subscription can be created with `POST /public-api/webhook-subscriptions`
or in the Commas webhook UI. Do not commit the API key or returned secret.

4. Before enabling production delivery, run the existing Commas subscription
   test for each event type against a non-production/staging endpoint using a
   sanitized fixture. Verify a 200 response, one Evidence object, one event,
   one lifecycle row, and that a repeated fixture is acknowledged as a
   duplicate. Never use a real customer payload in committed tests.

The Commas delivery contract is at-most-once, so durable Evidence capture must
complete before the 200 response. Financial ledger events are intentionally
skipped unless a future payload proves a chargeback, fee, reversal, or fee
reversal effect; the receiver does not infer those effects from status alone.
