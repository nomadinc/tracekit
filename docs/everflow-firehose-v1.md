# Everflow Firehose v1 operator contract

Everflow Support must configure three event-filtered HTTP Firehose deliveries:

- Clicks: `POST https://webhooks.trace-kit.io/v1/everflow/firehose/clicks`
- Conversions: `POST https://webhooks.trace-kit.io/v1/everflow/firehose/conversions`
- Conversion updates: `POST https://webhooks.trace-kit.io/v1/everflow/firehose/conversion-updates`

Configure this authentication header on each delivery:

- `Authorization: Bearer <EVERFLOW_FIREHOSE_SECRET>`
The endpoint path is the authoritative event discriminator; no custom event-type header or payload-field inference is used. The common `/v1/everflow/firehose` path and impressions are not accepted. Delivery is acknowledged with `202` only after the dedicated `tracekit-everflow-firehose` Queue accepts the bounded envelope. Queue processing has ten retries and routes exhaustion to `tracekit-everflow-firehose-dlq`.

## Fields for Everflow Support

Clicks:

`transaction_id`, `unix_timestamp`, `network_id`, `network_offer_id`, `network_affiliate_id`, `network_advertiser_id`, `network_offer_url_id`, `source_id`, `sub1`, `sub2`, `sub3`, `sub4`, `sub5`, `sub6`, `sub7`, `sub8`, `sub9`, `sub10`, `payout`, `revenue`, `currency_id`, `referer`, `is_test_mode`, `country_code`, `cost`, `session_id`, `coupon_code`, `query_parameters`

Conversions:

`conversion_id`, `transaction_id`, `date`, `click_date`, `network_id`, `network_affiliate_id`, `network_offer_id`, `network_advertiser_id`, `source_id`, `sub1`, `sub2`, `sub3`, `sub4`, `sub5`, `sub6`, `sub7`, `sub8`, `sub9`, `sub10`, `adv1`, `adv2`, `adv3`, `adv4`, `adv5`, `adv6`, `adv7`, `adv8`, `adv9`, `adv10`, `conversion_status`, `event_name`, `payout`, `revenue`, `sale_amount`, `order_id`, `currency_id`, `conversion_timestamp`, `network_offer_url_id`, `query_parameters`

Conversion updates: exactly the conversion field list plus `update_timestamp`.

Do not request impressions, `raw_query_string`, IP addresses, user agents, device details, geolocation, or redirect URLs in v1.

## Routing and ordering

`network_id` must resolve to exactly one active provider account on a connected Everflow connection. The resolved organization, account, connection, and provider-account scope is placed in the internal envelope and revalidated atomically by the database writer. Transaction IDs are never used for tenant routing.

Clicks converge on `(organization_id, connection_id, provider_account_id, transaction_id)`. Conversions converge on `(connection_id, provider_account_id, source_identity)`, where source identity is Everflow's `conversion_id`, independent of poll or Firehose transport.

An update without an original conversion is held in the scoped pending-update table; it never creates a conversion. When the original arrives, the newest pending update is applied. Duplicate and older updates are harmless. `update_timestamp` is authoritative for updates; conversion time is the initial version time. An update lacking `update_timestamp` is explicitly weak ordering evidence, not an equivalent provider version.

## Timestamp interpretation

Click `unix_timestamp`, conversion `conversion_timestamp`, and conversion-update `update_timestamp` accept Everflow's documented numeric or numeric-string Unix epoch seconds and normalize directly to UTC. Everflow's network reporting timezone is not applied to Unix timestamps; it remains relevant only to polling window construction. Conversion `date` is a bounded fallback when `conversion_timestamp` is absent. `click_date` is retained as a provider textual timestamp using the database's UTC interpretation. A missing update timestamp is marked as weak ordering evidence and cannot outrank an existing authoritative provider timestamp; any later timestamped update supersedes it.

## Privacy and health

The receiver never logs payloads. Its bounded snapshot removes IP addresses, user agents, geolocation/device objects, redirect URLs, and raw query strings before queueing. Requested query parameters are retained with bounded keys and values because they are existing attribution evidence.

The server-only health table records receipt, authentication/rejection, malformed input, unknown networks, queue success/failure, processing/replay, persistence failure, and the last receive/process timestamps. Lag is `last_received_at - last_processed_at`; Cloudflare supplies Queue/DLQ depth. Receipt timestamps detect silence/backlog but do not prove provider completeness, so polling remains enabled for bootstrap, reconciliation, repair, and fallback.
