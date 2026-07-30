# Executive Dashboard v2

The `/dashboard` route is TraceKit's story-driven Business Performance dashboard. It consumes a dedicated Worker endpoint, `GET /v1/executive-dashboard`, through the authenticated same-origin Next.js proxy at `/api/executive-dashboard`.

The dashboard does not call processor APIs, run imports, mutate ledgers, or expose secrets.

## Five-Layer Model

The response is organized around the current TraceKit data architecture:

- `business`: commerce facts from `platform_orders`.
- `attribution`: affiliate and source evidence already attached to commerce rows.
- `financial`: normalized financial ledger events from `conversions` plus accrued payout rows from `affiliate_commissions`.
- `operations`: links to existing workspace-wide Financial Health, Financial Imports, and Work Items views.
- `brands`: provisional exact brand evidence from WowBoost raw order payloads.

The existing Profit Engine endpoint remains available for existing consumers. Executive Dashboard v2 does not rely on `include_executive_performance=1`.

## Commerce Definitions

Sales and order metrics come from `platform_orders`, not from financial ledger rows.

`Sales` means valid positive commerce rows with raw WowBoost `Order Type = Regular Order`.

`Orders` means valid positive commerce rows with raw WowBoost `Order Type` in:

- `Regular Order`
- `Upsell Order`
- `Mini Upsell Order`

Both metrics exclude refunded, chargeback, cancelled, voided, failed, declined, abandoned, test, and non-commerce rows. Gross sales revenue uses the same population as Sales. Total order revenue and AOV use the broader Orders population.

Units sold come from `raw_json["Order Quantity (Units Sold)"]` when present, then normalized quantity-style fields, and finally a conservative fallback of `1`.

Customer count is intentionally unavailable unless a row has `person_id`; anonymous rows are not guessed into customer counts.

## Brand Resolver

Brand is provisional until a durable brand dimension exists.

- Source: exact `platform_orders.raw_json.Brand`.
- Missing source: `Unknown brand`.
- No fuzzy matching.
- No campaign, store, or offer fallback.
- Currencies remain separated.

This keeps source evidence explicit and avoids blending products or brands through inferred names.

## Coverage and Staleness

The dashboard reports commerce coverage using the latest imported `platform_orders.order_ts` for the workspace.

If the latest imported order is older than the requested period end, the response returns:

- `partial: true`
- `partial_reasons`
- `filters.coverage.commerce_latest_order_at`
- `filters.coverage.requested_period_end`
- `filters.coverage.is_current: false`

The UI prominently warns that commerce data is incomplete and qualifies sales, orders, revenue, AOV, brand rankings, and affiliate/source rankings. Financial event totals may still display, but they are labeled as financial ledger events and are not treated as complete-profit comparisons against incomplete commerce revenue.

## Financial and Commission Data

Financial leakage uses normalized append-only `conversions` ledger rows:

- `refund`
- `chargeback`
- `chargeback_fee`
- `chargeback_reversal`
- `chargeback_fee_reversal`

These rows do not drive gross sales or order counts.

Accrued affiliate commission uses `affiliate_commissions.commission_amount`, excluding `voided` and `reversed` statuses. Missing commission rows are reported as unavailable, not zero.

`After Affiliate Commission` is:

`gross sales revenue - accrued affiliate commission`

It is not labeled Net Profit because non-commission operating costs are not yet fully represented in this dashboard layer.

## Operational Health

Operational modules reuse existing same-origin authenticated UI proxies:

- `/api/financial-reconciliation`
- `/api/financial-import-monitor`
- `/api/operations/summary`

These modules are workspace-wide unless the underlying service exposes a durable brand dimension.

## Follow-Up Recommendation

Add a brand dimension only after the commerce source can persist stable brand IDs or exact brand evidence across connectors. Until then, `raw_json.Brand` remains the only approved provisional brand resolver.
