# Journey Events Ledger

TraceKit Journey Events are a normalized, append-oriented downstream ledger for customer activity.

The ledger answers:

- what happened
- when it happened
- where it came from
- which person, order, session, or touchpoint it belongs to

`journey_events` does not replace `platform_orders`, `people`, payment transactions, conversions, or profit rollups. Those tables remain authoritative for their current jobs. Journey Events provide a canonical event stream for later attribution, journey UI, analysis, and explanations.

## Idempotency

Journey events are unique by source identity:

```text
workspace_id
source_platform
source_connector
source_record_id
event_type
```

Reprocessing the same source event returns an existing event instead of inserting a duplicate. A different `event_type` for the same source record is allowed. If immutable event fields such as `event_time`, `person_id`, `platform_order_id`, `amount`, `currency`, or `transaction_id` differ for an existing source key, the repository reports a conflict instead of silently overwriting the row.

## Initial Adapter

Sprint 1 maps linked `platform_orders` rows to canonical `purchase` events.

The adapter uses persisted, non-sensitive fields:

- `workspace_id`
- `person_id`
- `platform`
- `platform_order_id`
- `order_id`
- `order_ts`
- `gross_amount` or `receipt_total`
- `currency`
- `transaction_id`
- attribution dimensions such as `affiliate_id`, `everflow_offer_id`, `source_id`, and `sub1` through `sub5`

It intentionally does not copy `raw_json`, email, or phone into journey event metadata.

## Backfill

`POST /v1/journey-events/backfill-platform-orders` processes one bounded keyset batch from linked platform orders and writes purchase events idempotently.

The backfill:

- requires `from` and `to`
- filters by `workspace_id`, platform, `person_id is not null`, `order_ts`, and `platform_order_id`
- stores progress in `integration_import_jobs`
- resumes from a serialized platform/order cursor
- does not alter `platform_orders`
- does not rerun identity resolution

## Timeline

`GET /v1/persons/:person_id/timeline` returns a workspace-scoped chronological timeline ordered by:

```text
event_time ASC, id ASC
```

The API uses a stable cursor and supports `limit`, `cursor`, `event_type`, `from`, and `to`.

Deferred to later sprints:

- attribution models
- result storage
- dashboard/UI work
- session stitching
- browser SDK changes
- connector rewrites
- MCP tools
- AI explanations
