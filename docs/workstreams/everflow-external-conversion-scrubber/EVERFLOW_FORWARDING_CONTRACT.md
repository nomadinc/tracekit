# Certified Everflow Transaction-ID Conversion Contract

Documentation certification date: 2026-09-09

Authoritative reference: [Everflow — Create Conversions with Transaction IDs](https://developers.everflow.io/api-reference/post-networksconversionsreportingtransactionids)

## Transport

- Host: `api.eflow.team`
- URL: `https://api.eflow.team/v1/networks/conversions/reporting/transaction_ids`
- Method: `POST`
- Content type: `application/json`
- Authentication: server-only `X-Eflow-Api-Key`
- TraceKit timeout: 10 seconds

## Required payload

- `offer_id`: integer. The transaction ID must belong to a click for this offer.
- `event_id`: integer; `0` is the default/base conversion.
- `transaction_ids`: array of transaction-ID strings. TraceKit sends exactly one per request.
- `timezone_id`: integer from the connected Everflow network metadata.
- `is_now`: `true` for gateway conversions.

## Optional fields TraceKit sends

- Incoming `amount` maps to documented `revenue_amount` and sets `is_revenue_amount_submitted=true`.
- `is_payout_amount_submitted=false`; the scrubber does not change affiliate payout.
- `order_id`
- `coupon_code`
- `email`
- `adv1` through `adv10`

## Fields intentionally not sent

The selected official endpoint does not document `currency`, `user_ip`, `aid`, or `adv_event_id`; TraceKit does not send them. `event_id` is accepted only as a non-negative integer. `oid` maps to required `offer_id`. `affid` is not sent: affiliate attribution is derived from the original clicked-traffic transaction ID.

## Responses and retry behavior

- HTTP 200 with JSON `{ "result": true }`: success.
- HTTP 200 without `result:true`: permanent `everflow_result_false` failure pending operator review.
- HTTP 401/403: permanent authentication failure.
- HTTP 429 or HTTP 5xx: retryable.
- Network error or 10-second timeout: retryable.
- Other HTTP 4xx: permanent failure.

Response bodies are not persisted wholesale. The ledger records bounded status/error codes and the non-sensitive reference `everflow:result:true`.

## Duplicate behavior

Everflow's reference does not promise idempotency for this operation. TraceKit therefore does not rely on provider duplicate behavior. The atomic local idempotency constraint suppresses a replay before the adapter is called. Certification must confirm one Everflow conversion after replaying the same request through the gateway.

## Safety gate

Real forwarding is reachable only when the server environment contains the exact value:

```text
LIVE_EVERFLOW_FORWARDING_ENABLED=true
```

Absent, lowercase/uppercase variants, and `false` all leave forwarding disabled. The default production build contains no client-side access to the flag or Everflow credential.
